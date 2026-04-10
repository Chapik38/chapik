import { pool, withTransaction } from '../db/pool.js';
import { HttpError, assert } from '../utils/httpError.js';

const rentFactor = [1, 5, 15, 25, 45];
const rollDice = () => {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
};
const parseJson = (v, fallback = {}) => (v ? (typeof v === 'string' ? JSON.parse(v) : v) : fallback);
async function logEvent(conn, sessionId, actorId, eventType, payload) {
  await conn.query('INSERT INTO event_log (session_id, actor_session_player_id, event_type, payload_json) VALUES (?, ?, ?, ?)', [sessionId, actorId || null, eventType, JSON.stringify(payload || {})]);
}
async function getSessionAndPlayer(conn, sessionId, playerId, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [[session]] = await conn.query(`SELECT * FROM game_session WHERE session_id = ?${suffix}`, [sessionId]);
  assert(session, 404, 'Session not found');
  const [[sessionPlayer]] = await conn.query(`SELECT * FROM session_player WHERE session_id = ? AND player_id = ?${suffix}`, [sessionId, playerId]);
  assert(sessionPlayer, 404, 'Player not found in session');
  return { session, sessionPlayer };
}
async function requireTurn(conn, sessionId, playerId) {
  const { session, sessionPlayer } = await getSessionAndPlayer(conn, sessionId, playerId, true);
  assert(session.status === 'active', 409, 'Session is not active');
  assert(session.current_player_order === sessionPlayer.turn_order, 409, 'Not your turn');
  return { session, sessionPlayer };
}
async function loadCell(conn, boardTemplateId, position) {
  const [[cell]] = await conn.query(`SELECT bc.*, pd.title AS property_title, pd.purchase_price, pd.base_rent FROM board_cell bc LEFT JOIN property_def pd ON pd.property_def_id = bc.property_def_id WHERE bc.board_template_id = ? AND bc.position_no = ?`, [boardTemplateId, position]);
  return cell;
}
async function drawCard(conn, sessionId, deckType) {
  const [[card]] = await conn.query(`SELECT sdc.session_deck_card_id, cc.* FROM session_deck_card sdc JOIN chance_card cc ON cc.card_id = sdc.card_id WHERE sdc.session_id = ? AND sdc.state='in_deck' AND cc.deck_type = ? ORDER BY sdc.deck_order LIMIT 1 FOR UPDATE`, [sessionId, deckType]);
  if (!card) return null;
  await conn.query('UPDATE session_deck_card SET state = ? WHERE session_deck_card_id = ?', ['discarded', card.session_deck_card_id]);
  return card;
}
async function applyCell(conn, session, sessionPlayer, cell) {
  const meta = parseJson(cell.meta_json);
  if (['property', 'railroad', 'utility'].includes(cell.cell_type)) {
    const [[owned]] = await conn.query(`SELECT op.*, pd.title, pd.purchase_price, pd.base_rent FROM owned_property op JOIN property_def pd ON pd.property_def_id = op.property_def_id WHERE op.session_id = ? AND op.property_def_id = ? FOR UPDATE`, [session.session_id, cell.property_def_id]);
    if (!owned.owner_session_player_id) {
      await conn.query('UPDATE game_session SET pending_action = ?, pending_property_def_id = ? WHERE session_id = ?', ['buy_or_auction', cell.property_def_id, session.session_id]);
      await logEvent(conn, session.session_id, sessionPlayer.session_player_id, 'landed_unowned_property', { propertyDefId: cell.property_def_id, title: cell.property_title, price: cell.purchase_price });
      return { actionRequired: 'buy_or_auction' };
    }
    if (owned.owner_session_player_id !== sessionPlayer.session_player_id && !owned.is_mortgaged) {
      const rent = owned.base_rent * (owned.has_hotel ? 75 : rentFactor[owned.house_count] || 1);
      await conn.query('UPDATE session_player SET cash_balance = cash_balance - ? WHERE session_player_id = ?', [rent, sessionPlayer.session_player_id]);
      await conn.query('UPDATE session_player SET cash_balance = cash_balance + ? WHERE session_player_id = ?', [rent, owned.owner_session_player_id]);
      await logEvent(conn, session.session_id, sessionPlayer.session_player_id, 'rent_paid', { rent, propertyDefId: cell.property_def_id, ownerSessionPlayerId: owned.owner_session_player_id });
    }
  } else if (cell.cell_type === 'tax') {
    const amount = Number(meta.amount || 0);
    await conn.query('UPDATE session_player SET cash_balance = cash_balance - ? WHERE session_player_id = ?', [amount, sessionPlayer.session_player_id]);
    await logEvent(conn, session.session_id, sessionPlayer.session_player_id, 'tax_paid', { amount, title: cell.title });
  } else if (cell.cell_type === 'go_to_jail') {
    await conn.query('UPDATE session_player SET board_position = 10, in_jail = TRUE, jail_turns_left = 3 WHERE session_player_id = ?', [sessionPlayer.session_player_id]);
    await logEvent(conn, session.session_id, sessionPlayer.session_player_id, 'sent_to_jail', {});
  } else if (cell.cell_type === 'chance' || cell.cell_type === 'community') {
    const deckType = cell.cell_type === 'chance' ? 'chance' : 'community';
    const card = await drawCard(conn, session.session_id, deckType);
    if (card) {
      const effect = parseJson(card.effect_value);
      if (card.effect_type === 'credit') await conn.query('UPDATE session_player SET cash_balance = cash_balance + ? WHERE session_player_id = ?', [effect.amount, sessionPlayer.session_player_id]);
      if (card.effect_type === 'debit') await conn.query('UPDATE session_player SET cash_balance = cash_balance - ? WHERE session_player_id = ?', [effect.amount, sessionPlayer.session_player_id]);
      if (card.effect_type === 'move_to_position') {
        await conn.query('UPDATE session_player SET board_position = ?, cash_balance = cash_balance + ? WHERE session_player_id = ?', [effect.position, effect.collectStart ? 200 : 0, sessionPlayer.session_player_id]);
      }
      if (card.effect_type === 'go_to_jail') await conn.query('UPDATE session_player SET board_position = 10, in_jail = TRUE, jail_turns_left = 3 WHERE session_player_id = ?', [sessionPlayer.session_player_id]);
      await logEvent(conn, session.session_id, sessionPlayer.session_player_id, 'card_drawn', { deckType, title: card.title, effectType: card.effect_type, effect });
    }
  }
  return { actionRequired: 'none' };
}

export async function getSessionState(sessionId) {
  const [[session]] = await pool.query('SELECT * FROM game_session WHERE session_id = ?', [sessionId]);
  if (!session) throw new HttpError(404, 'Session not found');
  const [players] = await pool.query(`SELECT sp.session_player_id, sp.player_id, pa.login, pa.display_name, sp.turn_order, sp.cash_balance, sp.board_position, sp.is_bankrupt, sp.in_jail, sp.jail_turns_left, sp.last_roll_total, sp.has_rolled_this_turn FROM session_player sp JOIN player_account pa ON pa.player_id = sp.player_id WHERE sp.session_id = ? ORDER BY sp.turn_order`, [sessionId]);
  const [properties] = await pool.query(`SELECT op.*, pd.title, pd.purchase_price, pd.base_rent FROM owned_property op JOIN property_def pd ON pd.property_def_id = op.property_def_id WHERE op.session_id = ? ORDER BY pd.title`, [sessionId]);
  const [events] = await pool.query('SELECT * FROM event_log WHERE session_id = ? ORDER BY event_id DESC LIMIT 20', [sessionId]);
  return { session, players, properties, events };
}

export async function roll(sessionId, playerId) {
  return withTransaction(async (conn) => {
    const { session, sessionPlayer } = await requireTurn(conn, sessionId, playerId);
    assert(session.pending_action === 'none', 409, 'Resolve pending action first');
    assert(!sessionPlayer.has_rolled_this_turn, 409, 'You already rolled this turn');
    const dice = rollDice();
    if (sessionPlayer.in_jail && !dice.isDouble) {
      const left = Math.max(0, sessionPlayer.jail_turns_left - 1);
      await conn.query('UPDATE session_player SET jail_turns_left = ?, has_rolled_this_turn = TRUE, last_roll_total = ? WHERE session_player_id = ?', [left, dice.total, sessionPlayer.session_player_id]);
      if (left === 0) await conn.query('UPDATE session_player SET in_jail = FALSE WHERE session_player_id = ?', [sessionPlayer.session_player_id]);
      await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'jail_roll', dice);
      return { dice, stayedInJail: true };
    }
    const passedStart = sessionPlayer.board_position + dice.total >= 40;
    const newPosition = (sessionPlayer.board_position + dice.total) % 40;
    await conn.query('UPDATE session_player SET board_position = ?, cash_balance = cash_balance + ?, has_rolled_this_turn = TRUE, last_roll_total = ?, in_jail = FALSE, jail_turns_left = 0 WHERE session_player_id = ?', [newPosition, passedStart ? 200 : 0, dice.total, sessionPlayer.session_player_id]);
    const cell = await loadCell(conn, session.board_template_id, newPosition);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'dice_rolled', { ...dice, newPosition, passedStart, cell: { title: cell.title, cellType: cell.cell_type } });
    const resolution = await applyCell(conn, session, sessionPlayer, cell);
    return { dice, position: newPosition, cell, resolution };
  });
}

export async function buyProperty(sessionId, playerId) {
  return withTransaction(async (conn) => {
    const { session, sessionPlayer } = await requireTurn(conn, sessionId, playerId);
    assert(session.pending_action === 'buy_or_auction', 409, 'Nothing to buy');
    const [[property]] = await conn.query(`SELECT op.owned_property_id, pd.property_def_id, pd.title, pd.purchase_price FROM owned_property op JOIN property_def pd ON pd.property_def_id = op.property_def_id WHERE op.session_id = ? AND op.property_def_id = ? FOR UPDATE`, [sessionId, session.pending_property_def_id]);
    assert(sessionPlayer.cash_balance >= property.purchase_price, 409, 'Not enough cash');
    await conn.query('UPDATE session_player SET cash_balance = cash_balance - ? WHERE session_player_id = ?', [property.purchase_price, sessionPlayer.session_player_id]);
    await conn.query('UPDATE owned_property SET owner_session_player_id = ? WHERE owned_property_id = ?', [sessionPlayer.session_player_id, property.owned_property_id]);
    await conn.query('UPDATE game_session SET pending_action = ?, pending_property_def_id = NULL WHERE session_id = ?', ['none', sessionId]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'property_bought', { propertyDefId: property.property_def_id, title: property.title, price: property.purchase_price });
    return { bought: true, property };
  });
}

export async function startAuction(sessionId, playerId) {
  return withTransaction(async (conn) => {
    const { session, sessionPlayer } = await requireTurn(conn, sessionId, playerId);
    assert(session.pending_action === 'buy_or_auction', 409, 'No property for auction');
    const [[ownedProperty]] = await conn.query('SELECT owned_property_id FROM owned_property WHERE session_id = ? AND property_def_id = ? FOR UPDATE', [sessionId, session.pending_property_def_id]);
    const [result] = await conn.query('INSERT INTO auction (session_id, owned_property_id, status, current_bid) VALUES (?, ?, ?, 0)', [sessionId, ownedProperty.owned_property_id, 'active']);
    await conn.query('UPDATE game_session SET pending_action = ? WHERE session_id = ?', ['auction_active', sessionId]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'auction_started', { auctionId: result.insertId });
    return { auctionId: result.insertId };
  });
}

export async function placeBid(sessionId, playerId, bidAmount) {
  return withTransaction(async (conn) => {
    const [[auction]] = await conn.query(`SELECT * FROM auction WHERE session_id = ? AND status = 'active' ORDER BY auction_id DESC LIMIT 1 FOR UPDATE`, [sessionId]);
    assert(auction, 404, 'Active auction not found');
    const [[sessionPlayer]] = await conn.query('SELECT * FROM session_player WHERE session_id = ? AND player_id = ? FOR UPDATE', [sessionId, playerId]);
    assert(sessionPlayer, 404, 'Player not found in session');
    assert(sessionPlayer.cash_balance >= bidAmount, 409, 'Not enough cash');
    assert(bidAmount > auction.current_bid, 409, 'Bid must be higher than current bid');
    await conn.query('UPDATE auction SET current_bid = ?, current_winner_id = ? WHERE auction_id = ?', [bidAmount, sessionPlayer.session_player_id, auction.auction_id]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'auction_bid', { auctionId: auction.auction_id, bidAmount });
    return { accepted: true, bidAmount };
  });
}

export async function finishAuction(sessionId, playerId) {
  return withTransaction(async (conn) => {
    const { sessionPlayer } = await getSessionAndPlayer(conn, sessionId, playerId, true);
    const [[auction]] = await conn.query(`SELECT a.*, op.owned_property_id FROM auction a JOIN owned_property op ON op.owned_property_id = a.owned_property_id WHERE a.session_id = ? AND a.status='active' ORDER BY a.auction_id DESC LIMIT 1 FOR UPDATE`, [sessionId]);
    assert(auction, 404, 'Active auction not found');
    if (auction.current_winner_id) {
      await conn.query('UPDATE session_player SET cash_balance = cash_balance - ? WHERE session_player_id = ?', [auction.current_bid, auction.current_winner_id]);
      await conn.query('UPDATE owned_property SET owner_session_player_id = ? WHERE owned_property_id = ?', [auction.current_winner_id, auction.owned_property_id]);
    }
    await conn.query('UPDATE auction SET status = ?, finished_at = NOW() WHERE auction_id = ?', ['finished', auction.auction_id]);
    await conn.query('UPDATE game_session SET pending_action = ?, pending_property_def_id = NULL WHERE session_id = ?', ['none', sessionId]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'auction_finished', { auctionId: auction.auction_id, winnerSessionPlayerId: auction.current_winner_id, finalBid: auction.current_bid });
    return { finished: true };
  });
}

export async function mortgageProperty(sessionId, playerId, propertyDefId) {
  return withTransaction(async (conn) => {
    const { session, sessionPlayer } = await getSessionAndPlayer(conn, sessionId, playerId, true);
    const [[owned]] = await conn.query(`SELECT op.*, pd.mortgage_value, pd.title FROM owned_property op JOIN property_def pd ON pd.property_def_id = op.property_def_id WHERE op.session_id = ? AND op.property_def_id = ? FOR UPDATE`, [sessionId, propertyDefId]);
    assert(owned.owner_session_player_id === sessionPlayer.session_player_id, 403, 'You do not own this property');
    assert(!owned.is_mortgaged, 409, 'Property already mortgaged');
    await conn.query('UPDATE owned_property SET is_mortgaged = TRUE, mortgage_started_turn = ? WHERE owned_property_id = ?', [session.current_turn_no, owned.owned_property_id]);
    await conn.query('UPDATE session_player SET cash_balance = cash_balance + ? WHERE session_player_id = ?', [owned.mortgage_value, sessionPlayer.session_player_id]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'property_mortgaged', { propertyDefId, title: owned.title, mortgageValue: owned.mortgage_value });
    return { mortgaged: true };
  });
}

export async function endTurn(sessionId, playerId) {
  return withTransaction(async (conn) => {
    const { session, sessionPlayer } = await requireTurn(conn, sessionId, playerId);
    assert(session.pending_action === 'none', 409, 'Resolve pending action first');
    assert(sessionPlayer.has_rolled_this_turn, 409, 'Roll before ending the turn');
    const [players] = await conn.query('SELECT turn_order, is_bankrupt FROM session_player WHERE session_id = ? ORDER BY turn_order', [sessionId]);
    let nextOrder = session.current_player_order;
    for (let i = 0; i < players.length; i += 1) {
      nextOrder = (nextOrder % players.length) + 1;
      const candidate = players.find((p) => p.turn_order === nextOrder);
      if (candidate && !candidate.is_bankrupt) break;
    }
    await conn.query('UPDATE session_player SET has_rolled_this_turn = FALSE, last_roll_total = NULL WHERE session_player_id = ?', [sessionPlayer.session_player_id]);
    await conn.query('UPDATE game_session SET current_turn_no = current_turn_no + 1, current_player_order = ? WHERE session_id = ?', [nextOrder, sessionId]);
    await logEvent(conn, sessionId, sessionPlayer.session_player_id, 'turn_ended', { nextOrder });
    return { nextOrder };
  });
}

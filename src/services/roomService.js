import { z } from 'zod';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { assert } from '../utils/httpError.js';

const createRoomSchema = z.object({ roomName: z.string().min(1).max(128), maxPlayers: z.number().int().min(2).max(6) });

export async function createRoom(ownerPlayerId, payload) {
  const data = createRoomSchema.parse(payload);
  return withTransaction(async (conn) => {
    const [result] = await conn.query('INSERT INTO game_room (owner_player_id, room_name, max_players, status) VALUES (?, ?, ?, ?)', [ownerPlayerId, data.roomName, data.maxPlayers, 'waiting']);
    await conn.query('INSERT INTO room_player (room_id, player_id) VALUES (?, ?)', [result.insertId, ownerPlayerId]);
    const [[room]] = await conn.query('SELECT * FROM game_room WHERE room_id = ?', [result.insertId]);
    return room;
  });
}

export async function listRooms() {
  const [rows] = await pool.query(`SELECT gr.*, COUNT(rp.room_player_id) AS joined_players FROM game_room gr LEFT JOIN room_player rp ON rp.room_id = gr.room_id GROUP BY gr.room_id ORDER BY gr.created_at DESC`);
  return rows;
}

export async function joinRoom(playerId, roomId) {
  return withTransaction(async (conn) => {
    const [[room]] = await conn.query('SELECT * FROM game_room WHERE room_id = ? FOR UPDATE', [roomId]);
    assert(room, 404, 'Room not found');
    assert(room.status === 'waiting', 409, 'Room is not accepting players');
    const [[existing]] = await conn.query('SELECT room_player_id FROM room_player WHERE room_id = ? AND player_id = ?', [roomId, playerId]);
    if (existing) return { joined: true, roomId };
    const [[countRow]] = await conn.query('SELECT COUNT(*) AS cnt FROM room_player WHERE room_id = ?', [roomId]);
    assert(countRow.cnt < room.max_players, 409, 'Room is full');
    await conn.query('INSERT INTO room_player (room_id, player_id) VALUES (?, ?)', [roomId, playerId]);
    return { joined: true, roomId };
  });
}

export async function startRoom(ownerPlayerId, roomId) {
  return withTransaction(async (conn) => {
    const [[room]] = await conn.query('SELECT * FROM game_room WHERE room_id = ? FOR UPDATE', [roomId]);
    assert(room, 404, 'Room not found');
    assert(room.owner_player_id === ownerPlayerId, 403, 'Only room owner can start');
    assert(room.status === 'waiting', 409, 'Room already started');
    const [players] = await conn.query('SELECT player_id FROM room_player WHERE room_id = ? ORDER BY joined_at ASC', [roomId]);
    assert(players.length >= 2, 409, 'At least 2 players are required');
    const [[board]] = await conn.query('SELECT board_template_id FROM board_template WHERE name = ?', ['Classic Monopoly']);
    assert(board, 500, 'Classic board template is missing. Run db:seed first.');
    const rulesJson = JSON.stringify({ mortgage_grace_turns: env.game.mortgageGraceTurns, mortgage_step_percent: env.game.mortgageStepPercent });
    const [sessionResult] = await conn.query(`INSERT INTO game_session (room_id, board_template_id, status, current_turn_no, current_player_order, pending_action, rules_json, started_at) VALUES (?, ?, 'active', 1, 1, 'none', ?, NOW())`, [roomId, board.board_template_id, rulesJson]);
    let order = 1;
    for (const player of players) {
      await conn.query('INSERT INTO session_player (session_id, player_id, turn_order, cash_balance) VALUES (?, ?, ?, ?)', [sessionResult.insertId, player.player_id, order++, env.game.startCash]);
    }
    const [propertyDefs] = await conn.query('SELECT property_def_id FROM property_def ORDER BY property_def_id');
    for (const property of propertyDefs) {
      await conn.query('INSERT INTO owned_property (session_id, property_def_id, owner_session_player_id) VALUES (?, ?, NULL)', [sessionResult.insertId, property.property_def_id]);
    }
    await conn.query('UPDATE game_room SET status = ? WHERE room_id = ?', ['active', roomId]);
    return { sessionId: sessionResult.insertId };
  });
}

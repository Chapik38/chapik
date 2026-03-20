import { pool } from './pool.js';

const properties = [
  ['brown', 'Mediterranean Avenue', 60, 2, 50, 50, 30], ['brown', 'Baltic Avenue', 60, 4, 50, 50, 30],
  ['railroad', 'Reading Railroad', 200, 25, null, null, 100], ['light_blue', 'Oriental Avenue', 100, 6, 50, 50, 50],
  ['light_blue', 'Vermont Avenue', 100, 6, 50, 50, 50], ['light_blue', 'Connecticut Avenue', 120, 8, 50, 50, 60],
  ['utility', 'Electric Company', 150, 20, null, null, 75], ['pink', 'St. Charles Place', 140, 10, 100, 100, 70],
  ['pink', 'States Avenue', 140, 10, 100, 100, 70], ['pink', 'Virginia Avenue', 160, 12, 100, 100, 80],
  ['railroad', 'Pennsylvania Railroad', 200, 25, null, null, 100], ['orange', 'St. James Place', 180, 14, 100, 100, 90],
  ['orange', 'Tennessee Avenue', 180, 14, 100, 100, 90], ['orange', 'New York Avenue', 200, 16, 100, 100, 100],
  ['red', 'Kentucky Avenue', 220, 18, 150, 150, 110], ['red', 'Indiana Avenue', 220, 18, 150, 150, 110],
  ['red', 'Illinois Avenue', 240, 20, 150, 150, 120], ['railroad', 'B. & O. Railroad', 200, 25, null, null, 100],
  ['yellow', 'Atlantic Avenue', 260, 22, 150, 150, 130], ['yellow', 'Ventnor Avenue', 260, 22, 150, 150, 130],
  ['utility', 'Water Works', 150, 20, null, null, 75], ['yellow', 'Marvin Gardens', 280, 24, 150, 150, 140],
  ['green', 'Pacific Avenue', 300, 26, 200, 200, 150], ['green', 'North Carolina Avenue', 300, 26, 200, 200, 150],
  ['green', 'Pennsylvania Avenue', 320, 28, 200, 200, 160], ['railroad', 'Short Line', 200, 25, null, null, 100],
  ['dark_blue', 'Park Place', 350, 35, 200, 200, 175], ['dark_blue', 'Boardwalk', 400, 50, 200, 200, 200]
];
const cards = [
  ['chance', 'Advance to GO', 'Move to Start and collect salary.', 'move_to_position', JSON.stringify({ position: 0, collectStart: true })],
  ['chance', 'Bank pays you dividend', 'Receive 50.', 'credit', JSON.stringify({ amount: 50 })],
  ['community', 'Doctor fee', 'Pay 50.', 'debit', JSON.stringify({ amount: 50 })],
  ['community', 'From sale of stock', 'Receive 50.', 'credit', JSON.stringify({ amount: 50 })],
  ['chance', 'Go to Jail', 'Move directly to jail.', 'go_to_jail', JSON.stringify({ position: 10 })]
];
const cells = [
  [0, 'start', 'GO', null, { salary: 200 }], [1, 'property', 'Mediterranean Avenue', 'Mediterranean Avenue', null], [2, 'community', 'Community Chest', null, null], [3, 'property', 'Baltic Avenue', 'Baltic Avenue', null], [4, 'tax', 'Income Tax', null, { amount: 200 }], [5, 'railroad', 'Reading Railroad', 'Reading Railroad', null], [6, 'property', 'Oriental Avenue', 'Oriental Avenue', null], [7, 'chance', 'Chance', null, null], [8, 'property', 'Vermont Avenue', 'Vermont Avenue', null], [9, 'property', 'Connecticut Avenue', 'Connecticut Avenue', null], [10, 'jail', 'Jail / Just Visiting', null, null], [11, 'property', 'St. Charles Place', 'St. Charles Place', null], [12, 'utility', 'Electric Company', 'Electric Company', null], [13, 'property', 'States Avenue', 'States Avenue', null], [14, 'property', 'Virginia Avenue', 'Virginia Avenue', null], [15, 'railroad', 'Pennsylvania Railroad', 'Pennsylvania Railroad', null], [16, 'property', 'St. James Place', 'St. James Place', null], [17, 'community', 'Community Chest', null, null], [18, 'property', 'Tennessee Avenue', 'Tennessee Avenue', null], [19, 'property', 'New York Avenue', 'New York Avenue', null], [20, 'free_parking', 'Free Parking', null, null], [21, 'property', 'Kentucky Avenue', 'Kentucky Avenue', null], [22, 'chance', 'Chance', null, null], [23, 'property', 'Indiana Avenue', 'Indiana Avenue', null], [24, 'property', 'Illinois Avenue', 'Illinois Avenue', null], [25, 'railroad', 'B. & O. Railroad', 'B. & O. Railroad', null], [26, 'property', 'Atlantic Avenue', 'Atlantic Avenue', null], [27, 'property', 'Ventnor Avenue', 'Ventnor Avenue', null], [28, 'utility', 'Water Works', 'Water Works', null], [29, 'property', 'Marvin Gardens', 'Marvin Gardens', null], [30, 'go_to_jail', 'Go To Jail', null, null], [31, 'property', 'Pacific Avenue', 'Pacific Avenue', null], [32, 'property', 'North Carolina Avenue', 'North Carolina Avenue', null], [33, 'community', 'Community Chest', null, null], [34, 'property', 'Pennsylvania Avenue', 'Pennsylvania Avenue', null], [35, 'railroad', 'Short Line', 'Short Line', null], [36, 'chance', 'Chance', null, null], [37, 'property', 'Park Place', 'Park Place', null], [38, 'tax', 'Luxury Tax', null, { amount: 100 }], [39, 'property', 'Boardwalk', 'Boardwalk', null]
];

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT IGNORE INTO board_template (name, ruleset_version) VALUES (?, ?)', ['Classic Monopoly', 'classic-v1']);
    const [[template]] = await conn.query('SELECT board_template_id FROM board_template WHERE name = ?', ['Classic Monopoly']);
    for (const property of properties) await conn.query('INSERT IGNORE INTO property_def (property_group, title, purchase_price, base_rent, house_price, hotel_price, mortgage_value) VALUES (?, ?, ?, ?, ?, ?, ?)', property);
    for (const [deckType, title, description, effectType, effectValue] of cards) await conn.query('INSERT INTO chance_card (deck_type, title, description, effect_type, effect_value) VALUES (?, ?, ?, ?, ?)', [deckType, title, description, effectType, effectValue]);
    for (const [positionNo, cellType, title, propertyTitle, meta] of cells) {
      let propertyDefId = null;
      if (propertyTitle) {
        const [[row]] = await conn.query('SELECT property_def_id FROM property_def WHERE title = ?', [propertyTitle]);
        propertyDefId = row.property_def_id;
      }
      await conn.query('INSERT INTO board_cell (board_template_id, position_no, cell_type, title, property_def_id, meta_json) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), property_def_id = VALUES(property_def_id), meta_json = VALUES(meta_json)', [template.board_template_id, positionNo, cellType, title, propertyDefId, meta ? JSON.stringify(meta) : null]);
    }
    await conn.commit();
    console.log('Seed completed');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    process.exit(0);
  }
}
main();

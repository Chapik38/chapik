import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
const sql = await fs.readFile(schemaPath, 'utf8');
for (const statement of sql.split(';')) {
  const trimmed = statement.trim();
  if (trimmed) await pool.query(trimmed);
}
console.log('Schema applied');
process.exit(0);

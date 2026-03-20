import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const registerSchema = z.object({
  login: z.string().min(3).max(64),
  displayName: z.string().min(1).max(128),
  password: z.string().min(6).max(100),
  avatarPath: z.string().max(255).optional().nullable()
});
const loginSchema = z.object({ login: z.string().min(3).max(64), password: z.string().min(6).max(100) });
const signToken = (player) => jwt.sign({ playerId: player.player_id, login: player.login }, env.jwtSecret, { expiresIn: '7d' });

export async function register(payload) {
  const data = registerSchema.parse(payload);
  const [[existing]] = await pool.query('SELECT player_id FROM player_account WHERE login = ?', [data.login]);
  if (existing) throw new HttpError(409, 'Login already exists');
  const passwordHash = await bcrypt.hash(data.password, 10);
  const [result] = await pool.query('INSERT INTO player_account (login, display_name, avatar_path, password_hash) VALUES (?, ?, ?, ?)', [data.login, data.displayName, data.avatarPath || null, passwordHash]);
  const [[player]] = await pool.query('SELECT player_id, login, display_name, avatar_path, wins_count, created_at FROM player_account WHERE player_id = ?', [result.insertId]);
  return { token: signToken(player), player };
}

export async function login(payload) {
  const data = loginSchema.parse(payload);
  const [[player]] = await pool.query('SELECT * FROM player_account WHERE login = ?', [data.login]);
  if (!player || !(await bcrypt.compare(data.password, player.password_hash))) throw new HttpError(401, 'Invalid credentials');
  return { token: signToken(player), player: { player_id: player.player_id, login: player.login, display_name: player.display_name, avatar_path: player.avatar_path, wins_count: player.wins_count, created_at: player.created_at } };
}

export async function me(playerId) {
  const [[player]] = await pool.query('SELECT player_id, login, display_name, avatar_path, wins_count, created_at FROM player_account WHERE player_id = ?', [playerId]);
  if (!player) throw new HttpError(404, 'Player not found');
  return player;
}

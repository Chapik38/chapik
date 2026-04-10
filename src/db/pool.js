import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
export const pool = mysql.createPool({ ...env.db, connectionLimit: 10, namedPlaceholders: true });
export async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

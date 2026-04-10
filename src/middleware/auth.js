import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'Missing bearer token'));
  try {
    req.user = jwt.verify(header.slice(7), env.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Invalid token'));
  }
}

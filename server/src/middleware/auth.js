import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';

export const signToken = (u) => jwt.sign({ sub: u.id, email: u.email, name: u.name, role: u.role }, config.jwtSecret, { expiresIn: config.jwtTtl });

export function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: p.sub, email: p.email, name: p.name, role: p.role };
    next();
  } catch {
    next(new HttpError(401, 'Your session has expired — please sign in again'));
  }
}

export function adminOnly(req, _res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Admin access only'));
  next();
}

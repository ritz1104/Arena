import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/errors.js';

export const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });

export async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).lean();
    return user ? { _id: user._id, name: user.name, email: user.email, role: user.role } : null;
  } catch {
    return null;
  }
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = await userFromToken(token);
  if (!user) return next(new AppError('Please sign in.', 401, 'UNAUTHORIZED'));
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError('You do not have permission for this action.', 403, 'FORBIDDEN'));

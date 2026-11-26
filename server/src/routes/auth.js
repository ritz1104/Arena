import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { asyncH, AppError } from '../utils/errors.js';
import { requireAuth, requireRole, signToken } from '../middleware/auth.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

r.post(
  '/login',
  loginLimiter,
  asyncH(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.verify(password))) throw new AppError('Invalid email or password.', 401);
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  })
);

r.get('/me', requireAuth, (req, res) => res.json({ user: { id: req.user._id, ...req.user } }));

r.get(
  '/users',
  requireAuth,
  requireRole('admin'),
  asyncH(async (_req, res) => res.json({ users: await User.find().sort({ createdAt: 1 }).lean() }))
);

r.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  asyncH(async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(8).max(200), role: z.enum(['admin', 'host']) })
      .parse(req.body);
    const user = await User.create(body);
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  })
);

r.put(
  '/password',
  requireAuth,
  asyncH(async (req, res) => {
    const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }).parse(req.body);
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.verify(current))) throw new AppError('Current password is incorrect.', 400);
    user.password = next;
    await user.save();
    res.json({ ok: true });
  })
);

export default r;

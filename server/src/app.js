import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/teams.js';
import { questions, categories } from './routes/questions.js';
import arenaRoutes from './routes/arena.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's (or any) reverse proxy: needed for correct client IPs in rate limiting
  if (config.isProd || process.env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/teams', requireAuth, teamRoutes);
  app.use('/api/questions', requireAuth, questions);
  app.use('/api/categories', requireAuth, categories);
  app.use('/api', requireAuth, arenaRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '1h', fallthrough: false }));

  // Serve the production client build if present
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

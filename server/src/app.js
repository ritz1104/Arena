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
  } else if (config.isProd) {
    // Deployed without building the React app — say so clearly instead of "Cannot GET /"
    console.warn(`[setup] Client build not found at ${config.clientDist}. Build command must be: npm run render-build`);
    app.get('*', (_req, res) =>
      res
        .status(503)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Arena not built</title>' +
            '<body style="font-family:system-ui;background:#100C0D;color:#E3DCD2;padding:40px;line-height:1.6">' +
            '<h2 style="color:#CC8B65">The server is running, but the website was not built.</h2>' +
            '<p>Set the Render <b>Build Command</b> to <code>npm run render-build</code> and the <b>Start Command</b> to <code>npm start</code>, then redeploy.</p>' +
            '<p>API status: <a style="color:#6FBF9C" href="/api/health">/api/health</a></p></body>'
        )
    );
  }

  app.use(errorHandler);
  return app;
}

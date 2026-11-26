import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  // API_PORT for local dev (some launchers set PORT for the web client); PORT on Render / other hosts
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/buzz_or_lose',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret',
  clientOrigin: (process.env.CLIENT_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
  admin: {
    name: process.env.ADMIN_NAME || 'Arena Host',
    email: process.env.ADMIN_EMAIL || 'admin@arena.local',
    password: process.env.ADMIN_PASSWORD || '',
  },
  // Point at a persistent disk in production (e.g. /var/data/uploads on Render) so videos/sounds survive deploys
  uploadDir: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(root, 'uploads'),
  clientDist: path.join(root, '..', 'client', 'dist'),
};

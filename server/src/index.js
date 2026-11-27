import http from 'node:http';
import { config } from './config.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { User, ensureDefaultCategories, getSettings } from './models/index.js';
import { recoverLiveBattle } from './services/battleEngine.js';
import { broadcastState } from './services/broadcast.js';

async function ensureAdmin() {
  if (await User.exists({})) return;
  if (!config.admin.password) {
    console.warn('[setup] No users exist and ADMIN_PASSWORD is not set — set it in server/.env to create the first admin.');
    return;
  }
  await User.create({ name: config.admin.name, email: config.admin.email, password: config.admin.password, role: 'admin' });
  console.log(`[setup] Admin account created for ${config.admin.email} (password from server/.env)`);
}

async function main() {
  await connectDB();
  await ensureDefaultCategories();
  await getSettings();
  await ensureAdmin();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  const live = await recoverLiveBattle();
  if (live) console.log(`[recovery] Live battle #${live.battleNumber} restored (phase: ${live.live.phase})`);
  await broadcastState();

  server.listen(config.port, () => {
    console.log(`\n  BUZZ OR LOSE – THE ARENA  ·  API + realtime on http://localhost:${config.port}\n`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Failed to start server:', e.message);
  process.exit(1);
});

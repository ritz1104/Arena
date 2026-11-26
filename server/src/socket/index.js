import { Server } from 'socket.io';
import { config } from '../config.js';
import { userFromToken } from '../middleware/auth.js';
import { getSettings, Tournament, Battle, Team } from '../models/index.js';
import { setIO, getSnapshot } from '../services/broadcast.js';
import { executeCommand, executeDeviceBuzz } from '../services/commands.js';
import { idStr } from '../utils/random.js';

/**
 * Rooms:
 *  - "hosts":  authenticated admin/host sockets → full state, can send host:cmd
 *  - "public": audience screens + podium buzzers → sanitized state, read-only
 * Podium buzzers authenticate with the buzzer key and can only send "buzzer:press".
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
    pingInterval: 10000,
    pingTimeout: 8000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });
  setIO(io);

  io.use(async (socket, next) => {
    const { token, buzzerKey, side } = socket.handshake.auth || {};
    if (token) {
      const user = await userFromToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
    } else if (buzzerKey) {
      const s = await getSettings();
      if (String(buzzerKey) !== s.buzzerKey || !['A', 'B'].includes(side)) return next(new Error('invalid_buzzer_key'));
      socket.data.buzzSide = side;
    }
    next();
  });

  io.on('connection', async (socket) => {
    const isHost = !!socket.data.user;
    socket.join(isHost ? 'hosts' : 'public');
    const snap = await getSnapshot().catch(() => null);
    if (snap) socket.emit('state', isHost ? snap.host : snap.pub);

    socket.on('sync', async (ack) => {
      const s = await getSnapshot().catch(() => null);
      if (typeof ack === 'function' && s) ack(isHost ? s.host : s.pub);
    });

    socket.on('time:ping', (clientSent, ack) => {
      if (typeof ack === 'function') ack({ clientSent, serverNow: Date.now() });
    });

    if (isHost) {
      socket.on('host:cmd', async (msg, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const result = await executeCommand(String(msg?.type || ''), msg?.payload, { user: socket.data.user });
          reply({ ok: true, result });
        } catch (e) {
          if (!e.status) console.error('[host:cmd]', msg?.type, e);
          reply({ ok: false, error: e.status ? e.message : 'Server error — please try again.', code: e.code });
        }
      });
    }

    if (socket.data.buzzSide) {
      let last = 0;
      socket.on('buzzer:hello', async (ack) => {
        if (typeof ack !== 'function') return;
        const t = await Tournament.findOne({ status: 'active', activeBattle: { $ne: null } }).lean();
        const b = t ? await Battle.findById(t.activeBattle).lean() : null;
        if (!b) return ack({ side: socket.data.buzzSide, team: null });
        const team = await Team.findById(socket.data.buzzSide === 'A' ? b.teamA : b.teamB).select('teamName').lean();
        ack({ side: socket.data.buzzSide, team: team ? { id: idStr(team._id), teamName: team.teamName } : null });
      });
      socket.on('buzzer:press', async (ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const now = Date.now();
        if (now - last < 250) return reply({ accepted: false, reason: 'debounced' });
        last = now;
        try {
          reply(await executeDeviceBuzz(socket.data.buzzSide));
        } catch (e) {
          reply({ accepted: false, reason: e.status ? e.message : 'error' });
        }
      });
    }
  });

  return io;
}

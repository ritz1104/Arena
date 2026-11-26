import { buildSnapshot } from './snapshot.js';

let io = null;
let version = 0;
let cached = null;

export const setIO = (instance) => {
  io = instance;
};
export const getIO = () => io;

/** Transient effects (animations + sounds) for every connected screen. */
export function emitFx(fx) {
  io?.to(['hosts', 'public']).emit('fx', { ...fx, at: Date.now() });
}

/** Host-only live activity feed. */
export function emitActivity(event) {
  io?.to('hosts').emit('activity', event);
}

export function emitLeaderboardChanged() {
  io?.to(['hosts', 'public']).emit('leaderboard:changed', { at: Date.now() });
}

export async function getSnapshot() {
  if (!cached) {
    const snap = await buildSnapshot();
    version += 1;
    snap.host.version = version;
    snap.pub.version = version;
    cached = snap;
  }
  const now = Date.now();
  return { host: { ...cached.host, serverNow: now }, pub: { ...cached.pub, serverNow: now } };
}

/** Rebuilds the authoritative snapshot and pushes it: full state to hosts, sanitized state to public. */
export async function broadcastState() {
  cached = null;
  const snap = await getSnapshot();
  if (io) {
    io.to('hosts').emit('state', snap.host);
    io.to('public').emit('state', snap.pub);
  }
  return snap;
}

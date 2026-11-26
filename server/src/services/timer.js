import { runExclusive } from './lock.js';

/**
 * Server-authoritative countdown. The deadline (`endsAt`) is persisted on the battle,
 * so it survives page refreshes and server restarts; this module only holds the
 * in-memory setTimeout that fires when the deadline passes.
 */
let handle = null;
let onExpire = null;

export const setExpiryHandler = (fn) => {
  onExpire = fn;
};

export function clearBattleTimer() {
  if (handle) clearTimeout(handle);
  handle = null;
}

export function scheduleTimer(battle) {
  clearBattleTimer();
  const tm = battle?.live?.timer;
  if (!battle || battle.status !== 'active' || !tm?.running || !tm.endsAt) return;
  const endsAt = new Date(tm.endsAt).getTime();
  const delay = Math.max(0, endsAt - Date.now()) + 25;
  const battleId = String(battle._id);
  const kind = tm.kind;
  handle = setTimeout(() => {
    handle = null;
    if (!onExpire) return;
    runExclusive(() => onExpire(battleId, kind, endsAt)).catch((e) => console.error('[timer]', e));
  }, delay);
}

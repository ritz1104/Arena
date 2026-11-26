import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { api, auth, newActionId } from '../lib/api.js';
import { sound, FX_SOUND } from '../lib/sound.js';

const LiveCtx = createContext(null);

/**
 * Realtime connection to the arena.
 *  role="host"     → authenticated; receives full state; can send commands.
 *  role="audience" → anonymous; receives sanitized read-only state.
 *  role="buzzer"   → podium device; authenticates with the buzzer key.
 */
export function LiveProvider({ role = 'audience', buzzer, children }) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState(null);
  const [lbVersion, setLbVersion] = useState(0);
  const [activity, setActivity] = useState([]);
  const offsetRef = useRef(0);
  const socketRef = useRef(null);
  const fxListeners = useRef(new Set());
  const [pending, setPending] = useState({});

  useEffect(() => {
    sound.setRole(role === 'host' ? 'host' : 'audience');
    fetch('/api/public/sound')
      .then((r) => r.json())
      .then((c) => sound.configure(c))
      .catch(() => {});

    const authPayload = role === 'host' ? { token: auth.token } : role === 'buzzer' ? { buzzerKey: buzzer?.key, side: buzzer?.side } : {};
    const socket = io({ auth: authPayload, transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    socketRef.current = socket;

    const syncClock = () => {
      const sent = Date.now();
      socket.emit('time:ping', sent, ({ serverNow }) => {
        const rtt = Date.now() - sent;
        offsetRef.current = serverNow + rtt / 2 - Date.now();
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      setConnError(null);
      syncClock();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (e) => {
      setConnected(false);
      setConnError(e.message);
    });
    socket.on('state', (s) => {
      if (!socketRef.current?.connected || !offsetRef.current) offsetRef.current = s.serverNow - Date.now();
      setState(s);
    });
    socket.on('fx', (fx) => {
      if (FX_SOUND[fx.type]) sound.play(FX_SOUND[fx.type]);
      fxListeners.current.forEach((fn) => fn(fx));
    });
    socket.on('leaderboard:changed', () => setLbVersion((v) => v + 1));
    socket.on('sound:config', (c) => sound.configure(c));
    socket.on('activity', (ev) => setActivity((list) => [ev, ...list].slice(0, 60)));
    const clockTimer = setInterval(syncClock, 30000);

    return () => {
      clearInterval(clockTimer);
      socket.disconnect();
    };
  }, [role, buzzer?.key, buzzer?.side]);

  // Audio may only start after a user gesture
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const onFx = useCallback((fn) => {
    fxListeners.current.add(fn);
    return () => fxListeners.current.delete(fn);
  }, []);

  /** Send a host command. Resolves with the result or rejects; errors are toasted. */
  const send = useCallback(async (type, payload = {}, { key = type, success, silent } = {}) => {
    const socket = socketRef.current;
    setPending((p) => ({ ...p, [key]: true }));
    const body = { ...payload };
    if (type === 'battle.mark' || type === 'battle.adjust') body.actionId = body.actionId || newActionId();
    try {
      let reply;
      if (socket?.connected) {
        reply = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not respond. Check the connection.' }), 10000);
          socket.emit('host:cmd', { type, payload: body }, (r) => {
            clearTimeout(timer);
            resolve(r);
          });
        });
      } else {
        reply = await api('/live/command', { method: 'POST', body: { type, payload: body } }).catch((e) => ({ ok: false, error: e.message }));
      }
      if (!reply?.ok) throw new Error(reply?.error || 'Command failed');
      if (reply.result?.warning) toast(reply.result.warning, { icon: '⚠️' });
      if (success) toast.success(success);
      return reply.result;
    } catch (e) {
      if (!silent) toast.error(e.message);
      throw e;
    } finally {
      setPending((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  }, []);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const socket = socketRef;

  const value = useMemo(
    () => ({ role, state, connected, connError, send, pending, onFx, now, lbVersion, activity, socket }),
    [role, state, connected, connError, send, pending, onFx, now, lbVersion, activity, socket]
  );
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export const useLive = () => useContext(LiveCtx);

export function useFx(handler) {
  const { onFx } = useLive();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onFx((fx) => ref.current(fx)), [onFx]);
}

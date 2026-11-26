import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth, setUnauthorizedHandler } from '../lib/api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    auth.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!auth.token) {
      setReady(true);
      return;
    }
    let cancelled = false;
    let timer;
    // Only a real 401 signs the host out; if the server is restarting or unreachable,
    // keep the session and retry so a live event is never interrupted by a blip.
    const check = (attempt = 0) =>
      api('/auth/me')
        .then((d) => !cancelled && (setUser(d.user), setReady(true)))
        .catch((e) => {
          if (cancelled) return;
          if (e.status === 401) {
            auth.clear();
            setReady(true);
          } else {
            timer = setTimeout(() => check(attempt + 1), Math.min(5000, 800 * (attempt + 1)));
          }
        });
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    auth.set(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

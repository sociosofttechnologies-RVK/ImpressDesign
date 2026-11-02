import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return null; }
    try {
      const me = await api('/me');
      setUser(me.user);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onExpired = () => setUser(null);
    window.addEventListener('impress-auth-expired', onExpired);
    return () => window.removeEventListener('impress-auth-expired', onExpired);
  }, [refresh]);

  const value = useMemo(() => ({
    user,
    ready,
    isAdmin: user?.role === 'admin',
    refresh,
    async login(email, password) {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.token); setUser(r.user); return r.user;
    },
    async register(data) {
      const r = await api('/auth/register', { method: 'POST', body: data });
      setToken(r.token); setUser(r.user); return r.user;
    },
    /** After a profile change: store the refreshed token and user. */
    applyProfile(r) { if (r?.token) setToken(r.token); if (r?.user) setUser(r.user); },
    logout() { setToken(null); setUser(null); },
  }), [user, ready, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

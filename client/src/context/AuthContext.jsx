// Session state for the whole app.
//
// On load, if a token is stored, the context hydrates the user from
// GET /users/me - so a refresh keeps you logged in, and a stale or expired
// token is discarded silently. The API client dispatches "auth:logout" when
// any request comes back 401 with a token attached; the context listens and
// drops the user, which sends ProtectedRoute back to the login screen.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    async function hydrate() {
      if (!getToken()) {
        setInitializing(false);
        return;
      }
      try {
        const { data } = await api.get('/users/me');
        setUser(data.user);
      } catch {
        setToken(null);
      } finally {
        setInitializing(false);
      }
    }
    hydrate();
  }, []);

  useEffect(() => {
    const onForcedLogout = () => setUser(null);
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

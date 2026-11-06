import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const data = await api('/auth/me'); setUser(data.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user); return data.user;
  };
  const register = async (payload) => {
    const data = await api('/auth/register', { method: 'POST', body: payload });
    setUser(data.user); return data;
  };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} setUser(null); };
  return <AuthContext.Provider value={{ user, setUser, loading, refresh, login, register, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

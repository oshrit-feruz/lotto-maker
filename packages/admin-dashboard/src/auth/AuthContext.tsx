import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { clearTokens, getStoredRefreshToken, refreshSession, setOnAuthLost } from '../api/client';

interface AuthState {
  status: 'loading' | 'out' | 'in';
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');

  useEffect(() => {
    setOnAuthLost(() => {
      clearTokens();
      setStatus('out');
    });
    if (getStoredRefreshToken()) {
      void refreshSession().then((ok) => setStatus(ok ? 'in' : 'out'));
    } else {
      setStatus('out');
    }
    return () => setOnAuthLost(null);
  }, []);

  const login = useCallback(async (phone: string, code: string) => {
    await authApi.verifyOtp(phone, code);
    setStatus('in');
  }, []);
  const logout = useCallback(async () => {
    await authApi.logout();
    setStatus('out');
  }, []);

  const value = useMemo(() => ({ status, login, logout }), [status, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

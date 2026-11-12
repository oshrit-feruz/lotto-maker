import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth';
import { clearTokens, setOnAuthLost } from '../api/client';

interface AuthState {
  status: 'out' | 'in';
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Tokens are kept in memory only (see api/client.ts), so every page load starts logged out.
 * Leaving a session drops all cached query data so the next admin never sees the previous one's.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('out');

  const dropCache = useCallback(async () => {
    await qc.cancelQueries();
    qc.removeQueries();
  }, [qc]);

  useEffect(() => {
    setOnAuthLost(() => {
      clearTokens();
      void dropCache().finally(() => setStatus('out'));
    });
    return () => setOnAuthLost(null);
  }, [dropCache]);

  const login = useCallback(async (phone: string, code: string) => {
    await authApi.verifyOtp(phone, code);
    setStatus('in');
  }, []);
  const logout = useCallback(async () => {
    const revoked = authApi.logout(); // forgets the tokens synchronously, revokes in the background
    await dropCache();
    setStatus('out');
    await revoked;
  }, [dropCache]);

  const value = useMemo(() => ({ status, login, logout }), [status, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

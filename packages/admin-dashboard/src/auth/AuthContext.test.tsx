import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import { api, clearTokens, hasSession } from '../api/client';

const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.sig`;
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <span data-testid="status">{auth.status}</span>;
}

function setup() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
beforeEach(() => {
  clearTokens();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider', () => {
  it('starts logged out (tokens are not persisted across reloads)', () => {
    setup();
    expect(screen.getByTestId('status')).toHaveTextContent('out');
  });

  it('rejects a non-admin login with a Hebrew error and keeps no tokens', async () => {
    setup();
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: jwt({ type: 'user' }), refreshToken: 'r', isNewUser: false }));
    fetchMock.mockResolvedValue(json(204));
    await expect(act(() => auth.login('+972500000000', '123456'))).rejects.toThrow('המספר אינו מורשה כמנהל');
    expect(screen.getByTestId('status')).toHaveTextContent('out');
    expect(hasSession()).toBe(false);
  });

  it('drops all cached queries on logout', async () => {
    const qc = setup();
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: jwt({ type: 'admin' }), refreshToken: 'r', isNewUser: false }));
    await act(() => auth.login('+972500000000', '123456'));
    expect(screen.getByTestId('status')).toHaveTextContent('in');
    qc.setQueryData(['users'], [{ id: 'u1' }]);
    fetchMock.mockResolvedValue(json(204));
    await act(() => auth.logout());
    expect(screen.getByTestId('status')).toHaveTextContent('out');
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(hasSession()).toBe(false);
  });

  it('drops cached queries when auth is lost', async () => {
    const qc = setup();
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: jwt({ type: 'admin' }), refreshToken: 'r', isNewUser: false }));
    await act(() => auth.login('+972500000000', '123456'));
    qc.setQueryData(['draws'], []);
    fetchMock.mockResolvedValue(json(401));
    await act(async () => {
      await api.get('/admin/draws').catch(() => {});
    });
    await vi.waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('out'));
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});

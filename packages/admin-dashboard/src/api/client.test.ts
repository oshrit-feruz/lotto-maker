import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  clearTokens,
  decodeJwtPayload,
  getRefreshToken,
  hasSession,
  isAdminAccessToken,
  NOT_ADMIN_MESSAGE,
  refreshSession,
  setOnAuthLost,
  startSession,
} from './client';

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: object) => `h.${b64url(JSON.stringify(payload))}.sig`;
const admin = (n: number) => ({ accessToken: jwt({ sub: 'a', type: 'admin', n }), refreshToken: `r${n}` });

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const authHeader = (call: number) => (fetchMock.mock.calls[call]![1].headers as Record<string, string>).Authorization;

beforeEach(() => {
  clearTokens();
  setOnAuthLost(null);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json(204));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('JWT role check', () => {
  it('decodes base64url payloads, including non-ASCII', () => {
    expect(decodeJwtPayload(jwt({ type: 'admin', name: 'אושר?>' }))).toEqual({ type: 'admin', name: 'אושר?>' });
    expect(decodeJwtPayload('garbage')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });
  it('accepts only type=admin', () => {
    expect(isAdminAccessToken(jwt({ type: 'admin' }))).toBe(true);
    expect(isAdminAccessToken(jwt({ type: 'operator' }))).toBe(false);
    expect(isAdminAccessToken(jwt({ type: 'user' }))).toBe(false);
    expect(isAdminAccessToken('nope')).toBe(false);
  });
});

describe('startSession', () => {
  it('rejects a non-admin token, keeps nothing and revokes it', () => {
    const t = { accessToken: jwt({ type: 'user' }), refreshToken: 'ru' };
    expect(() => startSession(t)).toThrow(NOT_ADMIN_MESSAGE);
    expect(hasSession()).toBe(false);
    expect(getRefreshToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({ method: 'DELETE' }));
  });
  it('keeps an admin token in memory only', () => {
    startSession(admin(1));
    expect(hasSession()).toBe(true);
    expect(getRefreshToken()).toBe('r1');
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});

describe('refreshSession', () => {
  it('discards a refresh result that arrives after the session ended', async () => {
    startSession(admin(1));
    const d = deferred<Response>();
    fetchMock.mockReturnValueOnce(d.promise);
    const p = refreshSession();
    clearTokens();
    d.resolve(json(200, admin(2)));
    expect(await p).toBe(false);
    expect(hasSession()).toBe(false);
    expect(getRefreshToken()).toBeNull();
  });

  it('does not let a new session join an old session’s refresh', async () => {
    startSession(admin(1));
    const d = deferred<Response>();
    fetchMock.mockReturnValueOnce(d.promise).mockResolvedValueOnce(json(200, admin(3)));
    const old = refreshSession();
    startSession(admin(2));
    const fresh = refreshSession();
    expect(fresh).not.toBe(old);
    expect(await fresh).toBe(true);
    d.resolve(json(200, admin(9)));
    expect(await old).toBe(false);
    expect(getRefreshToken()).toBe('r3');
  });

  it('ends the session when the refreshed token is not an admin token', async () => {
    const lost = vi.fn();
    setOnAuthLost(lost);
    startSession(admin(1));
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: jwt({ type: 'operator' }), refreshToken: 'ro' }));
    expect(await refreshSession()).toBe(false);
    expect(hasSession()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('request 401 handling', () => {
  it('retries once with the refreshed token of the same session', async () => {
    startSession(admin(1));
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, admin(2)))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(api.get('/x')).resolves.toEqual({ ok: 1 });
    expect(authHeader(0)).toBe(`Bearer ${admin(1).accessToken}`);
    expect(authHeader(2)).toBe(`Bearer ${admin(2).accessToken}`);
  });

  it('does not resend with another session’s token, nor log that session out', async () => {
    const lost = vi.fn();
    setOnAuthLost(lost);
    startSession(admin(1));
    const refresh = deferred<Response>();
    fetchMock.mockResolvedValueOnce(json(401)).mockReturnValueOnce(refresh.promise);
    const p = api.get('/x');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    startSession(admin(5)); // another admin logs in while the refresh is in flight
    refresh.resolve(json(200, admin(2)));
    await expect(p).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lost).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe('r5');
  });

  it('reports auth lost when the refresh fails in the current session', async () => {
    const lost = vi.fn();
    setOnAuthLost(lost);
    startSession(admin(1));
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(401));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

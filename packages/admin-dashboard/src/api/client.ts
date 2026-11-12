const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// The backend returns tokens in the response body (no cookie). Both tokens live only in these
// module variables, never in Web Storage, so a script injected into the page cannot read a
// long-lived admin refresh token from storage. The cost is that a page reload logs the admin
// out; that is acceptable for an internal tool.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onAuthLost: (() => void) | null = null;

// Bumped whenever the session changes (login, logout, auth lost). Async work that started under
// an older generation must not store tokens or act on behalf of the new session.
let generation = 0;
let refreshing: { gen: number; promise: Promise<boolean> } | null = null;

export const NOT_ADMIN_MESSAGE = 'המספר אינו מורשה כמנהל';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function setOnAuthLost(fn: (() => void) | null) {
  onAuthLost = fn;
}
export function getRefreshToken(): string | null {
  return refreshToken;
}
export function getSessionGeneration(): number {
  return generation;
}
export function hasSession(): boolean {
  return accessToken !== null;
}

/** Decodes a JWT payload (base64url JSON). No signature check: the server verifies every request. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The backend marks admin access tokens with `type: 'admin'` (see auth.service.ts). */
export function isAdminAccessToken(token: string): boolean {
  return decodeJwtPayload(token)?.type === 'admin';
}

/** Ends the current session: forgets the tokens and invalidates in-flight work from it. */
export function clearTokens() {
  generation++;
  accessToken = null;
  refreshToken = null;
  refreshing = null;
}

/** Best-effort server-side revocation of a token pair this client no longer keeps. Never throws. */
export async function revokeTokens(t: TokenPair): Promise<void> {
  try {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.accessToken}` },
      body: JSON.stringify({ refreshToken: t.refreshToken }),
    });
  } catch {
    /* best effort */
  }
}
const revokeQuietly = (t: TokenPair) => void revokeTokens(t);

/** Ends the session and returns its tokens (if any) so the caller can revoke them. */
export function takeTokens(): TokenPair | null {
  const t = accessToken && refreshToken ? { accessToken, refreshToken } : null;
  clearTokens();
  return t;
}

/**
 * Starts a new session from a login response. Throws (and stores nothing) unless the access
 * token belongs to an admin.
 */
export function startSession(t: TokenPair) {
  clearTokens();
  if (!isAdminAccessToken(t.accessToken)) {
    revokeQuietly(t);
    throw new ApiError(403, 'NOT_ADMIN', NOT_ADMIN_MESSAGE);
  }
  accessToken = t.accessToken;
  refreshToken = t.refreshToken;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toError(res: Response, body: unknown): ApiError {
  const b = (typeof body === 'object' && body !== null ? body : {}) as { error?: string; message?: string };
  return new ApiError(res.status, b.error ?? 'HTTP_ERROR', b.message ?? b.error ?? `שגיאה ${res.status}`);
}

/**
 * Rotates the refresh token. Concurrent callers in the same session share one request (refresh
 * tokens are single-use). A result that arrives after the session changed is discarded, and a
 * refreshed token that is not an admin token ends the session.
 */
export function refreshSession(): Promise<boolean> {
  const stored = refreshToken;
  if (!stored) return Promise.resolve(false);
  const gen = generation;
  if (refreshing && refreshing.gen === gen) return refreshing.promise;
  const promise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok || gen !== generation) return false;
      const t = (await res.json()) as TokenPair;
      if (gen !== generation) return false;
      if (!isAdminAccessToken(t.accessToken)) {
        clearTokens();
        revokeQuietly(t);
        onAuthLost?.();
        return false;
      }
      accessToken = t.accessToken;
      refreshToken = t.refreshToken;
      return true;
    } catch {
      return false;
    } finally {
      if (refreshing?.gen === gen) refreshing = null; // at most one refresh per generation
    }
  })();
  refreshing = { gen, promise };
  return promise;
}

export type Query = Record<string, string | number | undefined | null>;

export async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query; auth?: boolean } = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const qstr = qs.toString();
  const url = `${BASE_URL}${path}${qstr ? `?${qstr}` : ''}`;
  const authed = opts.auth !== false;
  const gen = generation;

  const send = () => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken && authed) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
    });
  };

  let res = await send();
  if (res.status === 401 && authed && gen === generation) {
    // Only retry when the refresh succeeded within the session this request was made for;
    // otherwise the retry would carry a different session's token.
    if ((await refreshSession()) && gen === generation) res = await send();
    // A 401 from an old session must not log out the session that replaced it.
    if (res.status === 401 && gen === generation) onAuthLost?.();
  }
  const body = await parse(res);
  if (!res.ok) throw toError(res, body);
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, query ? { query } : {}),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body !== undefined ? { body } : {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body !== undefined ? { body } : {}),
};

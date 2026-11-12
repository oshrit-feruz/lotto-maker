const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const REFRESH_KEY = 'admin_refresh_token';

// The backend returns tokens in the response body (no cookie), so the refresh token lives in
// sessionStorage and the access token only in memory.
let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function setOnAuthLost(fn: (() => void) | null) {
  onAuthLost = fn;
}
export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}
export function storeTokens(t: { accessToken: string; refreshToken: string }) {
  accessToken = t.accessToken;
  sessionStorage.setItem(REFRESH_KEY, t.refreshToken);
}
export function clearTokens() {
  accessToken = null;
  sessionStorage.removeItem(REFRESH_KEY);
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

/** Rotates the refresh token. Concurrent callers share one request (refresh tokens are single-use). */
export function refreshSession(): Promise<boolean> {
  const stored = getStoredRefreshToken();
  if (!stored) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      if (!res.ok) return false;
      storeTokens((await res.json()) as { accessToken: string; refreshToken: string });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
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
  if (res.status === 401 && authed && (await refreshSession())) res = await send();
  if (res.status === 401 && authed) onAuthLost?.();
  const body = await parse(res);
  if (!res.ok) throw toError(res, body);
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, query ? { query } : {}),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body !== undefined ? { body } : {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body !== undefined ? { body } : {}),
};

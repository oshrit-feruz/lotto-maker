// Token storage: both JWTs live in httpOnly cookies set by our own route
// handlers (/api/auth/*). Browser code never sees a token; it calls
// /api/proxy/*, which adds the Authorization header server-side and refreshes
// the access token when it expires.
import type { NextRequest, NextResponse } from 'next/server';
import { apiBaseUrl } from './config';

export const ACCESS_COOKIE = 'lm_at';
export const REFRESH_COOKIE = 'lm_rt';

// Backend: access token 15m, refresh token 30d. The cookie expires a minute early.
const ACCESS_MAX_AGE = 14 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Lax, not Strict: the return from the hosted payment page is a cross-site
  // top-level navigation and must arrive logged in.
  sameSite: 'lax' as const,
  path: '/',
};

export function setSessionCookies(res: NextResponse, tokens: Tokens): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: ACCESS_MAX_AGE });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 });
}

/** Exchanges the refresh token for a new pair. Null when the backend refuses it. */
export async function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Tokens>;
    return data.accessToken && data.refreshToken
      ? { accessToken: data.accessToken, refreshToken: data.refreshToken }
      : null;
  } catch {
    return null;
  }
}

/**
 * CSRF guard for state-changing requests: the Origin (or Referer) must be this
 * site. Together with SameSite=Lax cookies this blocks cross-site form posts.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const source = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, error: string, message?: string) {
  return Response.json({ error, ...(message ? { message } : {}) }, { status, headers: { 'cache-control': 'no-store' } });
}

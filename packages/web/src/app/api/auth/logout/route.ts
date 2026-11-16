import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/config';
import { REFRESH_COOKIE, clearSessionCookies, isSameOrigin, jsonError } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'FORBIDDEN_ORIGIN');
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    // Best effort: revoke the refresh token on the backend. DELETE /auth/logout needs only the
    // refresh token (no access token), returns 204, and ignores an invalid or revoked token.
    // Cookies are cleared either way.
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}

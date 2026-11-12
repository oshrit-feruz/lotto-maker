import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/config';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, isSameOrigin, jsonError, refreshTokens } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'FORBIDDEN_ORIGIN');
  let accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  let refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    if (!accessToken) {
      const fresh = await refreshTokens(refreshToken);
      accessToken = fresh?.accessToken;
      refreshToken = fresh?.refreshToken ?? refreshToken;
    }
    if (accessToken) {
      // Best effort: revoke the refresh token on the backend. Cookies are cleared either way.
      await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      }).catch(() => undefined);
    }
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}

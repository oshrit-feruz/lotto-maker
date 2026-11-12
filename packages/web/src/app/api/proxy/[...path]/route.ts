import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/config';
import { isProxyAllowed } from '@/lib/proxy-allowlist';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  isSameOrigin,
  jsonError,
  refreshTokens,
  setSessionCookies,
  type Tokens,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: { path: string[] } };

async function handle(req: NextRequest, { params }: Ctx): Promise<Response> {
  const method = req.method.toUpperCase();
  const path = params.path.join('/');
  if (!isProxyAllowed(method, path)) return jsonError(404, 'NOT_FOUND');
  if (method !== 'GET' && !isSameOrigin(req)) return jsonError(403, 'FORBIDDEN_ORIGIN');

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  let accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  let refreshed: Tokens | null = null;
  let refreshFailed = false;

  const doRefresh = async () => {
    if (!refreshToken || refreshed || refreshFailed) return;
    refreshed = await refreshTokens(refreshToken);
    if (refreshed) accessToken = refreshed.accessToken;
    else refreshFailed = true;
  };

  if (!accessToken) await doRefresh();

  const body = method === 'GET' ? undefined : await req.text();
  const target = `${apiBaseUrl()}/${path}${req.nextUrl.search}`;
  const idempotencyKey = req.headers.get('idempotency-key');

  const forward = () =>
    fetch(target, {
      method,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body || undefined,
      cache: 'no-store',
    });

  let upstream: Response;
  try {
    upstream = await forward();
    if (upstream.status === 401 && refreshToken && !refreshed && !refreshFailed) {
      await doRefresh();
      if (refreshed) upstream = await forward();
    }
  } catch {
    return jsonError(502, 'BACKEND_UNAVAILABLE');
  }

  const out = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
  if (refreshed) setSessionCookies(out, refreshed);
  else if (refreshFailed) clearSessionCookies(out);
  return out;
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };

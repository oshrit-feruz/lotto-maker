import type { NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Whether a session cookie exists. The token itself is never returned. */
export function GET(req: NextRequest) {
  return Response.json(
    { authenticated: Boolean(req.cookies.get(REFRESH_COOKIE)?.value) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

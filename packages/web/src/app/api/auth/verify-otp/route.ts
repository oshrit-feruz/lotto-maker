import { NextResponse, type NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/config';
import { isSameOrigin, jsonError, setSessionCookies, type Tokens } from '@/lib/session';

/** Verifies the OTP and stores the tokens in httpOnly cookies. Returns only isNewUser. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'FORBIDDEN_ORIGIN');
  const body = await req.text();
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
  } catch {
    return jsonError(502, 'BACKEND_UNAVAILABLE');
  }
  const text = await res.text();
  if (!res.ok) {
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
  }
  const data = JSON.parse(text) as Tokens & { isNewUser?: boolean };
  const out = NextResponse.json({ isNewUser: Boolean(data.isNewUser) }, { headers: { 'cache-control': 'no-store' } });
  setSessionCookies(out, data);
  return out;
}

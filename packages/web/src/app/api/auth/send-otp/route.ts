import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/config';
import { isSameOrigin, jsonError } from '@/lib/session';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'FORBIDDEN_ORIGIN');
  const body = await req.text();
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/send-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return jsonError(502, 'BACKEND_UNAVAILABLE');
  }
}

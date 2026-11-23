import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/session';

/** Pages that need a session. The backend still checks every call. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(REFRESH_COOKIE)?.value) return NextResponse.next();
  // The hosted card page may send only its iframe to the return page, and a cross-site frame
  // navigation carries no SameSite=Lax cookie. Let it load: it only moves the whole window to
  // the same URL (with the cookie) and fetches nothing itself.
  if (req.nextUrl.pathname.startsWith('/payment/') && req.headers.get('sec-fetch-dest') === 'iframe') {
    return NextResponse.next();
  }
  const login = new URL('/login', req.url);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/checkout', '/payment/:path*', '/account', '/account/:path*'],
};

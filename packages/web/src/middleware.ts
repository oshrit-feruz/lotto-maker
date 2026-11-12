import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/session';

/** Pages that need a session. The backend still checks every call. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(REFRESH_COOKIE)?.value) return NextResponse.next();
  const login = new URL('/login', req.url);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/ticket', '/checkout', '/payment/:path*', '/account', '/account/:path*'],
};

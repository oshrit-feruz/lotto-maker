import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFRESH_COOKIE } from './session';

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Pages that need a session call this first; the backend still checks every call. It replaces the
 * former middleware.ts: on Vercel Services a service cannot have Routing Middleware (Next.js
 * middleware is an Edge function, which a service may not emit), so the check runs in the page.
 */
export function requireSession(path: string, searchParams?: SearchParams): void {
  if (cookies().get(REFRESH_COOKIE)?.value) return;
  // The hosted card page may send only its iframe to the return page, and a cross-site frame
  // navigation carries no SameSite=Lax cookie. Let it load: it only moves the whole window to
  // the same URL (with the cookie) and fetches nothing itself.
  if (path.startsWith('/payment/') && headers().get('sec-fetch-dest') === 'iframe') return;
  redirect(loginPath(path, searchParams));
}

/** `/login?next=<path and query>`, the URL the login page returns to (checked by safeNextPath). */
export function loginPath(path: string, searchParams?: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const search = query.toString();
  return `/login?${new URLSearchParams({ next: search ? `${path}?${search}` : path }).toString()}`;
}

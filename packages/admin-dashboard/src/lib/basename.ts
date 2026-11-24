/**
 * React Router basename from Vite's BASE_URL ("/" or "/admin/").
 * The trailing slash is dropped: with basename "/admin/" the URL "/admin" matches nothing and the
 * app renders blank. "/admin" matches both "/admin" and "/admin/...".
 */
export function routerBasename(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') || '/';
}

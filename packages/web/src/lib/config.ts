/** Brand name, from the environment. Never Mifal HaPais's name. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'שליח לוטו';

/**
 * Backend base URL (no trailing slash). Used server-side only, by SSR pages and
 * the proxy. NEXT_PUBLIC_API_URL is inlined at build time; API_URL, read at
 * runtime, can override it per deployment (e.g. an internal address).
 */
export function apiBaseUrl(): string {
  const runtime = process.env['API_URL'];
  return (runtime?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Israeli responsible-gaming helpline (the national addiction helpline). */
export const HELPLINE = '118';

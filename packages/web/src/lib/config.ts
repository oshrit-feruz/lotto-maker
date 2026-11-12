/** Brand name, from the environment. Never Mifal HaPais's name. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'שליח לוטו';

/** Backend base URL (no trailing slash). Used server-side by SSR pages and the proxy. */
export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Israeli responsible-gaming helpline (the national addiction helpline). */
export const HELPLINE = '118';

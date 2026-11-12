import { apiBaseUrl } from './config';

/**
 * Public (unauthenticated) GET against the backend, for server-rendered pages.
 * Returns null instead of throwing, so a backend outage degrades the page
 * instead of breaking it.
 */
export async function publicGet<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      next: { revalidate: revalidateSeconds },
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

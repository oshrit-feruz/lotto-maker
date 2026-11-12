import { apiBaseUrl } from './config';

export type PublicResult<T> =
  | { ok: true; data: T }
  /** `status` 0 means the backend could not be reached. `code` is the backend's error code, if any. */
  | { ok: false; status: number; code: string | null };

/**
 * Public (unauthenticated) GET against the backend, for server-rendered pages.
 * Never throws, so a backend outage degrades the page instead of breaking it,
 * and tells an expected "nothing yet" 404 apart from an outage.
 */
export async function publicFetch<T>(path: string, revalidateSeconds = 60): Promise<PublicResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      next: { revalidate: revalidateSeconds },
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      let code: string | null = null;
      try {
        const body = (await res.json()) as { error?: unknown };
        code = typeof body?.error === 'string' ? body.error : null;
      } catch {
        code = null;
      }
      return { ok: false, status: res.status, code };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

/** Like publicFetch, but any failure is just null. */
export async function publicGet<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  const r = await publicFetch<T>(path, revalidateSeconds);
  return r.ok ? r.data : null;
}

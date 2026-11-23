/**
 * Outbound HTTP for third-party gateways (SMS, payments): a hard timeout over the whole exchange
 * and a bounded body read. No retries here: callers decide what is safe to repeat.
 */

/** What a caller sees of the HTTP response: the body is already read (and bounded). */
export interface BoundedHttpResponse {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * The request did not complete (timeout or network failure). `reason` never contains the URL,
 * the body or any credential, so it is safe to log and to wrap in a provider's own error.
 */
export class HttpRequestFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'HttpRequestFailure';
  }
}

export const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Sends a request with a hard timeout that covers the whole exchange, response body included,
 * so a gateway that sends headers and then stalls cannot hold the request open. The body is
 * read incrementally and the read is cancelled past `maxBytes`. A timeout or network failure
 * becomes an HttpRequestFailure without the request details.
 */
export async function fetchBounded(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<BoundedHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await readBounded(res, maxBytes);
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    if (controller.signal.aborted) throw new HttpRequestFailure(`timeout after ${timeoutMs}ms`);
    const kind = err instanceof Error ? err.name : 'unknown';
    throw new HttpRequestFailure(`network error (${kind})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most `maxBytes` of the body, then cancels the stream. */
async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - size;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        size = maxBytes;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Escapes text for an XML element or attribute value. */
export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

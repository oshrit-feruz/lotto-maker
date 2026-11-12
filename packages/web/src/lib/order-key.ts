// The Idempotency-Key sent with POST /orders. One key per ticket: it is created the first time
// the ticket is ordered and kept in sessionStorage until the order succeeds, so a retry or a
// reload after the payment page sends the same key and the backend answers with the original
// order (`replayed: true`) instead of charging again. Editing the ticket gets a new key.
import type { TicketInput } from '@lotto-maker/shared';

const KEY = 'lm_order_key';

export type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface StoredKey {
  key: string;
  /** The ticket the key belongs to. */
  ticket: string;
}

function sessionStore(): KeyStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** A random key, 8–128 printable ASCII characters as the backend requires. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older browsers without randomUUID still have getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stable text form of the ticket's content: what makes it "the same ticket" for the key. */
export function ticketSignature(input: TicketInput): string {
  return JSON.stringify({
    type: input.type,
    systematicType: input.systematicType ?? null,
    extra: Boolean(input.extra),
    drawCount: input.drawCount,
    tables: input.tables.map((t) => ({ numbers: [...t.numbers], strongNumbers: [...t.strongNumbers] })),
  });
}

function read(store: KeyStorage): StoredKey | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredKey;
    return typeof v?.key === 'string' && typeof v?.ticket === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * The key for ordering `input`: the stored one when it belongs to this ticket, otherwise a new
 * one, which is stored. Without storage it still returns a key (good for this attempt only).
 */
export function orderKeyFor(
  input: TicketInput,
  store: KeyStorage | null = sessionStore(),
  generate: () => string = newIdempotencyKey,
): string {
  const ticket = ticketSignature(input);
  const stored = store ? read(store) : null;
  if (stored && stored.ticket === ticket) return stored.key;
  const key = generate();
  try {
    store?.setItem(KEY, JSON.stringify({ key, ticket } satisfies StoredKey));
  } catch {
    // Storage full or blocked: the key still protects this attempt.
  }
  return key;
}

/** Forgets the key: after the order succeeded, or when the backend refused it (IDEMPOTENCY_KEY_REUSED). */
export function clearOrderKey(store: KeyStorage | null = sessionStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // ignore
  }
}

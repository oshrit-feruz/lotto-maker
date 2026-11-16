import { describe, expect, it } from 'vitest';
import type { TicketInput } from '@lotto-maker/shared';
import { clearOrderKey, orderKeyFor, ticketSignature, type KeyStorage } from './order-key';
import { checkoutReturnUrls } from './orders';

function memoryStorage(): KeyStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const ticket = (over: Partial<TicketInput> = {}): TicketInput => ({
  type: 'regular',
  systematicType: null,
  extra: false,
  drawCount: 1,
  tables: [
    { numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [1] },
    { numbers: [7, 8, 9, 10, 11, 12], strongNumbers: [2] },
  ],
  ...over,
});

function counter() {
  let n = 0;
  return () => `key-${String(++n).padStart(4, '0')}`;
}

describe('orderKeyFor', () => {
  it('creates a key once per ticket and reuses it until cleared', () => {
    const store = memoryStorage();
    const gen = counter();
    const first = orderKeyFor(ticket(), store, gen);
    expect(first).toBe('key-0001');
    // A retry, or a reload after the payment page, sends the same key.
    expect(orderKeyFor(ticket(), store, gen)).toBe(first);
    expect(orderKeyFor(ticket(), store, gen)).toBe(first);
  });

  it('survives a "reload": a new call with the same storage reads the stored key', () => {
    const store = memoryStorage();
    const first = orderKeyFor(ticket(), store, counter());
    const afterReload = orderKeyFor(ticket(), store, () => 'never-used');
    expect(afterReload).toBe(first);
  });

  it('gives an edited ticket a new key', () => {
    const store = memoryStorage();
    const gen = counter();
    const first = orderKeyFor(ticket(), store, gen);
    const edited = orderKeyFor(ticket({ extra: true }), store, gen);
    expect(edited).not.toBe(first);
    const otherNumbers = orderKeyFor(
      ticket({ tables: [{ numbers: [1, 2, 3, 4, 5, 7], strongNumbers: [1] }, ticket().tables[1]!] }),
      store,
      gen,
    );
    expect(otherNumbers).not.toBe(edited);
    expect(orderKeyFor(ticket({ drawCount: 2 }), store, gen)).not.toBe(otherNumbers);
  });

  it('starts over after clearOrderKey (order succeeded, or IDEMPOTENCY_KEY_REUSED)', () => {
    const store = memoryStorage();
    const gen = counter();
    const first = orderKeyFor(ticket(), store, gen);
    clearOrderKey(store);
    expect(store.data.size).toBe(0);
    expect(orderKeyFor(ticket(), store, gen)).not.toBe(first);
  });

  it('ignores a corrupt stored value', () => {
    const store = memoryStorage();
    store.setItem('lm_order_key', '{not json');
    expect(orderKeyFor(ticket(), store, () => 'fresh-key-1')).toBe('fresh-key-1');
  });

  it('still returns a key without storage', () => {
    expect(orderKeyFor(ticket(), null, () => 'no-store-key')).toBe('no-store-key');
  });

  it('makes keys the backend accepts (8–128 printable ASCII)', () => {
    const store = memoryStorage();
    const key = orderKeyFor(ticket(), store);
    expect(key).toMatch(/^[\x21-\x7e]{8,128}$/);
  });

  it('signs the ticket content, not object identity', () => {
    expect(ticketSignature(ticket())).toBe(ticketSignature(ticket()));
    expect(ticketSignature(ticket())).not.toBe(ticketSignature(ticket({ type: 'double' })));
  });
});

describe('checkoutReturnUrls', () => {
  it('points the hosted page back to the payment pages on this origin', () => {
    expect(checkoutReturnUrls('https://example.co.il')).toEqual({
      successUrl: 'https://example.co.il/payment/success',
      cancelUrl: 'https://example.co.il/payment/canceled',
    });
    expect(checkoutReturnUrls('http://localhost:3002/').successUrl).toBe('http://localhost:3002/payment/success');
  });
});

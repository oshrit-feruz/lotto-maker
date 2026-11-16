import { describe, expect, it } from 'vitest';
import { describeQuote, quoteMatches, quotePath } from './withdrawal-quote';
import type { WithdrawalQuote } from './types';

const norm = (s: string) => s.replace(/[‎‏ \s]/g, '');

const quote = (over: Partial<WithdrawalQuote> = {}): WithdrawalQuote => ({
  amount: '100.00',
  method: 'bank',
  fee: '25.00',
  net: '75.00',
  min: '10.00',
  belowMinimum: false,
  ...over,
});

describe('quotePath', () => {
  it('builds the quote query for a valid amount', () => {
    expect(quotePath('100', 'bank')).toBe('wallet/withdrawals/quote?amount=100&method=bank');
    expect(quotePath(' 12.5 ', 'card')).toBe('wallet/withdrawals/quote?amount=12.5&method=card');
  });
  it('asks nothing for an empty, zero, malformed or too large amount', () => {
    expect(quotePath('', 'card')).toBeNull();
    expect(quotePath('0', 'card')).toBeNull();
    expect(quotePath('0.00', 'card')).toBeNull();
    expect(quotePath('1.234', 'card')).toBeNull();
    expect(quotePath('1.', 'card')).toBeNull();
    expect(quotePath('abc', 'card')).toBeNull();
    expect(quotePath('100001', 'card')).toBeNull();
  });
});

describe('quoteMatches', () => {
  it('accepts the quote for the same amount and method only', () => {
    expect(quoteMatches(quote(), '100', 'bank')).toBe(true);
    expect(quoteMatches(quote(), '100.0', 'bank')).toBe(true);
    expect(quoteMatches(quote(), '10', 'bank')).toBe(false);
    expect(quoteMatches(quote(), '100', 'card')).toBe(false);
    expect(quoteMatches(null, '100', 'bank')).toBe(false);
  });
});

describe('describeQuote', () => {
  it('shows amount, bank fee and net', () => {
    const d = describeQuote(quote());
    expect(d.lines.map((l) => [l.label, norm(l.value)])).toEqual([
      ['סכום המשיכה', '₪100.00'],
      ['עמלת העברה בנקאית', '₪25.00'],
      ['תקבלו', '₪75.00'],
    ]);
    expect(d.problem).toBeNull();
    expect(d.canSubmit).toBe(true);
  });

  it('says "no fee" for a card withdrawal', () => {
    const d = describeQuote(quote({ method: 'card', fee: '0.00', net: '100.00' }));
    expect(d.lines[1]).toEqual({ label: 'עמלה', value: 'ללא עמלה' });
    expect(norm(d.lines[2]!.value)).toBe('₪100.00');
  });

  it('blocks an amount below the minimum and names the minimum', () => {
    const d = describeQuote(quote({ amount: '5.00', method: 'card', fee: '0.00', net: '5.00', belowMinimum: true }));
    expect(d.canSubmit).toBe(false);
    expect(norm(d.problem!)).toContain('₪10.00');
    expect(d.problem).toContain('המינימלי');
  });

  it('blocks a bank amount the fee eats up, and says so', () => {
    const d = describeQuote(quote({ amount: '20.00', fee: '25.00', net: '0.00', belowMinimum: true }));
    expect(d.canSubmit).toBe(false);
    expect(d.problem).toContain('העמלה');
    expect(norm(d.lines[2]!.value)).toBe('₪0.00');
  });
});

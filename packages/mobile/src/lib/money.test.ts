import { describe, it, expect } from 'vitest';
import { formatTxAmount, txDirection } from './money.js';

// [case, type, amount, expected]
const cases: Array<[string, string, string | number, string]> = [
  ['debit sent as a negative string', 'charge', '-14.50', '-₪14.50'],
  ['debit sent as a negative number', 'charge', -14.5, '-₪14.50'],
  ['debit sent as a positive magnitude', 'charge', '14.5', '-₪14.50'],
  ['withdrawal hold', 'withdrawal_hold', '100', '-₪100.00'],
  ['refund reversal', 'refund_reversal', '20', '-₪20.00'],
  ['deposit', 'deposit', '50', '+₪50.00'],
  ['winning', 'winning', '12.3', '+₪12.30'],
  ['refund', 'refund', '14.50', '+₪14.50'],
  ['withdrawal release', 'withdrawal_release', '100', '+₪100.00'],
  ['negative amount on a credit type is a debit', 'deposit', '-5', '-₪5.00'],
  ['negative amount on an unknown type is a debit', 'mystery', '-5', '-₪5.00'],
  ['unknown type with a positive amount has no sign', 'mystery', '5', '₪5.00'],
];

describe('formatTxAmount', () => {
  it.each(cases)('%s', (_name, type, amount, expected) => {
    expect(formatTxAmount(type, amount)).toBe(expected);
  });

  it('has no direction for an unknown type with a positive amount', () => {
    expect(txDirection('mystery', '5')).toBeNull();
  });
});

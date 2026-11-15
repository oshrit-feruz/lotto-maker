import { describe, it, expect } from 'vitest';
import { formatTxAmount, txDirection } from './money.js';

describe('formatTxAmount', () => {
  it('shows one minus for a debit sent as a negative amount', () => {
    expect(formatTxAmount('charge', '-14.50')).toBe('-₪14.50');
    expect(formatTxAmount('charge', -14.5)).toBe('-₪14.50');
  });

  it('shows one minus for a debit sent as a positive magnitude', () => {
    expect(formatTxAmount('charge', '14.5')).toBe('-₪14.50');
    expect(formatTxAmount('withdrawal_hold', '100')).toBe('-₪100.00');
    expect(formatTxAmount('refund_reversal', '20')).toBe('-₪20.00');
  });

  it('shows a plus for credits', () => {
    expect(formatTxAmount('deposit', '50')).toBe('+₪50.00');
    expect(formatTxAmount('winning', '12.3')).toBe('+₪12.30');
    expect(formatTxAmount('refund', '14.50')).toBe('+₪14.50');
    expect(formatTxAmount('withdrawal_release', '100')).toBe('+₪100.00');
  });

  it('treats a negative amount as a debit whatever the type', () => {
    expect(formatTxAmount('deposit', '-5')).toBe('-₪5.00');
    expect(formatTxAmount('mystery', '-5')).toBe('-₪5.00');
  });

  it('shows no sign for an unknown type with a positive amount', () => {
    expect(formatTxAmount('mystery', '5')).toBe('₪5.00');
    expect(txDirection('mystery', '5')).toBeNull();
  });
});

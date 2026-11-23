import { describe, expect, it } from 'vitest';
import { POLL_LIMIT, nextReturnStep } from './payment-return';

describe('nextReturnStep', () => {
  it('orders an approved payment on the success page only', () => {
    expect(nextReturnStep('approved', 'success', 1)).toBe('order');
    expect(nextReturnStep('approved', 'canceled', 1)).toBe('approved');
  });

  it('treats a declined or refunded payment as failed on both pages', () => {
    for (const mode of ['success', 'canceled'] as const) {
      expect(nextReturnStep('failed', mode, 1)).toBe('failed');
      expect(nextReturnStep('refunded', mode, 1)).toBe('failed');
    }
  });

  it('checks a pending payment once on the canceled page', () => {
    expect(nextReturnStep('pending', 'canceled', 1)).toBe('failed');
  });

  it('polls a pending payment on the success page up to the limit', () => {
    expect(nextReturnStep('pending', 'success', 1)).toBe('poll');
    expect(nextReturnStep('pending', 'success', POLL_LIMIT - 1)).toBe('poll');
    expect(nextReturnStep('pending', 'success', POLL_LIMIT)).toBe('timeout');
  });
});

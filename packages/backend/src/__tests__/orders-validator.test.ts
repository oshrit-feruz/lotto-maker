import { describe, it, expect } from 'vitest';
import { validateGameNumbers } from '../modules/orders/orders.validator.js';

describe('validateGameNumbers', () => {
  describe('lotto', () => {
    it('accepts valid lotto numbers', () => {
      expect(() => validateGameNumbers('lotto', [1, 5, 10, 20, 30, 37], 3)).not.toThrow();
    });

    it('rejects wrong count', () => {
      expect(() => validateGameNumbers('lotto', [1, 2, 3, 4, 5], 1)).toThrow('exactly 6');
    });

    it('rejects duplicates', () => {
      expect(() => validateGameNumbers('lotto', [1, 1, 2, 3, 4, 5], 1)).toThrow('unique');
    });

    it('rejects out-of-range numbers', () => {
      expect(() => validateGameNumbers('lotto', [0, 1, 2, 3, 4, 5], 1)).toThrow();
      expect(() => validateGameNumbers('lotto', [1, 2, 3, 4, 5, 38], 1)).toThrow();
    });

    it('rejects missing strong number', () => {
      expect(() => validateGameNumbers('lotto', [1, 2, 3, 4, 5, 6])).toThrow('strong number');
    });

    it('rejects out-of-range strong number', () => {
      expect(() => validateGameNumbers('lotto', [1, 2, 3, 4, 5, 6], 8)).toThrow();
    });
  });

  describe('seven77', () => {
    it('accepts valid seven77 numbers', () => {
      expect(() => validateGameNumbers('seven77', [1, 10, 20, 30, 40, 50, 70])).not.toThrow();
    });

    it('does not require strong number', () => {
      expect(() => validateGameNumbers('seven77', [1, 2, 3, 4, 5, 6, 7])).not.toThrow();
    });

    it('rejects wrong count', () => {
      expect(() => validateGameNumbers('seven77', [1, 2, 3, 4, 5, 6])).toThrow('exactly 7');
    });
  });

  describe('one23', () => {
    it('accepts valid 123 numbers', () => {
      expect(() => validateGameNumbers('one23', [1, 5, 9])).not.toThrow();
    });

    it('rejects numbers above pool', () => {
      expect(() => validateGameNumbers('one23', [1, 5, 10])).toThrow();
    });
  });
});

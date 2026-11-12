import { describe, expect, it } from 'vitest';
import { isValidIsraeliId, normalizeIsraeliId } from './israeli-id';

describe('normalizeIsraeliId', () => {
  it('pads short ids to 9 digits', () => {
    expect(normalizeIsraeliId('12345')).toBe('000012345');
  });
  it('ignores spaces and dashes', () => {
    expect(normalizeIsraeliId(' 123-456-782 ')).toBe('123456782');
  });
  it('rejects non-digits and too-long input', () => {
    expect(normalizeIsraeliId('12a456789')).toBeNull();
    expect(normalizeIsraeliId('1234567890')).toBeNull();
    expect(normalizeIsraeliId('')).toBeNull();
  });
});

describe('isValidIsraeliId', () => {
  it('accepts ids with a correct check digit', () => {
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('000000018')).toBe(true);
    expect(isValidIsraeliId('18')).toBe(true);
    expect(isValidIsraeliId('039337423')).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('039337424')).toBe(false);
  });
  it('rejects all zeros and malformed input', () => {
    expect(isValidIsraeliId('000000000')).toBe(false);
    expect(isValidIsraeliId('abc')).toBe(false);
    expect(isValidIsraeliId('1234567890')).toBe(false);
  });
});

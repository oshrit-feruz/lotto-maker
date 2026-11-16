import { describe, expect, it } from 'vitest';
import { formatCount, formatShekel, formatShortDateTime } from './format';
import { formatPhoneLocal } from './phone';

describe('formatShekel', () => {
  it('puts the minus before the shekel sign', () => {
    expect(formatShekel('-100')).toBe('-₪100.00');
    expect(formatShekel(1234.5)).toBe('₪1,234.50');
    expect(formatShekel(null)).toBe('—');
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    expect(formatCount(57052)).toBe('57,052');
    expect(formatCount('1234567')).toBe('1,234,567');
    expect(formatCount(15)).toBe('15');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(undefined)).toBe('—');
  });
});

describe('formatShortDateTime', () => {
  it('formats in Asia/Jerusalem without a weekday or comma, on one line', () => {
    expect(formatShortDateTime('2026-11-11T06:10:00.000Z')).toBe('11.11.2026 08:10'); // +02:00
    expect(formatShortDateTime('2026-07-01T21:05:00.000Z')).toBe('02.07.2026 00:05'); // +03:00
    expect(formatShortDateTime('2026-11-11T06:10:00.000Z')).not.toContain(',');
    expect(formatShortDateTime(null)).toBe('—');
    expect(formatShortDateTime('nope')).toBe('—');
  });
});

describe('formatPhoneLocal', () => {
  it('shows an Israeli E.164 number locally', () => {
    expect(formatPhoneLocal('+972501234567')).toBe('050-1234567');
    expect(formatPhoneLocal('972541234567')).toBe('054-1234567');
    expect(formatPhoneLocal('+97221234567')).toBe('02-1234567');
    expect(formatPhoneLocal('+14155550100')).toBe('+14155550100');
    expect(formatPhoneLocal(null)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { formatCount, formatDate, formatDayInput, formatNis } from './format';
import { formatPhoneLocal } from './phone';

describe('formatNis', () => {
  it('puts the minus before the shekel sign', () => {
    expect(formatNis('-14.5')).toBe('-₪14.50');
    expect(formatNis(-1234.5)).toBe('-₪1,234.50');
    expect(formatNis('142.50')).toBe('₪142.50');
    expect(formatNis(0)).toBe('₪0.00');
    expect(formatNis('abc')).toBe('₪0.00');
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    expect(formatCount(57052)).toBe('57,052');
    expect(formatCount('1234567')).toBe('1,234,567');
    expect(formatCount(12)).toBe('12');
  });
});

describe('formatDate', () => {
  it('formats in Asia/Jerusalem as dd/mm/yyyy HH:mm with zero padding', () => {
    expect(formatDate('2026-11-11T06:10:00.000Z')).toBe('11/11/2026\u00a008:10'); // winter, +02:00
    expect(formatDate('2026-07-01T21:05:00.000Z')).toBe('02/07/2026\u00a000:05'); // summer, +03:00
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nope')).toBe('—');
  });
});

describe('formatDayInput', () => {
  it('shows a date input value as dd/mm/yyyy', () => {
    expect(formatDayInput('2026-11-05')).toBe('05/11/2026');
    expect(formatDayInput('')).toBe('');
    expect(formatDayInput('2026-1-5')).toBe('');
  });
});

describe('formatPhoneLocal', () => {
  it('shows an Israeli E.164 number locally', () => {
    expect(formatPhoneLocal('+972501234567')).toBe('050-1234567');
    expect(formatPhoneLocal('+97221234567')).toBe('02-1234567');
    expect(formatPhoneLocal('+14155550100')).toBe('+14155550100');
    expect(formatPhoneLocal(null)).toBe('');
  });
});

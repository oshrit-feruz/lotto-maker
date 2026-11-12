import { describe, expect, it } from 'vitest';
import { toE164IsraeliMobile } from './phone';

describe('toE164IsraeliMobile', () => {
  it('converts local formats', () => {
    expect(toE164IsraeliMobile('050-1234567')).toBe('+972501234567');
    expect(toE164IsraeliMobile('0501234567')).toBe('+972501234567');
    expect(toE164IsraeliMobile('054 123 4567')).toBe('+972541234567');
  });
  it('keeps international formats', () => {
    expect(toE164IsraeliMobile('+972501234567')).toBe('+972501234567');
    expect(toE164IsraeliMobile('972501234567')).toBe('+972501234567');
  });
  it('rejects landlines and junk', () => {
    expect(toE164IsraeliMobile('03-1234567')).toBeNull();
    expect(toE164IsraeliMobile('05012345')).toBeNull();
    expect(toE164IsraeliMobile('hello')).toBeNull();
  });
});

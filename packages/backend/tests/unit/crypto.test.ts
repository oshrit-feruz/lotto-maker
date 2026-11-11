import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  decodeKey,
  decryptField,
  encryptField,
  hashField,
  isValidIsraeliId,
  normalizeIsraeliId,
} from '../../src/lib/crypto.js';

const key = randomBytes(32);
const otherKey = randomBytes(32);

describe('encryptField / decryptField', () => {
  it('round-trips a value', () => {
    const encrypted = encryptField('123456782', key);
    expect(encrypted).not.toContain('123456782');
    expect(decryptField(encrypted, key)).toBe('123456782');
  });

  it('round-trips with the configured (default) key', () => {
    expect(decryptField(encryptField('039337423'))).toBe('039337423');
  });

  it('produces a different ciphertext every time', () => {
    expect(encryptField('123456782', key)).not.toBe(encryptField('123456782', key));
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptField('123456782', key);
    expect(() => decryptField(encrypted, otherKey)).toThrow();
  });

  it('fails to decrypt a modified ciphertext', () => {
    const encrypted = encryptField('123456782', key);
    const raw = Buffer.from(encrypted.slice(3), 'base64');
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0x01;
    expect(() => decryptField(`v1:${raw.toString('base64')}`, key)).toThrow();
    expect(() => decryptField('not-a-ciphertext', key)).toThrow();
  });
});

describe('hashField', () => {
  it('is deterministic for the same value and key', () => {
    expect(hashField('123456782', key)).toBe(hashField('123456782', key));
    expect(hashField('123456782')).toBe(hashField('123456782'));
    expect(hashField('123456782', key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs per value and per key', () => {
    expect(hashField('123456782', key)).not.toBe(hashField('039337423', key));
    expect(hashField('123456782', key)).not.toBe(hashField('123456782', otherKey));
  });
});

describe('decodeKey', () => {
  it('accepts exactly 32 bytes of base64', () => {
    expect(decodeKey(key.toString('base64'))).toEqual(key);
    expect(() => decodeKey(randomBytes(16).toString('base64'))).toThrow();
    expect(() => decodeKey('short')).toThrow();
  });
});

describe('Israeli ID validation', () => {
  it('accepts IDs with a correct check digit', () => {
    for (const id of ['123456782', '039337423', '987654324', '111111118']) {
      expect(isValidIsraeliId(id), id).toBe(true);
    }
  });

  it('left-pads short IDs with zeros before checking', () => {
    expect(normalizeIsraeliId('39337423')).toBe('039337423');
    expect(isValidIsraeliId('39337423')).toBe(true);
    expect(isValidIsraeliId('18')).toBe(true); // 000000018
  });

  it('rejects a wrong check digit', () => {
    for (const id of ['123456789', '111111111', '987654321', '039337424']) {
      expect(isValidIsraeliId(id), id).toBe(false);
    }
  });

  it('rejects malformed input', () => {
    for (const id of ['', '000000000', '1234567890', '12345678a', '12-345678', ' ']) {
      expect(isValidIsraeliId(id), JSON.stringify(id)).toBe(false);
    }
    expect(normalizeIsraeliId('1234567890')).toBeNull();
  });
});

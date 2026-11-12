import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Decodes a base64 key and checks it is exactly 32 bytes (AES-256). */
export function decodeKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('Key must be 32 bytes, base64-encoded');
  return key;
}

// Outside production a missing key falls back to a fixed, publicly known one so
// local setups work without ceremony. config.ts refuses to start production without real keys.
function resolveKey(value: string | undefined, label: string): Buffer {
  if (value) return decodeKey(value);
  if (config.NODE_ENV === 'production') throw new Error(`${label} is not configured`);
  return createHash('sha256').update(`lotto-maker dev-only ${label}`).digest();
}

let encryptionKey: Buffer | undefined;
let hashKey: Buffer | undefined;
const idEncryptionKey = () => (encryptionKey ??= resolveKey(config.ID_ENCRYPTION_KEY, 'ID_ENCRYPTION_KEY'));
const idHashKey = () => (hashKey ??= resolveKey(config.ID_HASH_KEY, 'ID_HASH_KEY'));

/**
 * AES-256-GCM with a random 96-bit IV. Output: "v1:" + base64(iv | authTag | ciphertext).
 * The same plaintext encrypts differently every time, so ciphertexts cannot be compared.
 */
export function encryptField(plaintext: string, key: Buffer = idEncryptionKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
}

/** Throws if the key is wrong or the value was modified. */
export function decryptField(payload: string, key: Buffer = idEncryptionKey()): string {
  const [version, body] = payload.split(':');
  if (version !== VERSION || !body) throw new Error('Unsupported ciphertext format');
  const raw = Buffer.from(body, 'base64');
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error('Ciphertext too short');

  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/**
 * Keyed, deterministic HMAC-SHA256 (hex). Lets us find duplicates of a value
 * without storing it; without the key the hash cannot be brute-forced offline.
 */
export function hashField(value: string, key: Buffer = idHashKey()): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

// The check-digit validator lives in packages/shared so the web and mobile clients use the same rule.
export { isValidIsraeliId, normalizeIsraeliId } from '@lotto-maker/shared';

import { redis } from '../../redis.js';

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60; // 10 minutes

function otpKey(phone: string) {
  return `otp:${phone}`;
}
function attemptsKey(phone: string) {
  return `otp_attempts:${phone}`;
}
function rateLimitKey(phone: string) {
  return `otp_rate:${phone}`;
}

export async function checkOtpRateLimit(
  phone: string,
): Promise<{ limited: boolean; retryAfter?: number }> {
  const key = rateLimitKey(phone);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SECONDS * 1000;

  // Remove entries outside the sliding window, count what remains, add new entry
  await redis.zremrangebyscore(key, '-inf', windowStart);
  const count = await redis.zcard(key);

  if (count >= RATE_LIMIT_MAX) {
    // Oldest entry in window determines when rate limit resets
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTs = oldest.length >= 2 ? parseInt(oldest[1]!, 10) : now;
    const retryAfter = Math.ceil((oldestTs + RATE_LIMIT_WINDOW_SECONDS * 1000 - now) / 1000);
    return { limited: true, retryAfter: Math.max(1, retryAfter) };
  }

  await redis.zadd(key, now, `${now}`);
  await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  return { limited: false };
}

export async function storeOtp(phone: string, code: string): Promise<void> {
  await redis.setex(otpKey(phone), OTP_TTL_SECONDS, code);
  await redis.del(attemptsKey(phone));
}

export async function verifyOtp(phone: string, code: string): Promise<'ok' | 'invalid' | 'expired' | 'too_many'> {
  const attempts = await redis.incr(attemptsKey(phone));
  await redis.expire(attemptsKey(phone), OTP_TTL_SECONDS);

  if (attempts > MAX_ATTEMPTS) return 'too_many';

  const stored = await redis.get(otpKey(phone));
  if (stored === null) return 'expired';

  const match = timingSafeEqual(stored, code);
  if (!match) return 'invalid';

  await redis.del(otpKey(phone));
  await redis.del(attemptsKey(phone));
  return 'ok';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

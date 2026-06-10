import { redis } from '../../redis.js';

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

function otpKey(phone: string) {
  return `otp:${phone}`;
}
function attemptsKey(phone: string) {
  return `otp_attempts:${phone}`;
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

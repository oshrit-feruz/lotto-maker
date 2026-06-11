import { randomInt } from 'crypto';
import { nanoid } from 'nanoid';
import { prisma } from '../../prisma.js';
import { redis } from '../../redis.js';
import { config } from '../../config.js';
import { storeOtp, verifyOtp } from './otp.store.js';
import { AppError } from '../../plugins/error-handler.js';
import type { FastifyInstance } from 'fastify';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function refreshKey(userId: string, tokenId: string) {
  return `refresh:${userId}:${tokenId}`;
}

export async function sendOtp(phone: string): Promise<void> {
  const code = String(randomInt(100000, 999999));
  await storeOtp(phone, code);

  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
    // No SMS provider configured — print code to server logs so it can be retrieved manually
    console.log(`[OTP] ${phone} → ${code}`);
    return;
  }

  const { default: twilio } = await import('twilio');
  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: `קוד האימות שלך: ${code}`,
    from: config.TWILIO_FROM_NUMBER,
    to: phone,
  });
}

export async function verifyOtpAndIssueTokens(
  phone: string,
  code: string,
  app: FastifyInstance,
): Promise<{ accessToken: string; refreshToken: string; isNewUser: boolean }> {
  const result = await verifyOtp(phone, code);

  if (result === 'too_many') throw new AppError(429, 'RATE_LIMITED', 'Too many OTP attempts');
  if (result === 'expired') throw new AppError(410, 'OTP_EXPIRED', 'OTP has expired');
  if (result === 'invalid') throw new AppError(401, 'OTP_INVALID', 'Invalid OTP code');

  const existing = await prisma.user.findUnique({ where: { phone } });
  const isNewUser = !existing;

  const user = existing ?? await prisma.user.create({ data: { phone } });

  const accessToken = app.jwt.sign(
    { sub: user.id, phone: user.phone, type: 'user' },
    { expiresIn: '15m' },
  );

  const tokenId = nanoid();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = (app.jwt.sign as any)(
    { sub: user.id, tokenId, type: 'user' },
    { expiresIn: '30d', secret: config.JWT_REFRESH_SECRET },
  ) as string;

  await redis.setex(refreshKey(user.id, tokenId), REFRESH_TTL_SECONDS, '1');

  return { accessToken, refreshToken, isNewUser };
}

export async function refreshAccessToken(
  refreshToken: string,
  app: FastifyInstance,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: { sub: string; tokenId: string; type: string };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload = (app.jwt.verify as any)(refreshToken, { secret: config.JWT_REFRESH_SECRET }) as typeof payload;
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN');
  }

  const oldKey = refreshKey(payload.sub, payload.tokenId);
  const deleted = await redis.del(oldKey);
  // If key was already gone, this token was already rotated — possible reuse attack
  if (deleted === 0) throw new AppError(401, 'REFRESH_TOKEN_REVOKED');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });

  const accessToken = app.jwt.sign(
    { sub: user.id, phone: user.phone, type: 'user' },
    { expiresIn: '15m' },
  );

  const newTokenId = nanoid();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newRefreshToken = (app.jwt.sign as any)(
    { sub: user.id, tokenId: newTokenId, type: 'user' },
    { expiresIn: '30d', secret: config.JWT_REFRESH_SECRET },
  ) as string;

  await redis.setex(refreshKey(user.id, newTokenId), REFRESH_TTL_SECONDS, '1');

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string, refreshToken: string, app: FastifyInstance): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = (app.jwt.verify as any)(refreshToken, { secret: config.JWT_REFRESH_SECRET }) as { sub: string; tokenId: string };
    await redis.del(refreshKey(payload.sub, payload.tokenId));
  } catch {
    // token already invalid, nothing to do
  }
}

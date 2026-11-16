import { randomInt } from 'crypto';
import { nanoid } from 'nanoid';
import { prisma } from '../../prisma.js';
import { redis } from '../../redis.js';
import { config } from '../../config.js';
import { storeOtp, verifyOtp } from './otp.store.js';
import { AppError } from '../../plugins/error-handler.js';
import { sendRequired } from '../notifications/notify.service.js';
import { resolveSmsProviderName } from '../notifications/sms/select.js';
import type { FastifyInstance } from 'fastify';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function refreshKey(userId: string, tokenId: string) {
  return `refresh:${userId}:${tokenId}`;
}

export async function sendOtp(phone: string): Promise<void> {
  const code = String(randomInt(100000, 999999));
  await storeOtp(phone, code);

  // Only when nothing really sends the SMS (the console provider), never in production
  if (resolveSmsProviderName(config) === 'console' && config.NODE_ENV !== 'production') {
    // Dev/test only — log OTP to server console so it can be retrieved manually
    console.log(`[OTP_DEV] ${phone} → ${code}`); // NOSONAR: dev-only path, gated behind NODE_ENV !== 'production'
  }

  // Through the logged notification path (the code itself is never logged). OTP is mandatory:
  // a failed send fails the request, e.g. 503 SMS_NOT_CONFIGURED in production without an SMS
  // provider, 502 NOTIFICATION_NOT_SENT when the provider refused it or timed out.
  await sendRequired(null, 'sms', 'otp', { code }, { to: phone });
}

/** Which app is logging in. Decides the token type; the phone alone never does. */
export const AUTH_AUDIENCES = ['user', 'admin', 'operator'] as const;
export type AuthAudience = (typeof AUTH_AUDIENCES)[number];

interface TokenSubject {
  id: string;
  phone: string | null;
  type: AuthAudience;
}

type TokenPair = { accessToken: string; refreshToken: string };

/** Signs an access token and a fresh refresh token of the subject's type, and stores the refresh id. */
async function issueTokens(app: FastifyInstance, subject: TokenSubject): Promise<TokenPair> {
  const accessToken = app.jwt.sign(
    { sub: subject.id, phone: subject.phone ?? undefined, type: subject.type },
    { expiresIn: '15m' },
  );
  const tokenId = nanoid();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = (app.jwt.sign as any)(
    { sub: subject.id, tokenId, type: subject.type },
    { expiresIn: '30d', key: config.JWT_REFRESH_SECRET },
  ) as string;
  await redis.setex(refreshKey(subject.id, tokenId), REFRESH_TTL_SECONDS, '1');
  return { accessToken, refreshToken };
}

/**
 * The account a verified phone logs into for the given audience. Staff audiences need an active
 * Admin / Operator row with that phone (403 otherwise, and no User row is created); the user
 * audience always gets the customer account, whatever staff rows share the phone.
 */
async function loginSubject(phone: string, audience: AuthAudience): Promise<{ subject: TokenSubject; isNewUser: boolean }> {
  if (audience === 'admin') {
    const admin = await prisma.admin.findUnique({ where: { phone } });
    if (!admin?.active) throw new AppError(403, 'NOT_AN_ADMIN', 'This phone is not an active admin');
    return { subject: { id: admin.id, phone, type: 'admin' }, isNewUser: false };
  }
  if (audience === 'operator') {
    const operator = await prisma.operator.findUnique({ where: { phone } });
    if (!operator?.active) throw new AppError(403, 'NOT_AN_OPERATOR', 'This phone is not an active operator');
    return { subject: { id: operator.id, phone, type: 'operator' }, isNewUser: false };
  }
  const existing = await prisma.user.findUnique({ where: { phone } });
  const user = existing ?? (await prisma.user.create({ data: { phone } }));
  return { subject: { id: user.id, phone: user.phone, type: 'user' }, isNewUser: !existing };
}

export async function verifyOtpAndIssueTokens(
  phone: string,
  code: string,
  app: FastifyInstance,
  audience: AuthAudience = 'user',
): Promise<TokenPair & { isNewUser: boolean }> {
  const result = await verifyOtp(phone, code);

  if (result === 'too_many') throw new AppError(429, 'RATE_LIMITED', 'Too many OTP attempts');
  if (result === 'expired') throw new AppError(410, 'OTP_EXPIRED', 'OTP has expired');
  if (result === 'invalid') throw new AppError(401, 'OTP_INVALID', 'Invalid OTP code');

  const { subject, isNewUser } = await loginSubject(phone, audience);
  return { ...(await issueTokens(app, subject)), isNewUser };
}

/** The current account behind a refresh token; the token's type is kept as is. */
async function refreshSubject(type: AuthAudience, id: string): Promise<TokenSubject> {
  if (type === 'admin') {
    const admin = await prisma.admin.findUniqueOrThrow({ where: { id } });
    if (!admin.active) throw new AppError(403, 'ADMIN_INACTIVE');
    return { id, phone: admin.phone, type };
  }
  if (type === 'operator') {
    const operator = await prisma.operator.findUniqueOrThrow({ where: { id } });
    if (!operator.active) throw new AppError(403, 'OPERATOR_INACTIVE');
    return { id, phone: operator.phone, type };
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, phone: user.phone, type: 'user' };
}

export async function refreshAccessToken(refreshToken: string, app: FastifyInstance): Promise<TokenPair> {
  let payload: { sub: string; tokenId: string; type?: AuthAudience };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload = (app.jwt.verify as any)(refreshToken, { key: config.JWT_REFRESH_SECRET }) as typeof payload;
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN');
  }

  const oldKey = refreshKey(payload.sub, payload.tokenId);
  const deleted = await redis.del(oldKey);
  // If key was already gone, this token was already rotated — possible reuse attack
  if (deleted === 0) throw new AppError(401, 'REFRESH_TOKEN_REVOKED');

  const subject = await refreshSubject(payload.type ?? 'user', payload.sub);
  return issueTokens(app, subject);
}

/**
 * Revokes one refresh token. The token itself says whose it is (user, operator or admin), so no
 * access token is needed. An invalid or already revoked token is a no-op.
 */
export async function logout(refreshToken: string, app: FastifyInstance): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = (app.jwt.verify as any)(refreshToken, { key: config.JWT_REFRESH_SECRET }) as { sub: string; tokenId: string };
    await redis.del(refreshKey(payload.sub, payload.tokenId));
  } catch {
    // token already invalid, nothing to do
  }
}

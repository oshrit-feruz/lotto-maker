import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sendOtp, verifyOtpAndIssueTokens, refreshAccessToken, logout, AUTH_AUDIENCES } from './auth.service.js';
import { checkOtpRateLimit } from './otp.store.js';

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Phone must be in E.164 format'),
});

const verifyOtpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
  // Which app is logging in: the token type follows it, never the phone alone (one phone can be
  // a customer, an operator and an admin). Staff apps must send theirs; omitted means 'user'.
  audience: z.enum(AUTH_AUDIENCES).default('user'),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).max(4096),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/send-otp', async (request, reply) => {
    const { phone } = sendOtpSchema.parse(request.body);

    const rateLimit = await checkOtpRateLimit(phone);
    if (rateLimit.limited) {
      return reply.status(429).send({
        error: 'OTP_RATE_LIMITED',
        message: 'Too many OTP requests. Try again later.',
        retryAfter: rateLimit.retryAfter,
      });
    }

    await sendOtp(phone);
    return reply.send({ message: 'OTP sent', expiresIn: 300 });
  });

  app.post('/auth/verify-otp', async (request, reply) => {
    const { phone, code, audience } = verifyOtpSchema.parse(request.body);
    const tokens = await verifyOtpAndIssueTokens(phone, code, app, audience);
    return reply.send(tokens);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const tokens = await refreshAccessToken(refreshToken, app);
    return reply.send(tokens);
  });

  // Revokes the refresh token in the body, for any role (user, operator, admin). No access token is
  // needed: holding a refresh token is enough to revoke it, and an expired access token must not
  // stop a logout. POST is the same, for clients that cannot send a DELETE body.
  const logoutHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = logoutSchema.parse(request.body ?? {});
    await logout(refreshToken, app);
    return reply.status(204).send();
  };
  app.delete('/auth/logout', logoutHandler);
  app.post('/auth/logout', logoutHandler);
}

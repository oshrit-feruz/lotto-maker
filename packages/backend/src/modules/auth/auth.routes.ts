import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendOtp, verifyOtpAndIssueTokens, refreshAccessToken, logout } from './auth.service.js';

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Phone must be in E.164 format'),
});

const verifyOtpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const logoutSchema = z.object({
  refreshToken: z.string(),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/send-otp', async (request, reply) => {
    const { phone } = sendOtpSchema.parse(request.body);
    await sendOtp(phone);
    return reply.send({ message: 'OTP sent', expiresIn: 300 });
  });

  app.post('/auth/verify-otp', async (request, reply) => {
    const { phone, code } = verifyOtpSchema.parse(request.body);
    const tokens = await verifyOtpAndIssueTokens(phone, code, app);
    return reply.send(tokens);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const accessToken = await refreshAccessToken(refreshToken, app);
    return reply.send({ accessToken });
  });

  app.delete('/auth/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { refreshToken } = logoutSchema.parse(request.body);
    await logout(request.user.sub, refreshToken, app);
    return reply.status(204).send();
  });
}

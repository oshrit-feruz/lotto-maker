import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getMe, updateMe, submitKyc } from './users.service.js';

const updateMeSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  fcmToken: z.string().max(500).optional(),
});

const kycSchema = z.object({
  fullName: z.string().min(2).max(100),
  idNumber: z.string().min(7).max(9),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
});

export default async function usersRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getMe(request.user.sub);
    return reply.send(user);
  });

  app.put('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateMeSchema.parse(request.body);
    const user = await updateMe(request.user.sub, data);
    return reply.send(user);
  });

  app.post('/me/kyc', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = kycSchema.parse(request.body);
    const result = await submitKyc(request.user.sub, params);
    return reply.send(result);
  });
}

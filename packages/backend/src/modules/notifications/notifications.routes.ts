import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPreferences, setPreferences } from './notify.service.js';

const putSchema = z
  .object({ sms: z.boolean().optional(), email: z.boolean().optional(), push: z.boolean().optional() })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'At least one channel is required');

export default async function notificationsRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate] };

  // { sms, email, push }: true unless the user turned the channel off.
  // Sign-in codes and legal notices (prize claims, deposit receipts) are sent regardless.
  app.get('/me/notification-preferences', pre, async (request, reply) => {
    return reply.send(await getPreferences(request.user.sub));
  });

  app.put('/me/notification-preferences', pre, async (request, reply) => {
    const body = putSchema.parse(request.body);
    return reply.send(await setPreferences(request.user.sub, body));
  });
}

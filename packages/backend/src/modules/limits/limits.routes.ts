import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EXCLUSION_PERIODS, getActivitySummary, getLimits, selfExclude, updateLimits } from './limits.service.js';

// ILS amount with at most 2 decimals; null removes the limit (takes effect after the delay)
const limitValue = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((a) => Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, 'At most 2 decimal places')
  .nullable()
  .optional();

const putLimitsSchema = z
  .object({
    depositDaily: limitValue,
    depositWeekly: limitValue,
    depositMonthly: limitValue,
    lossMonthly: limitValue,
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'At least one limit is required');

const selfExclusionSchema = z.object({ period: z.enum(EXCLUSION_PERIODS) });

export default async function limitsRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate] };

  app.get('/me/limits', pre, async (request, reply) => {
    return reply.send(await getLimits(request.user.sub));
  });

  app.put('/me/limits', pre, async (request, reply) => {
    const body = putLimitsSchema.parse(request.body);
    return reply.send(await updateLimits(request.user.sub, body));
  });

  app.post('/me/self-exclusion', pre, async (request, reply) => {
    const { period } = selfExclusionSchema.parse(request.body);
    return reply.send(await selfExclude(request.user.sub, period));
  });

  app.get('/me/activity-summary', pre, async (request, reply) => {
    return reply.send(await getActivitySummary(request.user.sub));
  });
}

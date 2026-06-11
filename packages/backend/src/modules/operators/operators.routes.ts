import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { config } from '../../config.js';
import {
  getQueue,
  startSlot,
  completeSlot,
  attachScan,
  getShiftLog,
  queueChannel,
  getOperatorByUserId,
} from './operators.service.js';
import { r2Service } from '../../storage/r2.service.js';
import { z } from 'zod';

const shiftLogSchema = z.object({ date: z.string().optional() });

export default async function operatorsRoutes(app: FastifyInstance) {
  app.get('/operator/queue', { preHandler: [app.authenticateOperator] }, async (request, reply) => {
    const operator = await getOperatorByUserId(request.user.sub);
    const result = await getQueue(operator.locationId);
    return reply.send(result);
  });

  app.post('/operator/queue/:slotId/start', { preHandler: [app.authenticateOperator] }, async (request, reply) => {
    const { slotId } = request.params as { slotId: string };
    const slot = await startSlot(slotId, request.user.sub);
    return reply.send(slot);
  });

  app.post('/operator/queue/:slotId/done', { preHandler: [app.authenticateOperator] }, async (request, reply) => {
    const { slotId } = request.params as { slotId: string };
    const slot = await completeSlot(slotId, request.user.sub);
    return reply.send(slot);
  });

  app.post('/operator/queue/:slotId/scan', { preHandler: [app.authenticateOperator] }, async (request, reply) => {
    const { slotId } = request.params as { slotId: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(slotId)) {
      return reply.status(400).send({ error: 'INVALID_SLOT_ID' });
    }
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'NO_FILE' });

    const buffer = await data.toBuffer();
    const key = `scans/${slotId}-${Date.now()}.jpg`;
    const scanUrl = await r2Service.upload(key, buffer, data.mimetype);

    const result = await attachScan(slotId, request.user.sub, scanUrl);
    return reply.send(result);
  });

  // SSE stream — long-lived connection
  app.get('/operator/queue/stream', { preHandler: [app.authenticateOperator] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const operatorId = request.user.sub;
    const operator = await getOperatorByUserId(operatorId);
    const channel = queueChannel(operator.locationId);

    const sub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendEvent = (data: string) => {
      reply.raw.write(`data: ${data}\n\n`);
    };

    const initial = await getQueue(operator.locationId);
    sendEvent(JSON.stringify({ type: 'initial', ...initial }));

    await sub.subscribe(channel);
    sub.on('message', (_ch: string, message: string) => {
      sendEvent(message);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      void sub.unsubscribe(channel).then(() => sub.quit());
    });

    await new Promise<void>((resolve) => request.raw.on('close', resolve));
    return reply;
  });

  app.get('/operator/shift-log', { preHandler: [app.authenticateOperator] }, async (request, reply) => {
    const { date } = shiftLogSchema.parse(request.query);
    const log = await getShiftLog(request.user.sub, date);
    return reply.send(log);
  });
}

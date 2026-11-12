import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { config } from '../../config.js';
import {
  getQueue,
  startSlot,
  completeSlot,
  attachScan,
  assertCanAttachScan,
  getShiftLog,
  queueChannel,
  getOperatorByUserId,
} from './operators.service.js';
import { r2Service } from '../../storage/r2.service.js';
import { z } from 'zod';
import { AppError } from '../../plugins/error-handler.js';
import { MAX_SCAN_BYTES, detectScanType } from '../../lib/scan-file.js';

const tooLarge = () =>
  new AppError(413, 'SCAN_TOO_LARGE', `Scan must be at most ${MAX_SCAN_BYTES / (1024 * 1024)} MB`);

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
    // Authorise before touching the upload: nothing is stored for a rejected request
    await assertCanAttachScan(slotId, request.user.sub);

    const data = await request.file({ limits: { fileSize: MAX_SCAN_BYTES } });
    if (!data) return reply.status(400).send({ error: 'NO_FILE' });

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge();
      throw err;
    }
    if (data.file.truncated) throw tooLarge();

    // Extra digits printed by the terminal, sent as a text field before the file (e.g. "123456")
    const extraField = data.fields['extraDigits'] as { value?: unknown } | undefined;
    const extraText = typeof extraField?.value === 'string' ? extraField.value.trim() : '';
    const extraDigits = extraText ? extraText.split('').map(Number) : [];
    // Reject before storing anything
    await assertCanAttachScan(slotId, request.user.sub, extraDigits);

    // Trust the bytes, not the client's mimetype or filename
    const type = detectScanType(buffer);
    if (!type) {
      throw new AppError(415, 'UNSUPPORTED_SCAN_TYPE', 'Only JPEG, PNG and HEIC images are accepted');
    }

    const key = `scans/${slotId}-${Date.now()}.${type.ext}`;
    const scanKey = await r2Service.upload(key, buffer, type.contentType);

    const result = await attachScan(slotId, request.user.sub, scanKey, extraDigits);
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

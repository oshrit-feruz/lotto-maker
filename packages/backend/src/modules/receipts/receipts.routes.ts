import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { getReceipt, listReceipts } from './receipts.service.js';
import { renderReceiptHtml } from './receipt-html.js';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export default async function receiptsRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticate] };

  app.get('/me/receipts', pre, async (request, reply) => {
    const { page, limit } = listSchema.parse(request.query);
    return reply.send(await listReceipts(request.user.sub, { page, limit }));
  });

  // A simple Hebrew RTL page, marked as not a tax invoice. The web app can open it in a new tab.
  app.get('/me/receipts/:id', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { receipt, originalNumber } = await getReceipt(id, request.user.sub);
    const html = renderReceiptHtml(
      receipt,
      { name: config.BUSINESS_NAME, id: config.BUSINESS_ID, address: config.BUSINESS_ADDRESS },
      originalNumber,
    );
    return reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(html);
  });
}

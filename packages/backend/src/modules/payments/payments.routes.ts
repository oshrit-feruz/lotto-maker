import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { createCheckout, getPayment, getPaymentProvider, processWebhook } from './payments.service.js';
import { deactivateCard, listCards } from './cards.service.js';
import { MockPaymentProvider, MOCK_SIGNATURE_HEADER } from './mock-payment-provider.js';
import { isAllowedReturnUrl } from './return-urls.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const checkoutSchema = z.object({
  amount: z
    .number()
    .positive()
    .max(10000)
    .refine((a) => Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, 'At most 2 decimal places'),
  idempotencyKey: z.string().min(8).max(128).optional(),
  // Checked against CHECKOUT_RETURN_ORIGINS (422 INVALID_RETURN_URL); `paymentId` is added to both.
  successUrl: z.string().max(2048).optional(),
  cancelUrl: z.string().max(2048).optional(),
});

export default async function paymentsRoutes(app: FastifyInstance) {
  // Webhook signatures are computed over the exact bytes the provider sent, so
  // keep the raw body next to the parsed one. Scoped to this plugin only.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = body as Buffer;
    request.rawBody = raw;
    if (raw.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(raw.toString('utf8')));
    } catch {
      done(new AppError(400, 'INVALID_JSON'));
    }
  });

  app.post('/payments/checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body);
    const headerKey = request.headers['idempotency-key'];
    const idempotencyKey = body.idempotencyKey ?? (typeof headerKey === 'string' ? headerKey : undefined);
    const result = await createCheckout(request.user.sub, body.amount, idempotencyKey, {
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });
    return reply.status(201).send(result);
  });

  // The owner polls this after returning from the hosted checkout (pending -> approved / failed)
  app.get('/payments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getPayment(id, request.user.sub));
  });

  // Last4 and brand only: the card token never leaves the server.
  app.get('/me/cards', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send(await listCards(request.user.sub));
  });

  app.delete('/me/cards/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await deactivateCard(request.user.sub, id));
  });

  // Called by the payment provider, not by our clients: authenticated by the
  // provider's signature instead of a JWT.
  app.post('/payments/webhook', async (request, reply) => {
    const result = await processWebhook(request.rawBody ?? Buffer.alloc(0), request.headers);
    return reply.send({ received: true, outcome: result.outcome });
  });

  if (config.NODE_ENV !== 'production' && config.PAYMENT_PROVIDER === 'mock') {
    registerMockCheckoutPages(app);
  }
}

/**
 * Dev-only stand-in for a provider's hosted payment page. "Paying" here sends
 * the same signed webhook a real provider would, through the same code path.
 */
function registerMockCheckoutPages(app: FastifyInstance) {
  const paramsSchema = z.object({ providerTxId: z.string().regex(/^mock_[A-Za-z0-9_-]+$/) });
  const page = (body: string) =>
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock checkout</title></head>` +
    `<body style="font-family:system-ui;max-width:420px;margin:48px auto;padding:0 16px;text-align:center">${body}</body></html>`;

  // Return URLs ride along on the page link. Re-checked here: the query string is user-controlled.
  const returnQuerySchema = z.object({
    successUrl: z.string().refine((u) => isAllowedReturnUrl(u)).optional().catch(undefined),
    cancelUrl: z.string().refine((u) => isAllowedReturnUrl(u)).optional().catch(undefined),
  });
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const carry = (q: { successUrl?: string; cancelUrl?: string }) => {
    const p = new URLSearchParams();
    if (q.successUrl) p.set('successUrl', q.successUrl);
    if (q.cancelUrl) p.set('cancelUrl', q.cancelUrl);
    const s = p.toString();
    return s ? `&${s}` : '';
  };

  app.get('/payments/mock-checkout/:providerTxId', async (request, reply) => {
    const { providerTxId } = paramsSchema.parse(request.params);
    const back = returnQuerySchema.parse(request.query);
    const payment = await prisma.payment.findUnique({ where: { providerTxId } });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND');
    const html =
      payment.status === 'pending'
        ? `<h1>תשלום לדוגמה</h1><p>סכום: ₪${payment.amount.toFixed(2)}</p>` +
          `<p><a href="${esc(`${providerTxId}/complete?result=approved${carry(back)}`)}">אשר תשלום</a></p>` +
          `<p><a href="${esc(`${providerTxId}/complete?result=failed${carry(back)}`)}">דחה תשלום</a></p>` +
          (back.cancelUrl ? `<p><a href="${esc(back.cancelUrl)}">ביטול</a></p>` : '') +
          `<p style="color:#6b7280">סביבת פיתוח בלבד. לא מתבצע חיוב.</p>`
        : `<h1>התשלום כבר טופל</h1><p>סטטוס: ${payment.status}</p>`;
    return reply.type('text/html; charset=utf-8').send(page(html));
  });

  app.get('/payments/mock-checkout/:providerTxId/complete', async (request, reply) => {
    const { providerTxId } = paramsSchema.parse(request.params);
    const { result } = z.object({ result: z.enum(['approved', 'failed']) }).parse(request.query);
    const back = returnQuerySchema.parse(request.query);
    const payment = await prisma.payment.findUnique({ where: { providerTxId } });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND');

    const provider = getPaymentProvider();
    if (!(provider instanceof MockPaymentProvider)) throw new AppError(404, 'NOT_FOUND');
    const rawBody = Buffer.from(
      JSON.stringify({
        providerTxId,
        status: result,
        amount: payment.amount.toNumber(),
        ...(result === 'approved' ? { cardLast4: '4242', cardBrand: 'visa', cardToken: `mock_tok_${providerTxId}` } : {}),
      }),
    );
    const { outcome } = await processWebhook(rawBody, { [MOCK_SIGNATURE_HEADER]: provider.sign(rawBody) });
    // Like a real hosted page: back to the site (it polls GET /payments/:id for the final status)
    const target = result === 'approved' ? back.successUrl : back.cancelUrl;
    if (target) return reply.redirect(target);
    return reply
      .type('text/html; charset=utf-8')
      .send(page(`<h1>${outcome === 'credited' ? 'התשלום אושר' : 'התשלום לא בוצע'}</h1><p>אפשר לחזור לאפליקציה.</p>`));
  });
}

import Fastify from 'fastify';
import multipart from '@fastify/multipart';

import errorHandler from './plugins/error-handler.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import authPlugin from './plugins/auth.js';
import swaggerPlugin from './plugins/swagger.js';
import securityPlugin from './plugins/security.js';
import healthPlugin from './plugins/health.js';
import { config } from './config.js';
import { logger, genReqId } from './lib/logger.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import walletRoutes from './modules/wallet/wallet.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import prizeClaimsRoutes from './modules/prize-claims/prize-claims.routes.js';
import adminMoneyRoutes from './modules/admin/admin-money.routes.js';
import adminUsersRoutes from './modules/admin/admin-users.routes.js';
import ticketsRoutes from './modules/tickets/tickets.routes.js';
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes.js';
import operatorsRoutes from './modules/operators/operators.routes.js';
import adminKycRoutes from './modules/admin/admin-kyc.routes.js';
import limitsRoutes from './modules/limits/limits.routes.js';
import adminLimitsRoutes from './modules/admin/admin-limits.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import receiptsRoutes from './modules/receipts/receipts.routes.js';
import { MAX_SCAN_BYTES } from './lib/scan-file.js';
import resultsRoutes from './modules/results/results.routes.js';

export interface BuildAppOptions {
  /** false: only /health and /ready (the worker process). */
  api?: boolean;
}

export async function buildApp({ api = true }: BuildAppOptions = {}) {
  const app = Fastify({
    logger,
    genReqId,
    // genReqId reads and validates X-Request-Id itself
    requestIdHeader: false,
    requestIdLogLabel: 'reqId',
    bodyLimit: config.BODY_LIMIT_BYTES,
    trustProxy: config.TRUST_PROXY_HOPS > 0 ? config.TRUST_PROXY_HOPS : false,
    // Refuse new requests while closing; the platform has already stopped routing to us
    return503OnClosing: true,
  });

  await app.register(errorHandler);
  await app.register(securityPlugin);
  // Liveness / readiness come before rate limits and auth, and are exempt from both
  await app.register(healthPlugin);
  if (!api) return app;

  // Plugins
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  if (config.ENABLE_API_DOCS) await app.register(swaggerPlugin);
  await app.register(multipart, { limits: { fileSize: MAX_SCAN_BYTES } }); // 10 MB

  // Routes
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(walletRoutes);
  await app.register(paymentsRoutes);
  await app.register(ordersRoutes);
  await app.register(ticketsRoutes);
  await app.register(adminRoutes);
  await app.register(adminMoneyRoutes);
  await app.register(adminUsersRoutes);
  await app.register(prizeClaimsRoutes);
  await app.register(subscriptionsRoutes);
  await app.register(operatorsRoutes);
  await app.register(resultsRoutes);
  await app.register(adminKycRoutes);
  await app.register(limitsRoutes);
  await app.register(adminLimitsRoutes);
  await app.register(notificationsRoutes);
  await app.register(receiptsRoutes);

  return app;
}

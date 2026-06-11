import Fastify from 'fastify';
import multipart from '@fastify/multipart';

import errorHandler from './plugins/error-handler.js';
import corsPlugin from './plugins/cors.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import authPlugin from './plugins/auth.js';
import swaggerPlugin from './plugins/swagger.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import walletRoutes from './modules/wallet/wallet.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes.js';
import operatorsRoutes from './modules/operators/operators.routes.js';
import resultsRoutes from './modules/results/results.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(errorHandler);
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  await app.register(swaggerPlugin);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

  // Routes
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(walletRoutes);
  await app.register(ordersRoutes);
  await app.register(subscriptionsRoutes);
  await app.register(operatorsRoutes);
  await app.register(resultsRoutes);

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

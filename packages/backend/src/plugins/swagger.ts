import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

export default fp(async function swaggerPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'Lotto Maker API',
        description: 'Pais Remote Forms — backend API',
        version: '1.0.0',
      },
      // Behind a path prefix (Vercel Services: /backend) "Try it out" must target PUBLIC_API_URL.
      // Unset (Docker/local), Swagger keeps calling the origin it is served from.
      ...(config.PUBLIC_API_URL ? { servers: [{ url: config.PUBLIC_API_URL }] } : {}),
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
  });
});

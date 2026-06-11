import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export default fp(async function swaggerPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'Lotto Maker API',
        description: 'Pais Remote Forms — backend API',
        version: '1.0.0',
      },
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

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
      // Behind a path prefix (Vercel Services: /backend) "Try it out" must keep that prefix.
      // Use only the path of PUBLIC_API_URL so previews call their own origin, not production.
      // Unset or no prefix (Docker/local): Swagger keeps calling the origin it is served from.
      ...apiServers(config.PUBLIC_API_URL),
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

/** OpenAPI `servers` holding only the path prefix of the public API URL (e.g. `/backend`). */
export function apiServers(publicApiUrl: string | undefined): { servers?: { url: string }[] } {
  if (!publicApiUrl) return {};
  const prefix = new URL(publicApiUrl).pathname.replace(/\/+$/, '');
  return prefix ? { servers: [{ url: prefix }] } : {};
}

/**
 * The public path of the backend service (root vercel.json: `/backend/(.*)` → backend). Vercel
 * Services hand the function the original request path, so `/backend/health` arrives as
 * `/backend/health`; Fastify's routes have no prefix. Only a leading `/backend` segment is
 * removed, so a call that arrives without it (a service binding, or the cron path if Vercel ever
 * sends it unprefixed) still reaches the same route.
 */
export const SERVICE_PREFIX = '/backend';

export function stripServicePrefix(url: string | undefined): string | undefined {
  if (!url?.startsWith(SERVICE_PREFIX)) return url;
  const rest = url.slice(SERVICE_PREFIX.length);
  if (rest === '') return '/';
  if (rest.startsWith('/')) return rest;
  if (rest.startsWith('?')) return `/${rest}`;
  return url; // `/backendfoo` is not under the prefix
}

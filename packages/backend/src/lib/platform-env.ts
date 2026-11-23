/**
 * Environment fix-ups for Vercel Functions (src/vercel.ts). Applied to process.env before
 * config.ts parses it, so everything else reads the usual names. Values that are already set win.
 *
 * - REDIS_URL from KV_URL: the Upstash Redis Marketplace integration injects the TCP URL
 *   (rediss://) as KV_URL (and as REDIS_URL in newer installs). ioredis needs that TCP URL; the
 *   KV_REST_API_* (HTTP) variables are not used.
 * - DATABASE_URL: a Neon pooled URL (host contains "-pooler.") gets `pgbouncer=true`, which Prisma
 *   needs behind PgBouncer in transaction mode. Migrations use DATABASE_URL_UNPOOLED instead
 *   (scripts/vercel-build.sh).
 * - RUN_JOBS=false: a function has no long-running process for node-cron. Vercel Cron calls
 *   GET /cron/:job instead (src/cron/http.ts, root vercel.json `crons`).
 * - TRUST_PROXY_HOPS=1: Vercel's edge sets X-Forwarded-For to the client IP; rate limits key on it.
 * - NODE_ENV from BACKEND_NODE_ENV: on Vercel Services every service of the project shares the
 *   project's environment variables, so a project-wide NODE_ENV=development (staging behaviour)
 *   would also build and run the Next.js site in development mode. BACKEND_NODE_ENV sets it for
 *   this function only.
 * - SSE_MAX_CONNECTION_MS: the operator queue stream ends itself before the function's
 *   maxDuration (300 s in the root vercel.json) instead of being cut off with a 504. The dashboard then
 *   polls and reconnects (operator-dashboard/src/hooks/useQueue.ts).
 */
export const VERCEL_DEFAULTS: Readonly<Record<string, string>> = {
  RUN_JOBS: 'false',
  TRUST_PROXY_HOPS: '1',
  SSE_MAX_CONNECTION_MS: '270000',
};

const isSet = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';

/** Adds `pgbouncer=true` to a Neon pooled connection string that does not say otherwise. */
export function withPgBouncerFlag(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.hostname.includes('-pooler.') || parsed.searchParams.has('pgbouncer')) return url;
  parsed.searchParams.set('pgbouncer', 'true');
  return parsed.toString();
}

export function applyVercelEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (isSet(env.BACKEND_NODE_ENV)) env.NODE_ENV = env.BACKEND_NODE_ENV;
  if (!isSet(env.REDIS_URL) && isSet(env.KV_URL)) env.REDIS_URL = env.KV_URL;
  if (isSet(env.DATABASE_URL)) env.DATABASE_URL = withPgBouncerFlag(env.DATABASE_URL);
  for (const [name, value] of Object.entries(VERCEL_DEFAULTS)) {
    if (!isSet(env[name])) env[name] = value;
  }
  return env;
}

import { z } from 'zod';

// A 32-byte key, base64-encoded (e.g. `openssl rand -base64 32`)
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

const bool = (def: 'true' | 'false') =>
  z.enum(['true', 'false', '1', '0']).default(def).transform((v) => v === 'true' || v === '1');

const originList = z
  .string()
  .default('')
  .transform((v, ctx) =>
    v
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        try {
          return new URL(o).origin;
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `not an origin: ${o}` });
          return z.NEVER;
        }
      }),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  // Process split (Phase 7). One process can serve the API, run the scheduled jobs, or both.
  // Production runs two services from the same image: API (RUN_JOBS=false) and worker (RUN_API=false).
  // A worker still answers /health and /ready on PORT. Jobs are also guarded by a Redis lock, so
  // running them on several instances by mistake does not double-run them.
  RUN_API: bool('true'),
  RUN_JOBS: bool('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Number of reverse-proxy hops in front of the API whose X-Forwarded-For is trusted for the
  // client IP (rate limits key on it). Railway: 1. Unset: 1 in production, 0 elsewhere.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).optional(),
  // Largest JSON / form body accepted. Ticket-scan uploads are multipart and have their own limit.
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(256 * 1024),
  // Global per-IP limit for every route without a stricter rule.
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Swagger UI at /docs. Unset: on outside production, off in production.
  ENABLE_API_DOCS: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  // /ready gives each dependency (Postgres, Redis) this long before reporting it down.
  READY_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  // On SIGTERM the process stops taking work and exits after at most this long.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  // Optional error monitoring. Off unless set (and @sentry/node is installed); see src/lib/report-error.ts.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v) return true;
        try { JSON.parse(Buffer.from(v, 'base64').toString('utf-8')); return true; } catch { return false; }
      },
      { message: 'FIREBASE_SERVICE_ACCOUNT_JSON must be a valid base64-encoded JSON object' },
    ),
  // Browser origins allowed to call the API (web app, admin and operator dashboards), comma-separated.
  // Required in production. CORS_ORIGINS is the old name and is still read when this is unset.
  ALLOWED_ORIGINS: originList,
  CORS_ORIGINS: originList,
  DEFAULT_OPERATOR_PHONE: z.string().optional(),
  // Creates this admin (E.164 phone, logs in by OTP) at startup if it does not exist yet.
  DEFAULT_ADMIN_PHONE: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('lotto-maker-scans'),
  PAIS_BASE_URL: z.string().url().default('https://www.pais.co.il'),
  // Maximum wallet balance (ILS). A deposit that would exceed it is rejected.
  WALLET_BALANCE_CAP: z.coerce.number().positive().default(2600),
  // Games that accept new orders (comma-separated). Other games keep their code but return 403 GAME_NOT_AVAILABLE.
  ENABLED_GAMES: z
    .string()
    .default('lotto')
    .transform((v) => v.split(',').map((g) => g.trim()).filter(Boolean)),
  // A win whose total for one order is at or below this is credited to the wallet;
  // above it the user collects it with the original ticket and ID.
  SMALL_PRIZE_LIMIT: z.coerce.number().positive().default(2600),
  // Withdrawals: the smallest amount, the fee of a bank transfer (deducted from the amount;
  // a card withdrawal is free) and the card-withdrawal size up to which no admin approval is needed.
  MIN_WITHDRAWAL_AMOUNT: z.coerce.number().positive().default(10),
  BANK_WITHDRAWAL_FEE: z.coerce.number().min(0).default(25),
  AUTO_APPROVE_WITHDRAWAL_LIMIT: z.coerce.number().min(0).default(500),
  // A prize above SMALL_PRIZE_LIMIT stays claimable this long after the draw (6 months).
  PRIZE_CLAIM_RETENTION_DAYS: z.coerce.number().int().positive().default(182),
  // Orders stop this long before Draw.salesCloseAt, so an operator still has time to key the form.
  ORDER_CLOSE_BUFFER_MINUTES: z.coerce.number().int().min(0).default(30),
  // An in-progress slot claimed by one operator can be taken over by another
  // only after it has sat untouched this long.
  SLOT_CLAIM_TIMEOUT_MINUTES: z.coerce.number().positive().default(10),
  // Only the mock provider exists so far; it is refused when NODE_ENV=production.
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Phase 6. Only the mock KYC provider exists so far; production returns 503 until a real one is added.
  KYC_PROVIDER: z.enum(['mock']).default('mock'),
  // Test switch: the mock provider sends every otherwise-valid check to manual review.
  KYC_MOCK_FORCE_MANUAL_REVIEW: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Raising or removing a responsible-gaming limit takes effect only after this delay.
  RG_LIMIT_INCREASE_DELAY_HOURS: z.coerce.number().min(0).default(24),
  // Fee receipts: VAT rate and the business details printed on them.
  VAT_RATE: z.coerce.number().min(0).max(1).default(0.18),
  BUSINESS_NAME: z.string().default(''),
  BUSINESS_ID: z.string().default(''),
  BUSINESS_ADDRESS: z.string().default(''),
  // Origins the hosted checkout may send the user back to (successUrl / cancelUrl), comma-separated,
  // e.g. "https://lotto.example,http://localhost:5173". Empty: return URLs are refused.
  CHECKOUT_RETURN_ORIGINS: originList,
  // Public base URL of this API, used to build hosted-checkout links.
  PUBLIC_API_URL: z.string().url().optional(),
  // AES-256-GCM key for ID numbers at rest. Losing it makes stored IDs unreadable.
  ID_ENCRYPTION_KEY: base64Key32.optional(),
  // HMAC-SHA256 key for the ID-number duplicate check. Changing it breaks that check.
  ID_HASH_KEY: base64Key32.optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * What production refuses to start without. Each entry is checked against the parsed env and
 * reported together, so a deploy shows the whole list at once instead of one name per restart.
 * Outside production none of these is required: dev and test fall back to local defaults.
 */
export function productionProblems(env: Env, raw: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const missing = (name: string, why: string) => problems.push(`${name} is missing (${why})`);

  if (env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters in production');
  if (env.JWT_REFRESH_SECRET.length < 32) problems.push('JWT_REFRESH_SECRET must be at least 32 characters in production');
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) problems.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
  if (!env.ID_ENCRYPTION_KEY) missing('ID_ENCRYPTION_KEY', 'encrypts ID numbers at rest');
  if (!env.ID_HASH_KEY) missing('ID_HASH_KEY', 'duplicate-ID check');
  if (!raw.REDIS_URL) missing('REDIS_URL', 'OTP, rate limits and job locks');
  if (!env.PAYMENT_WEBHOOK_SECRET) missing('PAYMENT_WEBHOOK_SECRET', 'verifies payment webhooks');
  if (!env.BUSINESS_NAME.trim()) missing('BUSINESS_NAME', 'printed on fee receipts');
  if (!env.BUSINESS_ID.trim()) missing('BUSINESS_ID', 'printed on fee receipts');
  if (!env.BUSINESS_ADDRESS.trim()) missing('BUSINESS_ADDRESS', 'printed on fee receipts');

  if (env.RUN_API) {
    if (env.ALLOWED_ORIGINS.length === 0 && env.CORS_ORIGINS.length === 0) {
      missing('ALLOWED_ORIGINS', 'CORS origins of the web app and dashboards');
    }
    if (env.CHECKOUT_RETURN_ORIGINS.length === 0) missing('CHECKOUT_RETURN_ORIGINS', 'where checkout may send the user back');
    if (!env.PUBLIC_API_URL) missing('PUBLIC_API_URL', 'builds checkout links');
    const insecure = [...env.ALLOWED_ORIGINS, ...env.CHECKOUT_RETURN_ORIGINS].filter(
      (o) => !o.startsWith('https://'),
    );
    if (insecure.length > 0) problems.push(`origins must be https in production: ${insecure.join(', ')}`);
  }
  return problems;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

/** Parses and checks an environment. Pure: tests call it with a hand-made env. */
export function loadConfig(input: NodeJS.ProcessEnv): ConfigResult {
  // An empty value (`SENTRY_DSN=` copied from .env.example) means unset, not an invalid value
  const raw = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = Object.entries(parsed.error.flatten().fieldErrors).map(
      ([name, msgs]) => `${name}: ${(msgs ?? []).join('; ')}`,
    );
    for (const msg of parsed.error.flatten().formErrors) errors.push(msg);
    return { ok: false, errors };
  }
  const problems = productionProblems(parsed.data, raw);
  if (problems.length > 0) return { ok: false, errors: problems };

  const env = parsed.data;
  const allowedOrigins =
    env.ALLOWED_ORIGINS.length > 0
      ? env.ALLOWED_ORIGINS
      : env.CORS_ORIGINS.length > 0
        ? env.CORS_ORIGINS
        : env.NODE_ENV === 'production'
          ? []
          : DEV_ORIGINS;
  return {
    ok: true,
    config: {
      ...env,
      ALLOWED_ORIGINS: allowedOrigins,
      TRUST_PROXY_HOPS: env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0),
      ENABLE_API_DOCS: env.ENABLE_API_DOCS ?? env.NODE_ENV !== 'production',
    },
  };
}

// Local web app, admin / operator dashboards and Expo web when ALLOWED_ORIGINS is unset outside production.
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8081',
  'http://localhost:19006',
];

export type Config = Omit<Env, 'TRUST_PROXY_HOPS' | 'ENABLE_API_DOCS'> & {
  TRUST_PROXY_HOPS: number;
  ENABLE_API_DOCS: boolean;
};

const result = loadConfig(process.env);

if (!result.ok) {
  console.error(
    `Invalid configuration (NODE_ENV=${process.env.NODE_ENV ?? 'development'}). Refusing to start:\n` +
      result.errors.map((e) => `  - ${e}`).join('\n'),
  );
  process.exit(1);
}

export const config: Config = result.config;

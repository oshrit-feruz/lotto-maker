import { z } from 'zod';

// A 32-byte key, base64-encoded (e.g. `openssl rand -base64 32`)
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
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
  CORS_ORIGINS: z.string().optional(),
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
  // Orders stop this long before Draw.salesCloseAt, so an operator still has time to key the form.
  ORDER_CLOSE_BUFFER_MINUTES: z.coerce.number().int().min(0).default(30),
  // An in-progress slot claimed by one operator can be taken over by another
  // only after it has sat untouched this long.
  SLOT_CLAIM_TIMEOUT_MINUTES: z.coerce.number().positive().default(10),
  // Only the mock provider exists so far; it is refused when NODE_ENV=production.
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Public base URL of this API, used to build hosted-checkout links.
  PUBLIC_API_URL: z.string().url().optional(),
  // AES-256-GCM key for ID numbers at rest. Losing it makes stored IDs unreadable.
  ID_ENCRYPTION_KEY: base64Key32.optional(),
  // HMAC-SHA256 key for the ID-number duplicate check. Changing it breaks that check.
  ID_HASH_KEY: base64Key32.optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const name of ['ID_ENCRYPTION_KEY', 'ID_HASH_KEY'] as const) {
    if (!env[name]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'Required in production' });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

# Deploying lotto-maker

How the production system is put together, what each service needs, and how to migrate, back up,
restore and roll back. Owner-only tasks that are not code (legal, providers, contracts) are in
[launch-checklist.md](launch-checklist.md).

## Services

| Service | What | Where | Built from |
|---|---|---|---|
| **API** | Fastify backend, all HTTP routes | Railway (Docker), 2+ replicas | `Dockerfile` with `RUN_JOBS=false` |
| **Worker** | Scheduled jobs (settlement, receipts, card credits, draw sync and results, prize-claim expiry, subscriptions) | Railway (Docker), **1 replica** | same image, `RUN_API=false`, `RUN_MIGRATIONS=false` |
| **Postgres 16** | All data | Railway Postgres or a managed Postgres with PITR | – |
| **Redis 7** | OTP codes, rate limits, job locks | Railway Redis or managed Redis | – |
| **Web** | Next.js customer site (`packages/web`) | Vercel | Vercel project, root `packages/web` |
| **Admin dashboard** | Vite SPA (`packages/admin-dashboard`) | Any static host (Vercel / Cloudflare Pages / S3+CDN) | `npm run build -w packages/admin-dashboard` → `dist/` |
| **Operator dashboard** | Vite SPA (`packages/operator-dashboard`) | Static host (today: GitHub Pages via `deploy-web.yml`) | `npm run build -w packages/operator-dashboard` |

The backend image contains only `packages/backend` and `packages/shared`; the web and dashboard
apps are never in it.

### API vs worker

One image, two roles (`src/main.ts`):

- `RUN_API=true` (default) serves the API. `RUN_JOBS=true` (default) runs the schedulers. Both on is
  the local-dev default.
- The worker (`RUN_API=false`) serves only `/health` and `/ready` on `PORT`, so the platform can
  health-check it.
- Every job run takes a Redis lock (`src/lib/job-lock.ts`), so a job never runs twice at once even
  if jobs end up enabled on several instances by mistake. Still, run **one** worker replica: the
  results fetcher keeps its retry back-off in memory.

### Health checks

| Path | Meaning | Use for |
|---|---|---|
| `GET /health` | Process is up. Checks nothing else. | Container liveness (`HEALTHCHECK` in the Dockerfile) |
| `GET /ready` | Postgres (`SELECT 1`) and Redis (`PING`) answer within `READY_CHECK_TIMEOUT_MS` (2 s). 503 otherwise, with per-check detail. | Deploy / load-balancer readiness (`railway.json` `healthcheckPath`) |

Both are exempt from rate limits and hidden from the API docs.

### Shutdown

On SIGTERM the process stops the schedulers and waits for running jobs, closes the HTTP server
(in-flight requests finish; new ones get 503), then disconnects Prisma and Redis. After
`SHUTDOWN_TIMEOUT_MS` (25 s) it exits anyway. Give the platform a stop grace period above that
(Railway: `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`).

## Environment variables

`.env.example` documents every variable. Production (`NODE_ENV=production`) refuses to start
while any required one is missing and prints the whole list at once (`src/config.ts`).

### API service

| Variable | Required in prod | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | Postgres; add `?connection_limit=10` per replica as needed |
| `REDIS_URL` | yes | |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | 32+ chars each, different. `openssl rand -base64 48` |
| `ID_ENCRYPTION_KEY`, `ID_HASH_KEY` | yes | `openssl rand -base64 32`. **Back both up outside the platform**: losing the first makes stored ID numbers unreadable; changing the second breaks the duplicate-ID check |
| `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` | yes (secret) | Only `mock` exists and it is refused in production: deposits stay closed until a real provider is added |
| `PUBLIC_API_URL` | yes | `https://api.<domain>`, builds checkout links |
| `ALLOWED_ORIGINS` | yes | Exact https origins of web, admin and operator apps, comma-separated |
| `CHECKOUT_RETURN_ORIGINS` | yes | Origins checkout may return to (normally the web origin) |
| `BUSINESS_NAME`, `BUSINESS_ID`, `BUSINESS_ADDRESS` | yes | Printed on fee receipts |
| `RUN_JOBS` | – | `false` on the API |
| `TRUST_PROXY_HOPS` | – | Default 1 in production (Railway's edge). Rate limits key on the client IP, so this must match the real number of proxies |
| `TWILIO_*`, `FIREBASE_*`, `R2_*` | for those features | SMS, push, ticket-scan storage |
| `LOG_LEVEL`, `BODY_LIMIT_BYTES`, `RATE_LIMIT_GLOBAL_PER_MINUTE`, `ENABLE_API_DOCS`, `SENTRY_DSN` | – | Defaults are production-safe |
| `DEFAULT_ADMIN_PHONE`, `DEFAULT_OPERATOR_PHONE` | first deploy | Creates the first admin / operator if missing |

### Worker service

Same as the API (use Railway shared variables), plus `RUN_API=false` and `RUN_MIGRATIONS=false`.
`ALLOWED_ORIGINS`, `CHECKOUT_RETURN_ORIGINS` and `PUBLIC_API_URL` are not required on the worker.

### Web (Vercel)

`NEXT_PUBLIC_API_URL` (public API URL), `NEXT_PUBLIC_BRAND_NAME`, optional `API_URL` (server-side
override). See `packages/web/.env.example`.

### Admin / operator dashboards

`VITE_API_URL` at build time. Their origins must be in the API's `ALLOWED_ORIGINS`.

## Migrations

**Where they run:** on start of the **API** container, in `docker-entrypoint.sh`
(`RUN_MIGRATIONS=true`, default) before `node dist/main.js`. Prisma takes a Postgres advisory lock
during `migrate deploy`, so replicas starting together apply each migration once. The worker sets
`RUN_MIGRATIONS=false`. If a migration fails the container exits and the deploy fails its health
check, so the previous deployment keeps serving.

Alternative, if you prefer a release step: set `RUN_MIGRATIONS=false` everywhere and configure a
Railway pre-deploy command `cd /app/packages/backend && /app/node_modules/.bin/prisma migrate deploy`.

Rules for writing migrations (this is what makes rollback possible):

- **Expand, then contract.** A migration must work with the code before it *and* after it: add
  columns nullable or with a default; never rename or drop in the same release that stops using
  something. Drop it a release later.
- Long data backfills go in code (like `backfillIdEncryption`), not in a migration that holds locks.
- CI (`.github/workflows/ci.yml`, job *Migrations*) applies every migration to an empty
  Postgres 16 and checks `schema.prisma` has not drifted from them. Objects Prisma cannot express
  (partial unique indexes, CHECK constraints) live only in migration SQL and are listed in
  `packages/backend/prisma/sql-only-objects.txt`.

## Backups and restore

Pick one, preferably both:

1. **Point-in-time recovery (PITR).** A managed Postgres with WAL archiving (Railway's backups,
   Neon, Supabase, RDS, Crunchy). Keep at least 7 days, 30 if the plan allows. This is what
   recovers from "someone ran a bad UPDATE at 14:02".
2. **Daily logical dumps** (independent of the provider), e.g. a scheduled job:

   ```sh
   pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
     | gzip > lotto-$(date -u +%Y%m%dT%H%MZ).dump.gz
   # upload to a bucket in a different account / region, encrypted, 30-day retention
   ```

   The dump contains encrypted ID numbers. It is useless without `ID_ENCRYPTION_KEY`, so store the
   keys separately from the dumps (a password manager or secret store, not the same bucket).

Redis holds nothing that must survive (OTP codes, rate-limit counters, locks); no backup needed.

### Restore drill (do it before launch, then quarterly)

1. Create a scratch Postgres 16 database.
2. Restore the latest dump: `gunzip -c lotto-….dump.gz | pg_restore --no-owner --no-acl -d "$SCRATCH_URL"`
   (or create a PITR branch / clone to a timestamp in the provider's console).
3. `DATABASE_URL=$SCRATCH_URL npx prisma migrate status` from `packages/backend`: should say the
   schema is up to date.
4. Start an API against it locally with production keys (`ID_ENCRYPTION_KEY`, `ID_HASH_KEY`) and
   `RUN_JOBS=false`, and check `/ready`, an admin login, a user's wallet balance against
   `SELECT sum(amount) FROM "WalletTransaction" WHERE "userId" = …`, and that a stored ID number
   decrypts.
5. Write down how long it took and the dump's timestamp (the data-loss window). Delete the scratch DB.

## Rollback

- **Code only (no migration in the release):** redeploy the previous deployment (Railway:
  *Deployments → … → Redeploy*; Vercel: *Promote* the previous deployment). Safe at any time.
- **Release with a migration:** because migrations are expand-only, the previous code runs fine on
  the migrated schema: roll back the code as above and leave the schema. Do not hand-edit
  `_prisma_migrations`.
- **Bad migration / data damage:** stop the worker first (so jobs stop moving money), put the API
  in maintenance if needed, then restore with PITR to just before the change (to a new database),
  verify as in the restore drill, and point `DATABASE_URL` at it. Then fix forward with a new
  migration.
- **Web / dashboards:** independent of the API; roll back on their host.

## Logs and errors

- JSON logs (pino) on stdout, one line per request with `reqId`; responses carry `x-request-id`.
  Authorization headers, cookies, ID numbers, card tokens, OTP codes and query tokens are redacted
  (`src/lib/redact.ts`). In production the modules' `console.*` output is routed into the same logger.
- Each job run logs `job`, `outcome` (`ran` / `failed` / `skipped_locked` / `skipped_lock_unavailable`)
  and `durationMs`. Alert on `outcome=failed` and on no `job settlement done` line for 10 minutes.
- Errors: `reportError` (`src/lib/report-error.ts`). Sentry is optional and off by default: set
  `SENTRY_DSN` and add `@sentry/node` to the backend to enable it.

## Rate limits (Redis-backed, per IP and per signed-in user)

Global: `RATE_LIMIT_GLOBAL_PER_MINUTE` per IP (120). Stricter rules in
`src/lib/route-limits.ts`: OTP send (10 / 15 min and 30 / day per IP, plus 3 / 10 min per phone in
the OTP module), OTP verify (20 / 15 min per IP, 10 per phone, plus the 5-attempt lock per code),
refresh, checkout (10 / 10 min per user), withdrawals (10 / h per user), orders, KYC and admin. If
Redis is down the limiters let requests through and log it.

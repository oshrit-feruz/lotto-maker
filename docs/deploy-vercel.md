# Staging on Vercel

The staging environment runs every app from this monorepo on Vercel: four Vercel projects, one per
package, plus Neon Postgres and Upstash Redis from the Vercel Marketplace. Production stays on the
Docker image ([deploy.md](deploy.md)); nothing here changes it.

| Project (suggested name) | Root Directory | What runs |
|---|---|---|
| `lotto-backend-staging` | `packages/backend` | Fastify API as one Vercel Function (`api/index.js` → `src/vercel.ts`), Vercel Cron for the scheduled jobs |
| `lotto-web-staging` | `packages/web` | Next.js customer site |
| `lotto-admin-staging` | `packages/admin-dashboard` | Vite SPA (static) |
| `lotto-operator-staging` | `packages/operator-dashboard` | Vite PWA (static) |

Each package has a `vercel.json` with its framework, install and build commands, so the dashboard
settings below are only Root Directory and environment variables. "Staging" here means the
**Production** environment of these four projects: their production branch is `main`, and their
production domains (`<project>.vercel.app`) are the staging URLs. Vercel Cron only calls production
deployments.

## How the backend runs on Vercel

- **Entry.** `packages/backend/vercel.json` sets the framework to *Other*, rewrites every path to
  `/api`, and `api/index.js` re-exports `dist/vercel.js` (built from `src/vercel.ts`). That file
  builds the same Fastify app as `src/main.ts` but never calls `listen()`: each request is passed to
  Fastify's server, as in Fastify's own Vercel guide. The app is built once per function instance
  and reused (Fluid compute runs many requests per instance). `src/main.ts`, the Dockerfile and
  Railway are unchanged.
  Vercel's zero-config Fastify detection is not used on purpose: it looks for `src/server.ts`
  among its entry names, and ours exports `buildApp` without listening.
- **Env fix-ups** (`src/lib/platform-env.ts`, applied before the config is read; a value you set
  yourself always wins): `REDIS_URL` from Upstash's `KV_URL`; `pgbouncer=true` added to a Neon
  pooled `DATABASE_URL`; `RUN_JOBS=false`; `TRUST_PROXY_HOPS=1` (Vercel's edge sets
  `X-Forwarded-For`, rate limits key on it); `SSE_MAX_CONNECTION_MS=270000`.
- **Build** (`scripts/vercel-build.sh`): shared → `prisma generate` → on **production** deployments
  only, `prisma migrate deploy` against `DATABASE_URL_UNPOOLED` (the direct Neon URL; migrate needs
  a session-level advisory lock that PgBouncer's transaction mode does not keep) → `tsc`. Preview
  deployments never migrate, since a branch may carry an unmerged migration. Prisma's `native`
  engine target is the right one: Vercel builds and runs functions on the same Linux image.
- **Startup seed.** The first request on each new function instance runs the same startup seed as
  the Docker API (default location, `DEFAULT_ADMIN_PHONE` / `DEFAULT_OPERATOR_PHONE`, the ID-number
  backfill), under the Redis job lock. It only creates rows that are missing.
- **Scheduled jobs.** There is no long-running process, so node-cron is off. `vercel.json` `crons`
  calls `GET /cron/<job>` for every job in `src/cron/index.ts` (a unit test keeps the two lists
  equal). Vercel sends `Authorization: Bearer $CRON_SECRET`; `src/cron/http.ts` checks it in constant
  time and runs the job through the same `runJob` (Redis lock, one log line per run) as the worker.
  Without `CRON_SECRET` the routes answer 404. Responses: 200 ran / skipped (another instance holds
  the lock), 401 wrong secret, 500 the job failed, 503 Redis unreachable.

  | Job | In-process schedule (Israel time unless noted) | Vercel Cron (always UTC) |
  |---|---|---|
  | settlement, receipts | every minute | `* * * * *` |
  | card-credits, draws-results | every 5 min | `*/5 * * * *` |
  | draws-sync | every 30 min (also once on start) | `*/30 * * * *` |
  | prize-claims | 09:00 daily | `0 7 * * *` (09:00 winter / 10:00 summer) |
  | subscriptions | 15:45 Tue/Thu/Sat | `45 12,13 * * 2,4,6`: two runs, 14:45 + 15:45 in winter, 15:45 + 16:45 in summer. The job is idempotent (SubscriptionEvent claims), so the second run does nothing once the first has run |

- **Operator queue (SSE).** A Vercel Function's duration limit includes streamed responses (300 s
  here, `maxDuration` in `vercel.json`). The stream therefore ends itself after
  `SSE_MAX_CONNECTION_MS` (270 s). The dashboard (`src/hooks/useQueue.ts`) treats the end like any
  dropped stream: it shows "disconnected", polls `GET /operator/queue` every 5 s, and reconnects after
  1 s; once the new stream opens it stops polling. So the queue stays current; operators see a short
  "reconnecting" every ~4.5 minutes. Each open stream holds one Redis subscriber connection.

## 1. Create the projects

For each row of the table above: **Add New → Project**, import `oshrit-feruz/lotto-maker`, set
**Root Directory**, leave Framework / Build / Output / Install as detected (the package's
`vercel.json` overrides them anyway), keep **Include files outside the root directory in the Build
Step** on (default for monorepos; every build needs `packages/shared` and the root lockfile).
Production branch: `main`.

Exact settings each `vercel.json` applies:

| Project | Framework | Install Command | Build Command | Output Directory |
|---|---|---|---|---|
| backend | Other | `cd ../.. && npm ci --ignore-scripts --no-audit --no-fund -w packages/backend -w packages/shared && npm rebuild prisma @prisma/engines` | `sh scripts/vercel-build.sh` | `public` (only `robots.txt`; everything else is rewritten to the function) |
| web | Next.js | `cd ../.. && npm ci --ignore-scripts --no-audit --no-fund -w packages/web -w packages/shared` | `cd ../.. && npm run build -w packages/web` (its `prebuild` builds shared) | Next.js default |
| admin | Vite | `cd ../.. && npm ci --ignore-scripts --no-audit --no-fund -w packages/admin-dashboard -w packages/shared` | `cd ../.. && npm run build -w packages/shared && npm run build -w packages/admin-dashboard` | `dist` + SPA rewrite to `/index.html` |
| operator | Vite | same with `packages/operator-dashboard` | same with `packages/operator-dashboard` | `dist` + SPA rewrite to `/index.html` |

Backend only: `fluid: true`, region `fra1` (Frankfurt, closest to Israel), `maxDuration: 300` and
the `crons` list. Node.js version: the project default (22.x or later).

Optional: **Settings → Git → Ignored Build Step** with
`npx turbo-ignore --fallback=HEAD^1` so a commit that only touches another package does not rebuild
this one.

The first deploys will fail until the variables below are set; that is expected. Note each
project's production domain (`https://<project>.vercel.app`), the variables reference them.

## 2. Marketplace storage (backend project only)

1. **Neon** (Storage → Create Database → Neon, or Marketplace → Neon). Region **AWS Frankfurt
   (eu-central-1)**, next to the `fra1` function. Connect it to the **backend** project only, for
   all environments, with **no custom prefix** (the code reads the default names). It adds
   `DATABASE_URL` (pooled, through PgBouncer) and `DATABASE_URL_UNPOOLED` (direct), plus `PG*` and
   `POSTGRES_*` variables that are not used. If you enable Neon's preview branching, preview
   deployments get their own database branch; they still do not run migrations.
2. **Upstash Redis** (Marketplace → Upstash → Redis). Region **eu-central-1**. Connect it to the
   backend project. It adds the TCP URL as `KV_URL` (newer installs also `REDIS_URL`) plus
   `KV_REST_API_*`. The backend uses the `rediss://` TCP URL through ioredis (OTP codes, rate limits,
   job locks, the operator queue's pub/sub); the REST variables are not used. Redis is required:
   without it nobody can log in (OTP).

Both inject their variables on the next deployment; redeploy after connecting.

## 3. Environment variables

Set them for the **Production** environment (and Preview, if you use preview deployments). Generate
secrets with `openssl rand -hex 32` (letters and digits only, which `CRON_SECRET` needs because
Vercel sends it in a header) and keys with `openssl rand -base64 32`. Mark secrets as Sensitive.

### Backend

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | From Neon (step 2). Do not edit |
| `KV_URL` / `REDIS_URL` | From Upstash (step 2) |
| `NODE_ENV` | `development`. Staging keeps the non-production behaviour: console SMS, mock payments and mock KYC are allowed, and the production-only checks (business details, https origins) are off. Side effect: Prisma logs each SQL statement (without parameters) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two different random values (`openssl rand -hex 32`) |
| `ID_ENCRYPTION_KEY`, `ID_HASH_KEY` | `openssl rand -base64 32` each. Optional outside production (a public dev key is used otherwise) but set them, so staging data is encrypted like production. Never change them once users exist |
| `CRON_SECRET` | `openssl rand -hex 32`. Without it every cron call gets 404 and no job runs |
| `ALLOWED_ORIGINS` | `https://<admin>.vercel.app,https://<operator>.vercel.app,https://<web>.vercel.app` (exact origins, no trailing slash) |
| `CHECKOUT_RETURN_ORIGINS` | `https://<web>.vercel.app` |
| `PUBLIC_API_URL` | `https://<backend>.vercel.app` (builds the mock checkout links) |
| `PAYMENT_PROVIDER` | `mock` |
| `PAYMENT_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `SMS_PROVIDER` | `console` (see "Logging in" below) |
| `DEFAULT_ADMIN_PHONE` | Your phone in E.164, e.g. `+9725XXXXXXXX`: created as admin on first start |
| `DEFAULT_OPERATOR_PHONE` | A second phone in E.164 for the operator dashboard (optional) |
| `ENABLE_API_DOCS` | Optional. Swagger UI at `/docs` is on by default outside production; `false` hides it |
| `MIGRATE_ON_BUILD` | Optional. `false` stops the build from running `prisma migrate deploy` |
| `BUSINESS_NAME`, `BUSINESS_ID`, `BUSINESS_ADDRESS` | Optional in staging (printed on fee receipts) |
| `R2_*`, `FIREBASE_*` | Optional: ticket-scan storage and push, as in [deploy.md](deploy.md) |

Do not set `RUN_JOBS`, `TRUST_PROXY_HOPS` or `SSE_MAX_CONNECTION_MS`: the Vercel entry sets them.
`PORT` is not used.

### Web

| Variable | Value |
|---|---|
| `API_URL` | `https://<backend>.vercel.app`. Read at runtime by the server-side proxy (`/api/proxy/*`) and SSR pages; `NEXT_PUBLIC_API_URL` also works but is inlined at build time |

Do not set `NODE_ENV` here (Next.js builds and runs as production; the session cookies are then
`Secure`).

### Admin and operator dashboards

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<backend>.vercel.app` (no trailing slash). Inlined at build time: changing it needs a redeploy. The build fails on Vercel without it, because the SPA would otherwise call its own origin |

After every variable is set, redeploy the backend first (it migrates the database), then the
three frontends.

### Cross-origin calls and cookies

- **Admin and operator** call the backend from the browser with a bearer token (no cookies), so
  CORS is all they need: their origins must be in `ALLOWED_ORIGINS`, exactly.
- **Web** never calls the backend from the browser. Its Next.js server proxies `/api/proxy/*` to
  `API_URL` and keeps the tokens in its own httpOnly, `SameSite=Lax`, `Secure` cookies on the web
  origin. Nothing has to be shared between subdomains, which matters because `vercel.app` is on the
  Public Suffix List and browsers would refuse a cookie for `.vercel.app` anyway.
- Preview deployments of a frontend have other origins and are **not** in `ALLOWED_ORIGINS`, so
  admin / operator previews cannot call the staging API. Test frontends on their production
  (staging) domain, or add a stable branch domain (`<project>-git-<branch>-<team>.vercel.app`) to
  `ALLOWED_ORIGINS`.
- **Deployment Protection**: keep the backend on *Standard Protection* (its production domain stays
  public: browsers, cron and checkout links must reach it). The three frontends may use *All
  Deployments* with Vercel Authentication to keep staging private; their calls to the backend are
  unaffected.

## 4. Migrations and seed data

- Migrations run in the backend build of every production deployment (step "Build" above). To run
  them by hand instead (`MIGRATE_ON_BUILD=false`):
  `DATABASE_URL="<DATABASE_URL_UNPOOLED>" npm run db:deploy` from the repo root, with the value from
  the Vercel dashboard (or `vercel env pull` in `packages/backend`).
- A failed migration fails the build, so the previous deployment keeps serving.
- Seed data: the admin and operator phones above, created on the first request after a deploy
  (`GET /health` is enough to trigger it).

## 5. Logging in on staging (OTP in the logs)

`SMS_PROVIDER=console` sends nothing; the backend writes the code to its log:

```
[OTP_DEV] +9725XXXXXXXX → 123456
```

1. Request a code on the web, admin or operator login screen.
2. Vercel dashboard → **lotto-backend-staging** → **Logs** (Runtime Logs). Search `OTP_DEV` (or the
   phone number) in the last few minutes. CLI: `vercel logs <backend deployment URL>` streams the
   same lines.
3. Codes expire like in production; request a new one if needed.

## 6. Cron

- After the first production deploy, the project's **Schedules → Cron Jobs** tab lists the seven
  jobs. **View Logs** shows each invocation; the job's own log line is
  `job <name> done` with its result.
- Run one now: `curl -H "Authorization: Bearer $CRON_SECRET" https://<backend>.vercel.app/cron/draws-sync`
  (also handy right after the first deploy, since draws-sync otherwise waits for the next
  half-hour tick).
- Rotating `CRON_SECRET`: change it, redeploy. A deployment keeps the value it was built with, so
  the header and the check always match.

## Limitations

- **Plan.** The backend's crons run every minute and every 5 minutes. **Hobby allows at most one
  run per day per cron and fails the deployment otherwise**, so the backend project needs **Pro**.
  On Hobby, remove `crons` from `packages/backend/vercel.json` and call the same
  `GET /cron/<job>` URLs with the same header from an external scheduler (for example a GitHub
  Actions workflow on a `*/5` schedule; GitHub's minimum interval is 5 minutes, so settlement and
  receipts would run every 5 minutes instead of every minute).
- **Cron delivery is best effort** and can repeat a run. Every job is idempotent and runs under the
  Redis lock, so a repeat does nothing. A missed run is not always caught up: the frequent jobs
  (settlement, receipts, card credits, draws) pick up outstanding work on the next tick, but the
  subscription job places orders only for the draw of the day it runs, so a missed Tuesday run is
  not made up on Thursday (the second daily run at 13:45 UTC is the only fallback). If Redis is
  unreachable, a cron call retries twice (after 2 s and 5 s) before answering 503.
- **Function duration**: 300 s per request (Hobby and Pro default; Pro can raise `maxDuration` up to
  800 s). This bounds each cron run and each SSE stream (see above).
- **Request body: 4.5 MB.** Vercel rejects larger bodies with 413 before they reach Fastify, so a
  ticket scan above 4.5 MB fails on staging (the backend itself accepts up to 10 MB). Phone photos
  are usually smaller; resize if not.
- **Results fetch back-off** is kept in memory (see deploy.md). On Vercel each cron call may land on
  a different, possibly fresh instance, so the back-off between failed fetches is not kept: a
  failing results source is retried on every `draws-results` tick (every 5 minutes).
- **Cold starts**: the first request on a new instance builds the app and runs the startup seed
  (a few queries). Later requests on that instance reuse it.
- **SSE**: operators see a brief reconnect every ~4.5 minutes; each open stream keeps a function
  instance and one Upstash connection busy, which counts toward Upstash's connection limit.
- **Logs**: with `NODE_ENV=development` the backend logs plain text from `console.*` plus Prisma's
  SQL lines, not the redacted JSON of production.
- **Region**: functions run in `fra1`. The draw-results scraper calls pais.co.il from there, as it
  would from any non-Israeli host.

## Sources

Vercel documentation as read on 2026-11-23:

- Fastify on Vercel: <https://vercel.com/docs/frameworks/backend/fastify> (Fluid compute by default,
  entrypoint names, cron with `CRON_SECRET`); Fastify's serverless guide for the
  `app.server.emit('request', req, res)` pattern: <https://fastify.dev/docs/latest/Guides/Serverless/#vercel>
- Monorepos / Turborepo (Root Directory, build commands, `turbo-ignore`):
  <https://vercel.com/docs/monorepos/turborepo>
- `vercel.json` (`framework: null` = Other, `installCommand`, `buildCommand`, `outputDirectory`,
  `functions.maxDuration`, `rewrites`, `crons`, `fluid`):
  <https://vercel.com/docs/project-configuration/vercel-json>
- Cron Jobs (GET to the production deployment, UTC only, expression limits) and Managing Cron Jobs
  (`CRON_SECRET` as `Authorization: Bearer`, no retries, best-effort delivery and duplicates, Hobby
  once a day, production only): <https://vercel.com/docs/cron-jobs>,
  <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
- Function limits (300 s default and Hobby maximum, 800 s Pro, duration includes streamed responses,
  4.5 MB request body, default region `iad1`): <https://vercel.com/docs/functions/limitations>,
  <https://vercel.com/docs/functions/configuring-functions/duration>
- Deployment Protection (Standard Protection leaves production domains public):
  <https://vercel.com/docs/deployment-protection>
- Neon native integration variables (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct, optional
  prefix): <https://neon.com/docs/guides/vercel-native-integration>
- Redis on Vercel (Marketplace providers; Vercel KV moved to Upstash): <https://vercel.com/docs/redis>.
  The Upstash pages do not list the injected names; `KV_URL` / `REDIS_URL` (TCP) and `KV_REST_API_*`
  are what the integration adds. Check the project's Environment Variables after connecting.

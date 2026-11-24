# Staging on Vercel

The staging environment runs every app from this monorepo as **one Vercel project** with
[Vercel Services](https://vercel.com/docs/services) (Beta), plus Neon Postgres and Upstash Redis
from the Vercel Marketplace. Production stays on the Docker image ([deploy.md](deploy.md)); nothing
here changes it.

All four apps build and deploy together from the root [`vercel.json`](../vercel.json), on one
domain. "Staging" is the project's **Production** environment (branch `main`,
`https://<project>.vercel.app`); Vercel Cron only calls production deployments.

| Service | Root | Public path | What runs |
|---|---|---|---|
| `web` | `packages/web` | `/` (everything not below) | Next.js customer site |
| `backend` | `packages/backend` | `/backend/` | Fastify API as one Vercel Function, Vercel Cron for the jobs |
| `admin` | `packages/admin-dashboard` | `/admin` | Vite SPA (static) |
| `operator` | `packages/operator-dashboard` | `/ops` | Vite PWA (static) |

The root `Dockerfile` is the Railway / Docker CI image. Vercel would detect it as a container
service; `vercel.json` lists the four services explicitly, so it is not deployed here.

## How it fits together

- **Routing.** Top-level `rewrites` in `vercel.json`, in order: `/backend/(.*)` → backend,
  `/admin` + `/admin/(.*)` → admin, `/ops` + `/ops/(.*)` → operator, `/(.*)` → web. A service gets
  the **original** path (`/backend/health` arrives as `/backend/health`), and routing into a
  service is final (its 404 is the answer; there is no fallback to the next rule).
- **Backend.** Entry `packages/backend/vercel-entry.js` → `src/vercel.ts`: the same Fastify app as
  `src/main.ts`, without `listen()`, built once per function instance. It strips a leading
  `/backend` from the URL before Fastify sees it (`src/lib/service-prefix.ts`), so the routes are
  unchanged and calls without the prefix (the binding below) work too. The entry is set
  explicitly because Vercel's Fastify detection would pick `src/server.ts`, which only exports
  `buildApp`. Region `fra1`, `maxDuration` 300 s.
- **Web → backend.** The `web` service has a [service binding](https://vercel.com/docs/services/bindings)
  to `backend` that injects `API_URL` at runtime. The Next.js server (proxy `/api/proxy/*`, auth
  routes, SSR pages) reads it through `apiBaseUrl()` and calls the backend privately, not through
  the public edge. Bindings exist only at runtime, so no build step reads `API_URL` (the pages that
  fetch are dynamic). A service cannot have Routing Middleware (Next.js middleware is an Edge
  function, which a service may not emit), so the login check of `/checkout`, `/payment/*` and
  `/account/*` runs in the pages (`src/lib/require-session.ts`).
- **Dashboards.** `scripts/vercel-build-spa.sh` builds each with `BASE_PATH=/admin/` or `/ops/`
  (Vite `base`) and `VITE_API_URL=/backend` (same origin), then copies `dist` to
  `vercel-out/admin/` or `vercel-out/ops/`, because the service is asked for
  `/admin/assets/...`. A service-scoped rewrite sends deep links to `index.html`. Admin's router
  uses `import.meta.env.BASE_URL` as basename; the operator PWA's manifest `start_url` / `scope`
  and its service worker scope are `/ops/`.
- **One origin.** The dashboards now call the API on their own origin, so CORS no longer matters
  for them (preview deployments work too). Web cookies are host-only with path `/`; nothing else
  uses cookies. The admin keeps its tokens in memory, the operator in `localStorage`, which is now
  shared with the site's origin.
- **Env fix-ups** (`src/lib/platform-env.ts`, backend only; a value you set yourself wins):
  `NODE_ENV` from `BACKEND_NODE_ENV`; `REDIS_URL` from Upstash's `KV_URL`; `pgbouncer=true` on a
  Neon pooled `DATABASE_URL`; `RUN_JOBS=false`; `TRUST_PROXY_HOPS=1`; `SSE_MAX_CONNECTION_MS=270000`.
- **Backend build** (`packages/backend/scripts/vercel-build.sh`): shared → `prisma generate` → on
  **production** deployments only, `prisma migrate deploy` against `DATABASE_URL_UNPOOLED` (direct
  Neon URL; migrate needs a session-level advisory lock that PgBouncer does not keep) → `tsc`.
  Preview deployments never migrate.
- **Startup seed.** The first request on each new function instance runs the Docker API's startup
  seed (default location, `DEFAULT_ADMIN_PHONE` / `DEFAULT_OPERATOR_PHONE`, ID backfill) under the
  Redis job lock. It only creates missing rows.
- **Scheduled jobs.** node-cron is off. The GitHub Actions workflow
  `.github/workflows/staging-cron.yml` calls `GET /backend/cron/<job>` for every job in
  `src/cron/index.ts` (a unit test keeps the lists equal), sending
  `Authorization: Bearer $CRON_SECRET`; `src/cron/http.ts` checks it in constant time and runs the
  job through `runJob` (Redis lock, one log line per run). Without `CRON_SECRET` the routes answer
  404. Responses: 200 ran / skipped (lock held elsewhere), 401 wrong secret, 500 failed, 503 Redis
  unreachable.

  | Job | In-process schedule (Israel time unless noted) | GitHub Actions (always UTC) |
  |---|---|---|
  | settlement, receipts | every minute | `*/5 * * * *` (GitHub's minimum is 5 min) |
  | card-credits, draws-results | every 5 min | `*/5 * * * *` |
  | draws-sync | every 30 min (also once on start) | `*/30 * * * *` |
  | prize-claims | 09:00 daily | `0 7 * * *` (09:00 winter / 10:00 summer) |
  | subscriptions | 15:45 Tue/Thu/Sat | `45 12,13 * * 2,4,6`: two runs; the job is idempotent (SubscriptionEvent claims), so the second does nothing once the first has run |

- **Operator queue (SSE).** A function's duration limit includes streamed responses, so the stream
  ends itself after 270 s. The dashboard (`src/hooks/useQueue.ts`) shows "disconnected", polls
  `GET /operator/queue` every 5 s and reconnects after 1 s. Operators see a short "reconnecting"
  every ~4.5 minutes. Each open stream holds one Redis subscriber connection.

## 1. Create the project

**Add New → Project**, import `oshrit-feruz/lotto-maker`:

- **Root Directory**: `./` (the repository root, where `vercel.json` is).
- **Framework Preset**: **Services** (detected from the `services` key). Leave Build / Output /
  Install empty: each service's commands are in `vercel.json`.
- Production branch: `main`.

The first deploy fails until the storage and variables below exist; that is expected.

## 2. Marketplace storage

Connect both to this project, all environments, **no custom prefix**:

1. **Neon** (Storage → Create Database → Neon). Region **AWS Frankfurt (eu-central-1)**, next to
   `fra1`. Adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct), plus unused `PG*` /
   `POSTGRES_*`.
2. **Upstash Redis** (Marketplace → Upstash → Redis). Region **eu-central-1**. Adds `KV_URL`
   (newer installs also `REDIS_URL`) and unused `KV_REST_API_*`. Required: without Redis nobody can
   log in (OTP).

## 3. Environment variables

Project variables are shared by all four services. Set them for **Production** (and Preview if you
use it). Secrets: `openssl rand -hex 32` (letters and digits, which `CRON_SECRET` needs); keys:
`openssl rand -base64 32`. Mark secrets Sensitive. `<domain>` is the project's production domain,
e.g. `lotto-staging.vercel.app`.

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KV_URL` / `REDIS_URL` | From Neon and Upstash (step 2). Do not edit |
| `BACKEND_NODE_ENV` | `development`: staging behaviour for the backend only (console SMS, mock payments and KYC allowed, production-only checks off; Prisma logs SQL). **Do not set `NODE_ENV`**: it would also apply to the Next.js build |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two different random values |
| `ID_ENCRYPTION_KEY`, `ID_HASH_KEY` | Base64 keys. Never change them once users exist |
| `CRON_SECRET` | Random hex. Without it no job runs |
| `ALLOWED_ORIGINS` | `https://<domain>` |
| `CHECKOUT_RETURN_ORIGINS` | `https://<domain>` |
| `PUBLIC_API_URL` | `https://<domain>/backend` (mock checkout links and the payment return page) |
| `PAYMENT_PROVIDER` | `mock` |
| `PAYMENT_WEBHOOK_SECRET` | Random hex |
| `SMS_PROVIDER` | `console` (see step 5) |
| `DEFAULT_ADMIN_PHONE` | Your phone in E.164 (`+9725XXXXXXXX`), created as admin |
| `DEFAULT_OPERATOR_PHONE` | Optional second phone for the operator dashboard |
| `ENABLE_API_DOCS`, `MIGRATE_ON_BUILD`, `BUSINESS_*`, `R2_*`, `FIREBASE_*` | Optional, as in [deploy.md](deploy.md). Swagger UI: `https://<domain>/backend/docs/` |

Do not set `API_URL` (the binding injects it), `VITE_API_URL` / `BASE_PATH` (the build script
sets them), `RUN_JOBS`, `TRUST_PROXY_HOPS`, `SSE_MAX_CONNECTION_MS` or `PORT`. Then **Redeploy**.

URLs after the deploy: site `https://<domain>/`, admin `https://<domain>/admin`, operator
`https://<domain>/ops`, API `https://<domain>/backend/health`.

**Deployment Protection**: *Standard Protection* keeps the production domain public (cron and
checkout links must reach `/backend`). *All Deployments* would also protect the production
domain, which blocks the payment return and webhook; do not use it here.

## 4. Migrations and seed data

- Migrations run in the backend build of every production deployment. To run them by hand
  (`MIGRATE_ON_BUILD=false`): `DATABASE_URL="<DATABASE_URL_UNPOOLED>" npm run db:deploy` from the
  repo root. A failed migration fails the whole deployment; the previous one keeps serving.
- Seed: the admin and operator phones, created on the first request after a deploy
  (`GET /backend/health` is enough).

## 5. Logging in on staging (OTP in the logs)

`SMS_PROVIDER=console` sends nothing; the backend logs the code:

```
[OTP_DEV] +9725XXXXXXXX → 123456
```

Request a code on any login screen, then **Logs** (Runtime Logs) of the project: search `OTP_DEV`
(or the phone) in the last few minutes, filtering to the backend function if needed. CLI:
`vercel logs <deployment URL>`.

## 6. Cron

- In GitHub: repo Settings → Secrets and variables → Actions → add variable `STAGING_URL`
  (`https://<domain>`) and secret `CRON_SECRET` (same value as in Vercel).
- GitHub → Actions → **Staging cron** shows each run and the HTTP status per job; **Run workflow**
  runs one job now. The backend logs `job <name> done` in Vercel Logs.
- Run one now: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/backend/cron/draws-sync`.
- Rotating `CRON_SECRET`: change it in both places (GitHub Actions secret and Vercel env var),
  then redeploy Vercel. Changing only one makes every scheduled call return 401.

## Limitations

- **Services is in Beta.** Behaviour and configuration may still change.
- **One deployment ships everything.** Every deployment builds all four services; a failed build of
  one (including a failed migration) fails the whole deployment, and a rollback rolls back all four.
- **Plan: Hobby.** Hobby allows each Vercel cron at most once a day, so `vercel.json` has no
  `crons`. The jobs are triggered by `.github/workflows/staging-cron.yml` (every 5 / 30 minutes,
  daily, and the subscription runs), which calls `GET /backend/cron/<job>` with the same Bearer
  header. Set repo variable `STAGING_URL` and secret `CRON_SECRET` (same value as in Vercel); until
  then it does nothing. GitHub starts schedules up to a few minutes late. On **Pro** you can move
  the schedules back into `vercel.json` `crons` and delete the workflow.
- **Cron delivery is best effort** and can repeat; every job is idempotent and locked. A missed
  subscription run is not made up (the 13:45 UTC run is the only fallback).
- **Function limits**: 300 s per request (bounds cron runs and SSE streams), **4.5 MB request
  body** (a larger ticket scan fails with 413 here; the backend itself accepts 10 MB).
- **Rate limits for the site**: the Next.js server calls the backend over the binding without
  forwarding the visitor's IP, so per-IP limits on those calls (OTP) key on the web function,
  not the visitor, as they already did with separate projects.
- **Previews**: the dashboards work on any preview URL (same origin). The site's checkout does not:
  its return URL is on the preview origin, which is not in `CHECKOUT_RETURN_ORIGINS`.
- **Results fetch back-off** is in memory and not kept across instances, so a failing results
  source is retried on every `draws-results` tick.
- **Cold starts** build the app and run the startup seed; later requests reuse the instance.
- **Logs** with `BACKEND_NODE_ENV=development` are plain `console.*` text plus Prisma SQL lines.

## Sources

Vercel documentation as read on 2026-11-23: [Services](https://vercel.com/docs/services) (Beta;
build keys belong in each service; root Dockerfile detection),
[Routing](https://vercel.com/docs/services/routing) (original path, final routing),
[Bindings](https://vercel.com/docs/services/bindings) (runtime only, not in builds or middleware),
[Config reference](https://vercel.com/docs/services/config-reference),
[Build Output API: Services](https://vercel.com/docs/build-output-api/services) (no middleware or
Edge runtime inside a service), [Fastify](https://vercel.com/docs/frameworks/backend/fastify)
(entrypoint detection), [Cron Jobs](https://vercel.com/docs/cron-jobs),
[Function limits](https://vercel.com/docs/functions/limitations),
[Neon integration](https://neon.com/docs/guides/vercel-native-integration),
[Redis on Vercel](https://vercel.com/docs/redis). The Services docs do not say whether `crons` and
`regions` may sit at the top level; `vercel build` (CLI 66.6.0) accepts both and registers the
crons for the deployment.

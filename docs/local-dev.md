# Running lotto-maker locally (macOS)

Everything runs on your machine: Postgres 16, Redis, the backend API and the three web apps.
No SMS provider, payment provider or cloud account is needed: OTP codes are printed in the
backend console and payments use the mock provider.

Use **npm** (the repo is an npm-workspaces monorepo with a `package-lock.json`). Node 20 or 22.

| What | Port | Command (from the repo root) | Points at the API with |
|---|---|---|---|
| Backend API (Fastify) | 3000 | `npm run dev -w packages/backend` | – (`PORT` in `packages/backend/.env`) |
| Customer site (Next.js) | 3002 | `npm run dev -w packages/web` | `NEXT_PUBLIC_API_URL`, default `http://localhost:3000` |
| Operator dashboard (Vite) | 5173 | `npm run dev -w packages/operator-dashboard` | Vite proxy `/api` → `http://localhost:3000`; `VITE_API_URL` overrides |
| Admin dashboard (Vite) | 5174 | `npm run dev -w packages/admin-dashboard` | `VITE_API_URL`, default `http://localhost:3000` in dev |
| Mobile (Expo) | 8081 | `npm run dev -w packages/mobile` | `EXPO_PUBLIC_API_URL`, default `http://localhost:3000` |
| Postgres 16 | 5432 | Homebrew or Docker, below | `DATABASE_URL` |
| Redis | 6379 | Homebrew or Docker, below | `REDIS_URL` |

API docs (Swagger UI) are at http://localhost:3000/docs once the backend runs.

## 1. Postgres and Redis

### Homebrew

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# postgresql@16 is keg-only: put its tools (psql, createuser, createdb) on the PATH
echo 'export PATH="$(brew --prefix postgresql@16)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# The role and database DATABASE_URL expects (postgresql://user:password@localhost:5432/lotto_maker)
createuser --createdb user
psql -d postgres -c "ALTER ROLE \"user\" WITH PASSWORD 'password';"
createdb -O user lotto_maker

pg_isready && redis-cli ping     # "accepting connections" and "PONG"
```

### Docker (alternative)

```bash
docker run -d --name lotto-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=lotto_maker postgres:16
docker run -d --name lotto-redis -p 127.0.0.1:6379:6379 redis:7
```

Stop a Homebrew Postgres first (`brew services stop postgresql@16`), or both fight over 5432.

## 2. Install and configure

```bash
npm install
./packages/backend/scripts/init-env.sh
```

`init-env.sh` copies `packages/backend/.env.development.example` to `packages/backend/.env` and
fills the JWT secrets, ID keys and webhook secret with `openssl rand`. It never overwrites an
existing `.env` (delete it to start over). Then open `packages/backend/.env` and set:

- `SEED_ADMIN_PHONE`: your phone in E.164 (`+9725XXXXXXXX`). Logging in with it gives the admin role.
- `SEED_OPERATOR_PHONE` (optional): a second phone for the operator dashboard. One phone has one
  role: admin is checked first, then operator, otherwise you are a customer.

The backend reads only `packages/backend/.env` (`tsx watch --env-file=.env`). The root
`.env.example` lists every setting, including the production ones.

The web app works without its own env file (defaults to `http://localhost:3000`). To change it:
`cp packages/web/.env.example packages/web/.env.local`.

## 3. Database: migrate and seed

```bash
npm run db:deploy -w packages/backend    # applies all migrations (also seeds the price list)
npm run db:seed -w packages/backend      # dev data, safe to run again
```

The seed (`packages/backend/prisma/seed.ts`) creates, only where missing:

- the admin for `SEED_ADMIN_PHONE` (skipped with a log line when unset)
- one active location and one operator at it (with `SEED_OPERATOR_PHONE` when set)
- an open Lotto draw for the next Tuesday or Saturday 22:45 Israel time, sales closing 2 hours
  before, unless an open draw already exists. Seeded draws are numbered from 900001 so they never
  look like real pais.co.il draw numbers.

It refuses to run with `NODE_ENV=production`. `npm run db:migrate -w packages/backend`
(`prisma migrate dev`) is only for writing new migrations; it also runs the seed.

The backend's draw sync also fetches the real next draw from pais.co.il every 30 minutes when the
network allows, so you may see a real draw next to the seeded one.

## 4. Run

One terminal per app, from the repo root:

```bash
npm run dev -w packages/backend              # http://localhost:3000  (check: curl localhost:3000/ready)
npm run dev -w packages/web                  # http://localhost:3002
npm run dev -w packages/admin-dashboard      # http://localhost:5174
npm run dev -w packages/operator-dashboard   # http://localhost:5173
```

`predev` builds `packages/shared` and runs `prisma generate` before the backend starts.
`npm run dev` at the root starts everything through turbo, including Expo; separate terminals are
easier to read.

### Logging in: where the OTP is

Enter your phone on any login screen. With no Twilio settings the code is printed in the
**backend** terminal:

```
[OTP_DEV] +972501234567 → 123456
```

Use `SEED_ADMIN_PHONE` on the admin dashboard and `SEED_OPERATOR_PHONE` on the operator dashboard.
Any other number logs in to the web app as a customer (created on first login).

CORS: `ALLOWED_ORIGINS` in the example `.env` allows 3002, 5173, 5174 and Expo web (8081, 19006).
Add an origin there if you run an app on another port.

## Common problems

**`EADDRINUSE: address already in use :::3000`** (or 3002, 5173…). Another process holds the port,
often a backend from an earlier run or another clone:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN     # shows the PID and command
kill <PID>
```

**`pnpm` / `yarn` errors** (`workspace:` protocol, missing packages). Not supported: the repo uses
npm workspaces and `package-lock.json`. Delete any `pnpm-lock.yaml` / `node_modules` and run
`npm install`.

**turbo fails with `spawn Unknown system error -88`.** The turbo binary is for the wrong CPU
architecture, usually an x64 Node (Rosetta) on an Apple Silicon Mac, or `node_modules` copied
between machines. Check `node -p process.arch` (should be `arm64` on M-series), install an arm64
Node, then `rm -rf node_modules && npm install`. Or skip turbo and run each app with
`npm run dev -w <package>` as above.

**`@prisma/client did not initialize yet. Please run "prisma generate"`.** The generated client is
missing or for another schema (after `npm install`, a branch switch or a schema change):

```bash
npm run db:generate -w packages/backend
```

`npm run dev -w packages/backend` does this for you (`predev`); starting with `npx tsx src/main.ts`
does not.

**Backend exits with `Invalid configuration ... DATABASE_URL: Required`** or JWT errors. It found no
`packages/backend/.env`. Run `init-env.sh` (step 2) and start the backend with
`npm run dev -w packages/backend`, not from another folder.

**`Can't reach database server at localhost:5432`.** Postgres is not running
(`brew services list`, `docker ps`) or `DATABASE_URL` does not match the role/database you created.
`role "user" does not exist`: run the `createuser` / `createdb` lines from step 1.

**Two clones of the repo.** If you have two checkouts (e.g. `~/lotto-maker` and
`~/Projects/lotto-maker`), it is easy to edit one while the server runs from the other, or to have
`.env` in only one. Check where the running process lives: `lsof -nP -iTCP:3000 -sTCP:LISTEN`, then
`lsof -p <PID> | grep cwd`. Keep one clone, or give each its own ports and database.

**Stale data.** Start over with an empty database:

```bash
dropdb lotto_maker && createdb -O user lotto_maker
npm run db:deploy -w packages/backend && npm run db:seed -w packages/backend
```

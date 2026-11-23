#!/bin/sh
# Vercel build for the backend project (Root Directory: packages/backend). See docs/deploy-vercel.md.
#
# 1. shared -> Prisma client -> backend (dist/), the same order as the Dockerfile.
# 2. Production deployments of the project also apply pending migrations, against the direct
#    (unpooled) Neon URL: `migrate deploy` takes an advisory lock, which PgBouncer's transaction
#    mode does not keep. Preview deployments never migrate (they may carry unmerged migrations).
#    MIGRATE_ON_BUILD=false turns it off; then run `npm run db:deploy` yourself.
set -e

cd ../..
npm run build -w @lotto-maker/shared
cd packages/backend
npm exec --no -- prisma generate

if [ "$VERCEL_ENV" = "production" ] && [ "${MIGRATE_ON_BUILD:-true}" = "true" ]; then
  echo "[vercel-build] prisma migrate deploy"
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npm exec --no -- prisma migrate deploy
else
  echo "[vercel-build] skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset}, MIGRATE_ON_BUILD=${MIGRATE_ON_BUILD:-true})"
fi

npm run build

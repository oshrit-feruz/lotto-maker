#!/bin/sh
# Backend container entrypoint (see docs/deploy.md, "Migrations").
#
# RUN_MIGRATIONS=true (default): apply pending migrations before starting. Prisma takes a Postgres
# advisory lock for `migrate deploy`, so API replicas starting together apply them once.
# The worker service sets RUN_MIGRATIONS=false so only the API service migrates.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  /app/node_modules/.bin/prisma migrate deploy
fi

exec "$@"

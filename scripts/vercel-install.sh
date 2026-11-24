#!/bin/sh
# Install for every Vercel service (root vercel.json). Usage, from a service's root directory:
#   sh ../../scripts/vercel-install.sh
#
# Vercel builds the services one after another in the same checkout. `npm ci` deletes the root
# node_modules before installing, so a per-service `npm ci` removes files an earlier service has
# already built or traced (the web function's styled-jsx, the backend's generated Prisma client)
# and the deployment fails at "Deploying outputs" with ENOENT. So the first service installs every
# deployed workspace once and the later ones reuse it.
set -e

cd ../..
marker=node_modules/.vercel-install-done
if [ -f "$marker" ]; then
  echo "[vercel-install] node_modules already installed by an earlier service; skipping"
  exit 0
fi

npm ci --ignore-scripts --no-audit --no-fund \
  -w packages/shared -w packages/web -w packages/backend \
  -w packages/admin-dashboard -w packages/operator-dashboard
npm rebuild prisma @prisma/engines
touch "$marker"

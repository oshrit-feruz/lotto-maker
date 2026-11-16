# Backend image (API and worker). The web app (Vercel) and the admin / operator dashboards
# (static builds) are deployed separately and are not in this image. See docs/deploy.md.
#
# Same image, two services:
#   API:    RUN_JOBS=false                        (runs migrations on start, RUN_MIGRATIONS default true)
#   worker: RUN_API=false  RUN_MIGRATIONS=false   (scheduled jobs; serves only /health and /ready)

FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Every workspace manifest, so `npm ci` can check the lockfile; only backend + shared get installed
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/web/package.json packages/web/
COPY packages/admin-dashboard/package.json packages/admin-dashboard/
COPY packages/operator-dashboard/package.json packages/operator-dashboard/
COPY packages/mobile/package.json packages/mobile/

# Reproducible install from the lockfile, limited to the two workspaces the backend needs
RUN npm ci --ignore-scripts --no-audit --no-fund -w packages/backend -w packages/shared && npm rebuild prisma @prisma/engines

COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Prisma client (with the linux-musl engine from schema.prisma binaryTargets), then shared -> backend
RUN cd packages/backend && npm exec --no -- prisma generate
RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ── Runtime image ────────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache openssl tini
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs

ENV NODE_ENV=production
WORKDIR /app

# Files stay owned by root and are only readable by the runtime user, so the app cannot modify its own code.
# node_modules includes the prisma CLI (a devDependency) because migrations run from this image
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER nodejs
WORKDIR /app/packages/backend

EXPOSE 3000

# Liveness only (/health). Readiness (/ready: Postgres + Redis) is for the platform's deploy check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini forwards SIGTERM to node, which shuts down gracefully (src/lib/shutdown.ts)
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

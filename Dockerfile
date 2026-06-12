FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json tsconfig.base.json ./

# Exclude mobile + operator-dashboard workspaces (heavy Expo deps not needed for backend)
RUN node -e " \
  const p = JSON.parse(require('fs').readFileSync('package.json', 'utf8')); \
  p.workspaces = p.workspaces.filter(w => !w.includes('mobile') && !w.includes('operator')); \
  require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2)); \
"

# Copy only the packages we need
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Install deps (uses modified workspace list)
RUN npm install --legacy-peer-deps

# Generate Prisma client (must run before tsc so types are available)
RUN cd packages/backend && npx prisma generate

# Build shared → backend
RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ── Runtime image ──────────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Push schema to DB then start (db push creates tables if they don't exist)
CMD ["sh", "-c", "cd packages/backend && npx prisma db push --accept-data-loss && node dist/main.js"]

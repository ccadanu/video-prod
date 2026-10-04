# syntax=docker/dockerfile:1
# Satu image: API (Fastify) + web statis (Vite build). Satu proses, satu origin, tanpa reverse proxy khusus untuk berkas web.

# ── 1) Build: web + bundel API ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# ── 2) Dependensi runtime saja (tanpa devDependencies, tanpa PGlite) ─────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=@ccp/api && npm cache clean --force

# ── 3) Runtime ───────────────────────────────────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache tzdata curl
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    WEB_DIST=/app/apps/web/dist \
    TZ=Asia/Jakarta
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
# Migrasi database dijalankan otomatis saat start (aman untuk akses bersamaan: kunci advisory).
CMD ["node", "apps/api/dist/server.js"]

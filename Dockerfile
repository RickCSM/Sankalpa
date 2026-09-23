# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Multi-stage build for the Sankalpa Odisha stack.
#
#   target: api  -> Node 24 image that runs `drizzle-kit push` then the API
#   target: web  -> nginx image serving the built SPA + reverse-proxying /api
#
# docker-compose.yml builds both targets from this single Dockerfile so the
# expensive install/build layers are shared and cached.
# ---------------------------------------------------------------------------

# ============================ base ============================
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

# ===================== install + build =======================
FROM base AS build
# 1) Copy ONLY manifests first so the slow `pnpm install` layer stays cached and
#    re-runs only when dependencies change — not on every code edit. This keeps
#    routine `git pull && docker compose up --build` redeploys fast.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json       artifacts/api-server/
COPY artifacts/mockup-sandbox/package.json   artifacts/mockup-sandbox/
COPY artifacts/sankalpa-odisha/package.json  artifacts/sankalpa-odisha/
COPY lib/api-client-react/package.json       lib/api-client-react/
COPY lib/api-spec/package.json               lib/api-spec/
COPY lib/api-zod/package.json                lib/api-zod/
COPY lib/db/package.json                     lib/db/
COPY lib/object-storage-web/package.json     lib/object-storage-web/
COPY scripts/package.json                    scripts/
RUN pnpm install --frozen-lockfile
# 2) Copy the rest of the source and build the API bundle + web SPA.
COPY . .
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/sankalpa-odisha run build

# ========================= api runtime =======================
FROM base AS api
ENV NODE_ENV=production
# Bring the fully-installed, fully-built workspace across. This keeps both the
# self-contained API bundle (dist/index.mjs) and the drizzle-kit toolchain
# (needed for `pnpm --filter @workspace/db run push`) available at runtime.
COPY --from=build /app /app
RUN chmod +x /app/deploy/api-entrypoint.sh
EXPOSE 5000
ENTRYPOINT ["/app/deploy/api-entrypoint.sh"]

# ========================= web runtime =======================
FROM nginx:1.27-alpine AS web
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/sankalpa-odisha/dist/public /usr/share/nginx/html
EXPOSE 80 443

#!/bin/sh
# API container entrypoint.
#
# 1. Apply the database schema with drizzle-kit push (idempotent, diff-based —
#    this project has no migration files by design).
# 2. Start the API server, which then runs its own idempotent production
#    bootstrap + master-data seed (admin user, districts/blocks/occasions,
#    departments/categories) on boot.
#
# Postgres is already healthy before this runs (compose depends_on), but we
# retry the push a few times to absorb any brief startup races. stdin is closed
# so drizzle-kit can never hang waiting for an interactive confirmation in the
# non-TTY container — it fails fast instead, surfacing a clear error in logs.
set -e
cd /app

echo "[entrypoint] Applying database schema (drizzle-kit push)..."
attempt=0
until pnpm --filter @workspace/db run push < /dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo "[entrypoint] Schema push failed after $attempt attempts; aborting." >&2
    exit 1
  fi
  echo "[entrypoint] push failed (attempt $attempt); retrying in 3s..." >&2
  sleep 3
done

echo "[entrypoint] Schema ready. Starting API server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs

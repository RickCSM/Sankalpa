#!/usr/bin/env bash
# Convenience wrapper for the routine redeploy loop.
#   ./deploy/deploy.sh   ==  git pull && docker compose up -d --build (+ cleanup)
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

echo "==> Pulling latest code..."
git pull

echo "==> Building and (re)starting the stack..."
docker compose up -d --build

echo "==> Pruning dangling images..."
docker image prune -f >/dev/null

echo "==> Done. Status:"
docker compose ps

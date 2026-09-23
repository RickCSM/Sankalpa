#!/usr/bin/env bash
# One-time server setup: create .env with strong secrets and a TLS cert.
# Safe to re-run — it only fills placeholders and only creates missing certs.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required but not installed." >&2
  exit 1
fi

# 1. Create .env from the template if missing.
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# 2. Fill secret placeholders with random values.
if grep -q '^POSTGRES_PASSWORD=CHANGE_ME' .env; then
  pw="$(openssl rand -hex 24)"
  sed -i "s|^POSTGRES_PASSWORD=CHANGE_ME.*|POSTGRES_PASSWORD=${pw}|" .env
  echo "Generated POSTGRES_PASSWORD"
fi
if grep -q '^SESSION_SECRET=CHANGE_ME' .env; then
  ss="$(openssl rand -hex 32)"
  sed -i "s|^SESSION_SECRET=CHANGE_ME.*|SESSION_SECRET=${ss}|" .env
  echo "Generated SESSION_SECRET"
fi

# 3. Generate a self-signed TLS cert if none is present.
mkdir -p certs
if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/CN=sankalpa.local" >/dev/null 2>&1
  echo "Generated a self-signed TLS cert in ./certs/"
  echo "  -> Replace certs/fullchain.pem and certs/privkey.pem with real certs for production."
fi

echo
echo "Setup complete. Next:"
echo "  1. Edit .env and set PUBLIC_API_URL / ALLOWED_ORIGINS to your domain."
echo "  2. docker compose up -d --build"

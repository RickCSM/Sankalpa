#!/usr/bin/env bash
# One-time data migration: restore a Postgres dump into the running db service.
#
# Usage:  ./deploy/restore-db.sh [path-to-dump.sql]
# Default dump: sankalpa_db_dump.sql at the repo root.
#
# Generate a FRESH dump from the live source first (the committed dump is old):
#   pg_dump "$DATABASE_URL" > sankalpa_db_dump.sql
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

DUMP="${1:-sankalpa_db_dump.sql}"
if [ ! -f "$DUMP" ]; then
  echo "ERROR: dump file not found: $DUMP" >&2
  exit 1
fi

# Load DB name/user from .env.
set -a; . ./.env; set +a
USER_NAME="${POSTGRES_USER:-sankalpa}"
DB_NAME="${POSTGRES_DB:-sankalpa}"

echo "Restoring $DUMP into database '$DB_NAME' as '$USER_NAME'..."
docker compose exec -T db psql -U "$USER_NAME" -d "$DB_NAME" < "$DUMP"
echo "Restore complete. Restart the API so it re-seeds idempotently: docker compose restart api"

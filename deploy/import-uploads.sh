#!/usr/bin/env bash
# One-time data migration: import previously-exported uploaded files into the
# `uploads` Docker volume.
#
# The old export uses the Replit object-storage layout (./.private/uploads/<uuid>),
# but the local-disk app reads from <UPLOAD_DIR>/uploads/<uuid>. This script
# remaps the former into the latter inside the volume.
#
# Usage:  ./deploy/import-uploads.sh [path-to-export.tar.gz]
# Default: object_storage_export.tar.gz at the repo root.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

ARCHIVE="${1:-object_storage_export.tar.gz}"
if [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: export archive not found: $ARCHIVE" >&2
  exit 1
fi

echo "Importing $ARCHIVE into the uploads volume..."
docker compose run --rm --no-deps \
  --entrypoint sh \
  -v "$PWD/$ARCHIVE:/import.tar.gz:ro" \
  api -c '
    set -e
    mkdir -p /app/uploads/uploads /app/uploads/public
    tmp=$(mktemp -d)
    tar xzf /import.tar.gz -C "$tmp"
    if [ -d "$tmp/.private/uploads" ]; then
      cp -an "$tmp/.private/uploads/." /app/uploads/uploads/
      echo "Imported private uploads -> uploads/uploads/"
    fi
    if [ -d "$tmp/public" ]; then
      cp -an "$tmp/public/." /app/uploads/public/
      echo "Imported public objects -> uploads/public/"
    fi
    rm -rf "$tmp"
  '
echo "Upload import complete."

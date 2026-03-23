#!/usr/bin/env sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/rollback-production.sh <git-ref>" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
REF="$1"

cd "$APP_DIR"

./scripts/backup-sqlite.sh

git fetch --all --tags
git reset --hard "$REF"

docker compose -f docker-compose.production.yml up -d --build

echo "Rolled back to: $REF"

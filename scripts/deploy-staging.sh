#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
REF="${1:-origin/main}"

cd "$APP_DIR"

if [ ! -f ".env.staging" ]; then
  echo ".env.staging not found" >&2
  exit 1
fi

if docker inspect zona-it-staging-postgres >/dev/null 2>&1; then
  /bin/sh ./scripts/backup-staging.sh || true
fi

git fetch --all --tags
git reset --hard "$REF"

docker compose --env-file .env.staging -f docker-compose.postgres.staging.yml up -d --build

echo "Staging deployed: $REF"

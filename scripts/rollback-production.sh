#!/usr/bin/env sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/rollback-production.sh <git-ref>" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
REF="$1"

cd "$APP_DIR"

if [ -f ".env.production" ]; then
  set -a
  . ./.env.production
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
if [ "${DB_CLIENT:-sqlite}" = "postgres" ]; then
  COMPOSE_FILE="docker-compose.postgres.production.yml"
fi

/bin/sh ./scripts/backup-production.sh

git fetch --all --tags
git reset --hard "$REF"

docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d --build

echo "Rolled back to: $REF"

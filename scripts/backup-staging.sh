#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zona-it-support/backups/staging}"
PG_CONTAINER="${PG_CONTAINER:-zona-it-staging-postgres}"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

if [ -f ".env.staging" ]; then
  set -a
  . ./.env.staging
  set +a
fi

POSTGRES_DB="${POSTGRES_DB:-zona_it_staging}"
POSTGRES_USER="${POSTGRES_USER:-zona_it_staging}"

if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  echo "Staging PostgreSQL container not found: $PG_CONTAINER" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_FILE="$BACKUP_DIR/zona-it-staging-$STAMP.dump"

docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TARGET_FILE"

ls -1t "$BACKUP_DIR"/zona-it-staging-*.dump 2>/dev/null | awk 'NR>10 { print }' | xargs -r rm -f

echo "Backup created: $TARGET_FILE"

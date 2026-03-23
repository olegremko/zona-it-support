#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zona-it-support/backups}"
APP_CONTAINER="${APP_CONTAINER:-zona-it-app}"

mkdir -p "$BACKUP_DIR"

if ! docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  echo "App container not found: $APP_CONTAINER" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_FILE="$BACKUP_DIR/zona-it-$STAMP.db"
TMP_FILE="/tmp/$(basename "$TARGET_FILE")"

docker exec \
  -e TARGET_FILE="$TMP_FILE" \
  "$APP_CONTAINER" \
  node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('/app/backend/data/zona-it.db', { fileMustExist: true }); await db.backup(process.env.TARGET_FILE); db.close();"

docker cp "$APP_CONTAINER:$TMP_FILE" "$TARGET_FILE" >/dev/null
docker exec "$APP_CONTAINER" rm -f "$TMP_FILE" >/dev/null

ls -1t "$BACKUP_DIR"/zona-it-*.db 2>/dev/null | awk 'NR>10 { print }' | xargs -r rm -f

echo "Backup created: $TARGET_FILE"

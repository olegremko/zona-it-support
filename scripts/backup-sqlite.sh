#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zona-it-support/backups}"
DB_FILE="${DB_FILE:-$APP_DIR/backend/data/zona-it.db}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "Database file not found: $DB_FILE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$DB_FILE" "$BACKUP_DIR/zona-it-$STAMP.db"
ls -1t "$BACKUP_DIR"/zona-it-*.db | awk 'NR>10 { print }' | xargs -r rm -f

echo "Backup created: $BACKUP_DIR/zona-it-$STAMP.db"

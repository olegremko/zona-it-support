#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zona-it-support/backups}"
VOLUME_NAME="${VOLUME_NAME:-}"

mkdir -p "$BACKUP_DIR"

if [ -z "$VOLUME_NAME" ]; then
  VOLUME_NAME="$(docker volume ls --format '{{.Name}}' | grep '_zona_it_data$' | head -n 1 || true)"
fi

if [ -z "$VOLUME_NAME" ]; then
  echo "SQLite volume not found" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_FILE="$BACKUP_DIR/zona-it-$STAMP.db"
FILE_NAME="$(basename "$TARGET_FILE")"

docker run --rm \
  -v "$VOLUME_NAME:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3.20 \
  sh -c "cp /data/zona-it.db /backup/$FILE_NAME"

ls -1t "$BACKUP_DIR"/zona-it-*.db 2>/dev/null | awk 'NR>10 { print }' | xargs -r rm -f

echo "Backup created: $TARGET_FILE"

#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"

cd "$APP_DIR"

if [ -f ".env.production" ]; then
  set -a
  . ./.env.production
  set +a
fi

if [ "${DB_CLIENT:-sqlite}" = "postgres" ]; then
  exec /bin/sh "$APP_DIR/scripts/backup-postgres.sh"
fi

exec /bin/sh "$APP_DIR/scripts/backup-sqlite.sh"

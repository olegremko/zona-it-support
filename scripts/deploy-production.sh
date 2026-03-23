#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/zona-it-support/current}"
REF="${1:-origin/main}"

cd "$APP_DIR"

./scripts/backup-sqlite.sh

git fetch --all --tags
git reset --hard "$REF"

docker compose -f docker-compose.production.yml up -d --build

echo "Deployed ref: $REF"

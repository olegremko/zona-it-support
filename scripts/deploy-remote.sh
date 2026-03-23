#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env.remote"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.remote.example" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f docker-compose.remote.yml up -d
docker compose --env-file "$ENV_FILE" -f docker-compose.remote.yml ps

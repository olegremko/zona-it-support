# Staging Guide

## Goal

Run a separate pre-production environment on the same VPS without touching `https://i-zone.pro`.

## Topology

- app: `zona-it-staging-app`
- database: `zona-it-staging-postgres`
- external check URL: `http://SERVER_IP:4020`
- compose file: [docker-compose.postgres.staging.yml](C:\Users\user\Desktop\codex\docker-compose.postgres.staging.yml)

## Setup

Create `.env.staging` from [.env.staging.example](C:\Users\user\Desktop\codex\.env.staging.example).

## Deploy latest

```sh
cd /opt/zona-it-support/current
./scripts/deploy-staging.sh
```

## Deploy specific ref

```sh
cd /opt/zona-it-support/current
./scripts/deploy-staging.sh v2026.03.23-1
```

## Health check

- `http://SERVER_IP:4020/api/health`

## Staging backup

```sh
cd /opt/zona-it-support/current
./scripts/backup-staging.sh
```

## Next step

When needed, add `staging.i-zone.pro` in DNS and put it behind the existing reverse proxy.

# Staging Guide

## Goal

Run a separate pre-production environment on the same VPS without touching `https://i-zone.pro`.

## Topology

- app: `zona-it-staging-app`
- database: `zona-it-staging-postgres`
- external check URL: `http://SERVER_IP:4020`
- preferred URL: `https://staging.i-zone.pro`
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
- `https://staging.i-zone.pro/api/health`

## Staging backup

```sh
cd /opt/zona-it-support/current
./scripts/backup-staging.sh
```

## Next step

Create DNS record:

- `A`
- name: `staging`
- value: `2.27.54.185`
- TTL: `300`

# Production Guide

## Current Topology

- Domain: `https://i-zone.pro`
- Server: single VPS
- Reverse proxy: Caddy
- Application: Docker Compose
- Database: PostgreSQL in Docker volume `*_zona_it_pg_data`
- Project root on server: `/opt/zona-it-support/current`
- Backups directory on server: `/opt/zona-it-support/backups`

## Services

```sh
cd /opt/zona-it-support/current
docker compose --env-file .env.production -f docker-compose.postgres.production.yml ps
```

## Deploy Latest Version

```sh
cd /opt/zona-it-support/current
./scripts/deploy-production.sh
```

This will:
- create a production backup
- fetch the latest code from Git
- reset to `origin/main`
- rebuild and restart containers

## Deploy Specific Version

```sh
cd /opt/zona-it-support/current
./scripts/deploy-production.sh v2026.03.23-1
```

## Roll Back to Previous Version

```sh
cd /opt/zona-it-support/current
./scripts/rollback-production.sh <git-ref>
```

Example:

```sh
./scripts/rollback-production.sh v2026.03.23-1
```

## Create Manual Backup

```sh
cd /opt/zona-it-support/current
./scripts/backup-production.sh
```

## View Backups

```sh
ls -lah /opt/zona-it-support/backups
```

## View Logs

```sh
cd /opt/zona-it-support/current
docker compose --env-file .env.production -f docker-compose.postgres.production.yml logs -f app
docker compose --env-file .env.production -f docker-compose.postgres.production.yml logs -f caddy
```

## Restart Services

```sh
cd /opt/zona-it-support/current
docker compose --env-file .env.production -f docker-compose.postgres.production.yml restart
```

## Release Tags

Recommended pattern:

- `v2026.03.23-1`
- `v2026.03.25-1`
- `v2026.03.25-2`

Create tag locally:

```powershell
cd C:\Users\user\Desktop\codex
& "C:\Program Files\Git\cmd\git.exe" tag -a v2026.03.23-1 -m "First VPS production release"
& "C:\Program Files\Git\cmd\git.exe" push origin v2026.03.23-1
```

## Next Planned Infrastructure Step

- add a separate staging environment
- keep release flow unchanged
- later move app layer to Kubernetes without changing external domain setup

## PostgreSQL Cutover Files

- [docker-compose.postgres.production.yml](C:\Users\user\Desktop\codex\docker-compose.postgres.production.yml)
- [backup-postgres.sh](C:\Users\user\Desktop\codex\scripts\backup-postgres.sh)
- [backup-production.sh](C:\Users\user\Desktop\codex\scripts\backup-production.sh)
- [postgresql-cutover.md](C:\Users\user\Desktop\codex\backend\docs\postgresql-cutover.md)
- [STAGING.md](C:\Users\user\Desktop\codex\STAGING.md)

## PostgreSQL Foundation

Prepared files:

- [docker-compose.postgres.production.yml](C:\Users\user\Desktop\codex\docker-compose.postgres.production.yml)
- [.env.postgres.example](C:\Users\user\Desktop\codex\.env.postgres.example)
- [schema.postgres.sql](C:\Users\user\Desktop\codex\backend\sql\schema.postgres.sql)
- [postgresql-migration.md](C:\Users\user\Desktop\codex\backend\docs\postgresql-migration.md)

These files are the foundation for the upcoming backend rewrite from SQLite to PostgreSQL.

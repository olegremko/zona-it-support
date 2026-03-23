# PostgreSQL Migration Plan

## Why migration is not a config-only change

The current backend is tightly coupled to SQLite and `better-sqlite3`:

- synchronous `db.prepare(...).get()/all()/run()` is used across all modules
- startup migration logic relies on `PRAGMA`
- seed logic uses `INSERT OR IGNORE`
- several flows rely on SQLite-specific return shapes such as `.changes`

Because of this, PostgreSQL migration must be done as a staged refactor.

## Current production state

- Production is online on `https://i-zone.pro`
- Runtime stack is Docker + Caddy
- Current database is SQLite in Docker volume
- Backup/rollback flow is already in place

## Target architecture

- Reverse proxy: Caddy
- App: containerized Node.js backend
- DB: PostgreSQL 16
- Domain and HTTPS remain unchanged

## Files already prepared

- PostgreSQL schema: [schema.postgres.sql](C:\Users\user\Desktop\codex\backend\sql\schema.postgres.sql)
- PostgreSQL compose stack: [docker-compose.postgres.production.yml](C:\Users\user\Desktop\codex\docker-compose.postgres.production.yml)
- Example env: [.env.postgres.example](C:\Users\user\Desktop\codex\.env.postgres.example)

## Migration stages

### Stage 1. Foundation

- add PostgreSQL schema and env model
- prepare compose stack with dedicated `postgres` service
- keep production running on SQLite

### Stage 2. DB abstraction

- add async DB layer using `pg`
- introduce helper methods:
  - `queryOne`
  - `queryMany`
  - `execute`
  - transaction helper
- keep SQLite code untouched until PostgreSQL layer is ready

### Stage 3. Module rewrite

Rewrite in this order:

1. auth
2. permissions
3. users
4. companies
5. tickets
6. live chat
7. seed/init/startup migration logic

### Stage 4. Data migration

- export data from SQLite
- transform booleans/timestamps where needed
- import into PostgreSQL
- verify:
  - users
  - memberships
  - roles/permissions
  - tickets/messages
  - live chat conversations

### Stage 5. Production switch

- create PostgreSQL backup point
- switch `.env.production` to `DB_CLIENT=postgres`
- switch compose stack to [docker-compose.postgres.production.yml](C:\Users\user\Desktop\codex\docker-compose.postgres.production.yml)
- redeploy
- run smoke tests

## Risks to control

- synchronous to async rewrite may touch every route/module
- subtle differences in SQL syntax:
  - `?` placeholders -> `$1, $2`
  - `INSERT OR IGNORE` -> `ON CONFLICT DO NOTHING`
  - SQLite booleans -> PostgreSQL booleans
  - PRAGMA logic must be removed
- live chat and reports should be tested after query rewrite

## Recommended rollout

1. finish DB abstraction
2. rewrite modules locally
3. run local PostgreSQL stack
4. copy production SQLite data into PostgreSQL staging
5. verify all critical flows
6. schedule short maintenance window
7. switch production

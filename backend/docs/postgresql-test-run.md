# PostgreSQL Test Run

## Goal

Run the backend against PostgreSQL without touching production.

## Start test stack

```powershell
cd C:\Users\user\Desktop\codex
docker compose -f docker-compose.postgres.test.yml up --build -d
```

## Initialize schema and seed

```powershell
cd C:\Users\user\Desktop\codex\backend
$env:DB_CLIENT='postgres'
$env:DATABASE_URL='postgresql://zona_it:zona_it_test_password@localhost:5432/zona_it_test'
$env:POSTGRES_DB='zona_it_test'
$env:POSTGRES_USER='zona_it'
$env:POSTGRES_PASSWORD='zona_it_test_password'
node src/db/initDb.js
node src/db/seedDb.js
```

## Health check

Open:

- `http://localhost:4010/api/health`

Expected:

```json
{"ok":true}
```

## Login check

Use:

- `superuser@i-zone.pro`
- `demo1234`

## Stop test stack

```powershell
cd C:\Users\user\Desktop\codex
docker compose -f docker-compose.postgres.test.yml down
```

## Clean test database

```powershell
cd C:\Users\user\Desktop\codex
docker compose -f docker-compose.postgres.test.yml down -v
```

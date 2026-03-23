# PostgreSQL Cutover

## Goal

Move production from SQLite to PostgreSQL with a reversible, low-risk process.

## Recommended flow

1. Keep current production on SQLite running.
2. Start the PostgreSQL stack in parallel on a test port.
3. Copy production SQLite data into PostgreSQL.
4. Verify health, login, tickets, live chat, and reports on the PostgreSQL runtime.
5. Take a final SQLite backup.
6. Stop the SQLite app container.
7. Start the production stack with `docker-compose.postgres.production.yml`.
8. Verify the public site.
9. Keep the SQLite backup for rollback.

## Data migration command

Run inside the backend container or from a Node environment that can reach both databases.

```bash
DB_CLIENT=postgres \
DATABASE_URL=postgresql://zona_it:change-me@postgres:5432/zona_it \
SQLITE_PATH=/app/backend/data/zona-it.db \
node src/db/migrateSqliteToPostgres.js
```

## Validation checklist

- `GET /api/health` returns `{"ok":true}`
- `superuser@i-zone.pro / demo1234` can log in
- ticket list opens
- changing ticket status still works
- live chat list is visible
- reports show expected totals

## Rollback

If anything is wrong after cutover:

1. Stop PostgreSQL production stack
2. Restore the previous SQLite-based stack
3. Use the latest SQLite backup from `/opt/zona-it-support/backups`

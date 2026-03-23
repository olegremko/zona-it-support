import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

const sqlitePath = process.env.SQLITE_PATH || path.resolve(process.cwd(), 'data', 'zona-it.db');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for PostgreSQL migration');
}

if (!fs.existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found: ${sqlitePath}`);
}

const schemaPath = path.resolve(process.cwd(), 'sql', 'schema.postgres.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const pool = new Pool({ connectionString: databaseUrl });

const tables = [
  'companies',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_company_memberships',
  'tickets',
  'ticket_assignees',
  'ticket_messages',
  'ticket_attachments',
  'audit_log',
  'live_chat_conversations',
  'live_chat_messages'
];

function boolify(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return Boolean(value);
}

function parseJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readRows(tableName) {
  return source.prepare(`SELECT * FROM ${tableName}`).all();
}

async function ensureSchema(client) {
  await client.query(schemaSql);
}

async function truncateTarget(client) {
  const ordered = [...tables].reverse().join(', ');
  await client.query(`TRUNCATE ${ordered} CASCADE`);
}

async function importRows(client, tableName, rows, insertSql, mapRow) {
  for (const row of rows) {
    await client.query(insertSql, mapRow(row));
  }
  console.log(`${tableName}: ${rows.length}`);
}

const inserts = {
  companies: {
    sql: `
      INSERT INTO companies (
        id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    map: (row) => [
      row.id,
      row.name,
      row.slug,
      row.status,
      row.description ?? null,
      row.contact_email ?? null,
      row.contact_phone ?? null,
      row.address ?? null,
      row.created_at,
      row.updated_at
    ]
  },
  roles: {
    sql: `
      INSERT INTO roles (id, code, name, scope, is_system, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    map: (row) => [row.id, row.code, row.name, row.scope, boolify(row.is_system), row.created_at]
  },
  permissions: {
    sql: `
      INSERT INTO permissions (id, code, name, description)
      VALUES ($1, $2, $3, $4)
    `,
    map: (row) => [row.id, row.code, row.name, row.description ?? null]
  },
  role_permissions: {
    sql: `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ($1, $2)
    `,
    map: (row) => [row.role_id, row.permission_id]
  },
  users: {
    sql: `
      INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    map: (row) => [
      row.id,
      row.email,
      row.password_hash,
      row.full_name,
      row.status,
      boolify(row.is_global_admin),
      row.created_at,
      row.updated_at
    ]
  },
  user_company_memberships: {
    sql: `
      INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    map: (row) => [
      row.id,
      row.user_id,
      row.company_id,
      row.role_id,
      row.title ?? null,
      boolify(row.is_primary),
      row.created_at
    ]
  },
  tickets: {
    sql: `
      INSERT INTO tickets (
        id, number, company_id, created_by_user_id, subject, description, category,
        priority, status, visibility, created_at, updated_at, closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    map: (row) => [
      row.id,
      row.number,
      row.company_id,
      row.created_by_user_id,
      row.subject,
      row.description,
      row.category ?? null,
      row.priority,
      row.status,
      row.visibility,
      row.created_at,
      row.updated_at,
      row.closed_at ?? null
    ]
  },
  ticket_assignees: {
    sql: `
      INSERT INTO ticket_assignees (id, ticket_id, user_id, assigned_by_user_id, created_at, active)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    map: (row) => [
      row.id,
      row.ticket_id,
      row.user_id,
      row.assigned_by_user_id ?? null,
      row.created_at,
      boolify(row.active)
    ]
  },
  ticket_messages: {
    sql: `
      INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    map: (row) => [
      row.id,
      row.ticket_id,
      row.author_user_id ?? null,
      row.message_type,
      row.body,
      boolify(row.is_internal),
      row.created_at
    ]
  },
  ticket_attachments: {
    sql: `
      INSERT INTO ticket_attachments (
        id, ticket_id, message_id, original_name, storage_path, mime_type,
        size_bytes, uploaded_by_user_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    map: (row) => [
      row.id,
      row.ticket_id,
      row.message_id ?? null,
      row.original_name,
      row.storage_path,
      row.mime_type ?? null,
      row.size_bytes ?? 0,
      row.uploaded_by_user_id ?? null,
      row.created_at
    ]
  },
  audit_log: {
    sql: `
      INSERT INTO audit_log (
        id, actor_user_id, company_id, entity_type, entity_id, action, payload_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    map: (row) => [
      row.id,
      row.actor_user_id ?? null,
      row.company_id ?? null,
      row.entity_type,
      row.entity_id,
      row.action,
      parseJson(row.payload_json),
      row.created_at
    ]
  },
  live_chat_conversations: {
    sql: `
      INSERT INTO live_chat_conversations (
        id, public_token, visitor_name, visitor_contact, source_page, ticket_id,
        status, assigned_user_id, created_at, updated_at, last_message_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    map: (row) => [
      row.id,
      row.public_token,
      row.visitor_name,
      row.visitor_contact ?? null,
      row.source_page ?? null,
      row.ticket_id ?? null,
      row.status,
      row.assigned_user_id ?? null,
      row.created_at,
      row.updated_at,
      row.last_message_at
    ]
  },
  live_chat_messages: {
    sql: `
      INSERT INTO live_chat_messages (
        id, conversation_id, author_type, author_user_id, author_name, body, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    map: (row) => [
      row.id,
      row.conversation_id,
      row.author_type,
      row.author_user_id ?? null,
      row.author_name ?? null,
      row.body,
      row.created_at
    ]
  }
};

const client = await pool.connect();

try {
  await client.query('BEGIN');
  await ensureSchema(client);
  await truncateTarget(client);

  for (const tableName of tables) {
    const rows = readRows(tableName);
    const config = inserts[tableName];
    await importRows(client, tableName, rows, config.sql, config.map);
  }

  await client.query('COMMIT');
  console.log(`Migration completed from ${sqlitePath}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
  source.close();
}

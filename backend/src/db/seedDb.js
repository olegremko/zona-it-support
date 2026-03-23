import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { closeDb, execute, queryOne, withTransaction } from './client.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';

function sql(pgSql, sqliteSql = pgSql) {
  return env.dbClient === 'postgres' ? pgSql : sqliteSql;
}

const now = nowIso();

const roles = [
  ['role_client_admin', 'client_admin', 'Client Admin', 'company'],
  ['role_client_user', 'client_user', 'Client User', 'company'],
  ['role_support_agent', 'support_agent', 'Support Agent', 'company'],
  ['role_support_lead', 'support_lead', 'Support Lead', 'company'],
  ['role_platform_admin', 'platform_admin', 'Platform Admin', 'global']
];

const permissions = [
  ['perm_ticket_view_company', 'ticket.view.company', 'View company tickets'],
  ['perm_ticket_create', 'ticket.create', 'Create ticket'],
  ['perm_ticket_update_own', 'ticket.update.own', 'Update own ticket'],
  ['perm_ticket_update_company', 'ticket.update.company', 'Update company ticket'],
  ['perm_ticket_assign', 'ticket.assign', 'Assign ticket'],
  ['perm_ticket_comment_internal', 'ticket.comment.internal', 'Write internal notes'],
  ['perm_user_manage_company', 'user.manage.company', 'Manage company users'],
  ['perm_role_manage_company', 'role.manage.company', 'Manage company roles'],
  ['perm_livechat_reply', 'livechat.reply', 'Reply to website live chat']
];

const rolePermissions = {
  client_admin: ['ticket.view.company', 'ticket.create', 'ticket.update.company', 'user.manage.company', 'role.manage.company'],
  client_user: ['ticket.create', 'ticket.update.own'],
  support_agent: ['ticket.view.company', 'ticket.update.company', 'ticket.assign', 'livechat.reply'],
  support_lead: ['ticket.view.company', 'ticket.update.company', 'ticket.assign', 'ticket.comment.internal', 'role.manage.company', 'livechat.reply'],
  platform_admin: ['ticket.view.company', 'ticket.create', 'ticket.update.company', 'ticket.assign', 'ticket.comment.internal', 'user.manage.company', 'role.manage.company', 'livechat.reply']
};

async function insertRole(role) {
  await execute(
    sql(
      `
        INSERT INTO roles (id, code, name, scope, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO NOTHING
      `,
      'INSERT OR IGNORE INTO roles (id, code, name, scope, created_at) VALUES (?, ?, ?, ?, ?)'
    ),
    [...role, now]
  );
}

async function insertPermission(permission) {
  await execute(
    sql(
      `
        INSERT INTO permissions (id, code, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO NOTHING
      `,
      'INSERT OR IGNORE INTO permissions (id, code, name) VALUES (?, ?, ?)'
    ),
    permission
  );
}

async function insertRolePermission(roleId, permissionId) {
  await execute(
    sql(
      `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
    ),
    [roleId, permissionId]
  );
}

async function seedBaseAccessModel() {
  for (const role of roles) await insertRole(role);
  for (const perm of permissions) await insertPermission(perm);

  for (const [roleCode, permCodes] of Object.entries(rolePermissions)) {
    const role = await queryOne(
      sql('SELECT id FROM roles WHERE code = $1', 'SELECT id FROM roles WHERE code = ?'),
      [roleCode]
    );
    for (const permCode of permCodes) {
      const perm = await queryOne(
        sql('SELECT id FROM permissions WHERE code = $1', 'SELECT id FROM permissions WHERE code = ?'),
        [permCode]
      );
      if (role && perm) await insertRolePermission(role.id, perm.id);
    }
  }
}

async function seedDemoData() {
  const companyId = createId('cmp');
  await execute(
    sql(
      `
        INSERT INTO companies (id, name, slug, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO NOTHING
      `,
      'INSERT OR IGNORE INTO companies (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    [companyId, 'Demo Company', 'demo-company', 'active', now, now]
  );

  const demoCompany = await queryOne(
    sql('SELECT id FROM companies WHERE slug = $1', 'SELECT id FROM companies WHERE slug = ?'),
    ['demo-company']
  );
  const effectiveCompanyId = demoCompany?.id || companyId;

  const adminId = createId('usr');
  const agentId = createId('usr');
  const platformAdminId = createId('usr');
  const platformAdminAltId = createId('usr');
  const superUserId = createId('usr');
  const passwordHash = bcrypt.hashSync('demo1234', 10);

  const users = [
    [adminId, 'demo@company.ru', passwordHash, 'Demo Client Admin', 'active', env.dbClient === 'postgres' ? false : 0, now, now],
    [agentId, 'agent@zonait.local', passwordHash, 'Support Agent', 'active', env.dbClient === 'postgres' ? false : 0, now, now],
    [platformAdminId, 'admin@zonait.local', passwordHash, 'Platform Admin', 'active', env.dbClient === 'postgres' ? true : 1, now, now],
    [platformAdminAltId, 'admin@i-zone.pro', passwordHash, 'Platform Admin I-Zone', 'active', env.dbClient === 'postgres' ? true : 1, now, now],
    [superUserId, 'superuser@i-zone.pro', passwordHash, 'I-Zone Superuser', 'active', env.dbClient === 'postgres' ? true : 1, now, now]
  ];

  for (const user of users) {
    await execute(
      sql(
        `
          INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (email) DO NOTHING
        `,
        'INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      user
    );
  }

  const clientAdminRole = await queryOne(
    sql('SELECT id FROM roles WHERE code = $1', 'SELECT id FROM roles WHERE code = ?'),
    ['client_admin']
  );
  const supportAgentRole = await queryOne(
    sql('SELECT id FROM roles WHERE code = $1', 'SELECT id FROM roles WHERE code = ?'),
    ['support_agent']
  );
  const platformAdminRole = await queryOne(
    sql('SELECT id FROM roles WHERE code = $1', 'SELECT id FROM roles WHERE code = ?'),
    ['platform_admin']
  );

  const demoAdmin = await queryOne(sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'), ['demo@company.ru']);
  const agent = await queryOne(sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'), ['agent@zonait.local']);
  const admin = await queryOne(sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'), ['admin@zonait.local']);
  const adminAlt = await queryOne(sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'), ['admin@i-zone.pro']);
  const superUser = await queryOne(sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'), ['superuser@i-zone.pro']);

  const memberships = [
    [createId('mbr'), demoAdmin.id, effectiveCompanyId, clientAdminRole.id, 'IT Manager', env.dbClient === 'postgres' ? true : 1, now],
    [createId('mbr'), agent.id, effectiveCompanyId, supportAgentRole.id, 'Support Engineer', env.dbClient === 'postgres' ? true : 1, now],
    [createId('mbr'), admin.id, effectiveCompanyId, platformAdminRole.id, 'Platform Administrator', env.dbClient === 'postgres' ? true : 1, now],
    [createId('mbr'), adminAlt.id, effectiveCompanyId, platformAdminRole.id, 'Platform Administrator', env.dbClient === 'postgres' ? true : 1, now],
    [createId('mbr'), superUser.id, effectiveCompanyId, platformAdminRole.id, 'Superuser', env.dbClient === 'postgres' ? true : 1, now]
  ];

  for (const membership of memberships) {
    await execute(
      sql(
        `
          INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (user_id, company_id) DO NOTHING
        `,
        'INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      membership
    );
  }
}

await withTransaction(async () => {
  await seedBaseAccessModel();
  await seedDemoData();
});

await closeDb();

console.log(`Database seeded for ${env.dbClient}`);

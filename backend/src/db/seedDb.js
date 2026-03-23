import bcrypt from 'bcryptjs';
import { db } from './client.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';

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

const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, code, name, scope, created_at) VALUES (?, ?, ?, ?, ?)');
const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (id, code, name) VALUES (?, ?, ?)');
const insertRolePermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

for (const role of roles) insertRole.run(...role, now);
for (const perm of permissions) insertPermission.run(...perm);

for (const [roleCode, permCodes] of Object.entries(rolePermissions)) {
  const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(roleCode);
  for (const permCode of permCodes) {
    const perm = db.prepare('SELECT id FROM permissions WHERE code = ?').get(permCode);
    if (role && perm) insertRolePermission.run(role.id, perm.id);
  }
}

const companyId = createId('cmp');
db.prepare('INSERT OR IGNORE INTO companies (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run(companyId, 'Demo Company', 'demo-company', 'active', now, now);

const adminId = createId('usr');
const agentId = createId('usr');
const platformAdminId = createId('usr');
const platformAdminAltId = createId('usr');
const superUserId = createId('usr');
const passwordHash = bcrypt.hashSync('demo1234', 10);

db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(adminId, 'demo@company.ru', passwordHash, 'Demo Client Admin', 'active', 0, now, now);
db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(agentId, 'agent@zonait.local', passwordHash, 'Support Agent', 'active', 0, now, now);
db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(platformAdminId, 'admin@zonait.local', passwordHash, 'Platform Admin', 'active', 1, now, now);
db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(platformAdminAltId, 'admin@i-zone.pro', passwordHash, 'Platform Admin I-Zone', 'active', 1, now, now);
db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .run(superUserId, 'superuser@i-zone.pro', passwordHash, 'I-Zone Superuser', 'active', 1, now, now);

const clientAdminRole = db.prepare('SELECT id FROM roles WHERE code = ?').get('client_admin');
const supportAgentRole = db.prepare('SELECT id FROM roles WHERE code = ?').get('support_agent');
const platformAdminRole = db.prepare('SELECT id FROM roles WHERE code = ?').get('platform_admin');

db.prepare('INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(createId('mbr'), adminId, companyId, clientAdminRole.id, 'IT Manager', 1, now);
db.prepare('INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(createId('mbr'), agentId, companyId, supportAgentRole.id, 'Support Engineer', 1, now);
db.prepare('INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(createId('mbr'), platformAdminId, companyId, platformAdminRole.id, 'Platform Administrator', 1, now);
db.prepare('INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(createId('mbr'), platformAdminAltId, companyId, platformAdminRole.id, 'Platform Administrator', 1, now);
db.prepare('INSERT OR IGNORE INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(createId('mbr'), superUserId, companyId, platformAdminRole.id, 'Superuser', 1, now);

console.log('Database seeded');

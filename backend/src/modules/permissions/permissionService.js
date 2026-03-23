import { env } from '../../config/env.js';
import { queryMany, queryOne } from '../../db/client.js';

export async function getUserContext(userId) {
  const user = await queryOne(
    env.dbClient === 'postgres'
      ? `
        SELECT u.id, u.email, u.full_name, u.is_global_admin,
               m.company_id, c.name AS company_name, r.code AS role_code, r.id AS role_id
        FROM users u
        LEFT JOIN user_company_memberships m ON m.user_id = u.id AND m.is_primary = TRUE
        LEFT JOIN companies c ON c.id = m.company_id
        LEFT JOIN roles r ON r.id = m.role_id
        WHERE u.id = $1
      `
      : `
        SELECT u.id, u.email, u.full_name, u.is_global_admin,
               m.company_id, c.name AS company_name, r.code AS role_code, r.id AS role_id
        FROM users u
        LEFT JOIN user_company_memberships m ON m.user_id = u.id AND m.is_primary = 1
        LEFT JOIN companies c ON c.id = m.company_id
        LEFT JOIN roles r ON r.id = m.role_id
        WHERE u.id = ?
      `,
    [userId]
  );

  if (!user) return null;

  const permissions = (await queryMany(
    env.dbClient === 'postgres'
      ? `
        SELECT p.code
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
      `
      : `
        SELECT p.code
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `,
    [user.role_id]
  )).map((row) => row.code);

  // Backward-compatible fallback so support roles can access live chat
  // even if the DB was seeded before the permission was introduced.
  if (
    ['support_agent', 'support_lead', 'platform_admin'].includes(user.role_code) &&
    !permissions.includes('ticket.view.all')
  ) {
    permissions.push('ticket.view.all');
  }
  if (
    ['support_agent', 'support_lead', 'platform_admin'].includes(user.role_code) &&
    !permissions.includes('livechat.reply')
  ) {
    permissions.push('livechat.reply');
  }
  if (
    ['support_agent', 'support_lead', 'platform_admin'].includes(user.role_code) &&
    !permissions.includes('ticket.create')
  ) {
    permissions.push('ticket.create');
  }
  if (
    ['support_agent', 'support_lead', 'platform_admin'].includes(user.role_code) &&
    !permissions.includes('ticket.assign')
  ) {
    permissions.push('ticket.assign');
  }

  return { ...user, permissions };
}

export function hasPermission(context, permissionCode) {
  return Boolean(context?.is_global_admin) || context?.permissions?.includes(permissionCode);
}

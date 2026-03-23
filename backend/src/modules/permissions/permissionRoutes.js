import { Router } from 'express';
import { env } from '../../config/env.js';
import { execute, queryMany, queryOne, withTransaction } from '../../db/client.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';

const router = Router();

router.get('/matrix', requireAuth, requirePermission('role.manage.company'), asyncHandler(async (req, res) => {
  const roles = await queryMany('SELECT id, code, name, scope FROM roles ORDER BY scope, code');
  const permissions = await queryMany('SELECT id, code, name, description FROM permissions ORDER BY code');
  const rolePermissions = await queryMany(`
    SELECT rp.role_id, p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
  `);

  res.json({ roles, permissions, rolePermissions });
}));

const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)).default([])
});

router.put('/roles/:roleId/permissions', requireAuth, requirePermission('role.manage.company'), asyncHandler(async (req, res) => {
  const parsed = updateRolePermissionsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const role = await queryOne(
    env.dbClient === 'postgres'
      ? 'SELECT id, code, scope, is_system FROM roles WHERE id = $1'
      : 'SELECT id, code, scope, is_system FROM roles WHERE id = ?',
    [req.params.roleId]
  );
  if (!role) throw notFound('Role not found');
  if (role.scope !== 'company') throw forbidden('Only company-scoped roles can be edited here');

  // Prevent editing the built-in roles unless global admin
  if (role.is_system && !req.auth.context.is_global_admin) {
    throw forbidden('System roles can only be edited by global admin');
  }

  const permissionCodes = Array.from(new Set(parsed.data.permissionCodes));
  const permissionRows = permissionCodes.length
    ? await queryMany(
        env.dbClient === 'postgres'
          ? `SELECT id, code FROM permissions WHERE code = ANY($1::text[])`
          : 'SELECT id, code FROM permissions WHERE code IN (' + permissionCodes.map(() => '?').join(',') + ')',
        env.dbClient === 'postgres' ? [permissionCodes] : permissionCodes
      )
    : [];
  const foundCodes = new Set(permissionRows.map(r => r.code));
  const missing = permissionCodes.filter(c => !foundCodes.has(c));
  if (missing.length) throw badRequest('Unknown permissions', { missing });

  await withTransaction(async (tx) => {
    await tx.execute(
      env.dbClient === 'postgres'
        ? 'DELETE FROM role_permissions WHERE role_id = $1'
        : 'DELETE FROM role_permissions WHERE role_id = ?',
      [role.id]
    );
    for (const p of permissionRows) {
      await tx.execute(
        env.dbClient === 'postgres'
          ? 'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)'
          : 'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [role.id, p.id]
      );
    }
  });

  res.json({ ok: true });
}));

export default router;

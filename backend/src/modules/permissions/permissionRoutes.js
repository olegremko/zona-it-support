import { Router } from 'express';
import { db } from '../../db/client.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';

const router = Router();

router.get('/matrix', requireAuth, requirePermission('role.manage.company'), asyncHandler(async (req, res) => {
  const roles = db.prepare('SELECT id, code, name, scope FROM roles ORDER BY scope, code').all();
  const permissions = db.prepare('SELECT id, code, name, description FROM permissions ORDER BY code').all();
  const rolePermissions = db.prepare(`
    SELECT rp.role_id, p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
  `).all();

  res.json({ roles, permissions, rolePermissions });
}));

const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)).default([])
});

router.put('/roles/:roleId/permissions', requireAuth, requirePermission('role.manage.company'), asyncHandler(async (req, res) => {
  const parsed = updateRolePermissionsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const role = db.prepare('SELECT id, code, scope, is_system FROM roles WHERE id = ?').get(req.params.roleId);
  if (!role) throw notFound('Role not found');
  if (role.scope !== 'company') throw forbidden('Only company-scoped roles can be edited here');

  // Prevent editing the built-in roles unless global admin
  if (role.is_system && !req.auth.context.is_global_admin) {
    throw forbidden('System roles can only be edited by global admin');
  }

  const permissionCodes = Array.from(new Set(parsed.data.permissionCodes));
  const permissionRows = db.prepare('SELECT id, code FROM permissions WHERE code IN (' + permissionCodes.map(() => '?').join(',') + ')').all(...permissionCodes);
  const foundCodes = new Set(permissionRows.map(r => r.code));
  const missing = permissionCodes.filter(c => !foundCodes.has(c));
  if (missing.length) throw badRequest('Unknown permissions', { missing });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
    const insert = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const p of permissionRows) insert.run(role.id, p.id);
  });
  tx();

  res.json({ ok: true });
}));

export default router;

import { Router } from 'express';
import { db } from '../../db/client.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

const router = Router();

router.get('/roles', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const roles = db.prepare(`
    SELECT id, code, name, scope, is_system
    FROM roles
    WHERE code IN ('client_admin', 'client_user')
    ORDER BY CASE code WHEN 'client_admin' THEN 0 ELSE 1 END
  `).all();

  res.json({ roles });
}));

router.get('/', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.email, u.full_name, u.status, r.code AS role_code, r.name AS role_name, m.title
    FROM users u
    JOIN user_company_memberships m ON m.user_id = u.id
    JOIN roles r ON r.id = m.role_id
    WHERE m.company_id = ?
    ORDER BY u.full_name
  `).all(req.auth.context.company_id);

  res.json({ users: rows });
}));

const createUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  roleCode: z.string().min(1),
  title: z.string().trim().max(120).optional().default('')
});

router.post('/', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const fullName = parsed.data.fullName.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const title = (parsed.data.title || '').trim();

  const role = db.prepare('SELECT id, code, scope FROM roles WHERE code = ?').get(parsed.data.roleCode);
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw badRequest('Email already registered');

  const userId = createId('usr');
  const membershipId = createId('mbr');
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
    `).run(userId, email, passwordHash, fullName, now, now);

    db.prepare(`
      INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(membershipId, userId, req.auth.context.company_id, role.id, title || null, now);
  });
  tx();

  res.status(201).json({
    ok: true,
    user: {
      id: userId,
      email,
      fullName,
      roleCode: role.code,
      title
    }
  });
}));

const updateUserRoleSchema = z.object({
  roleCode: z.string().min(1)
});

router.patch('/:userId/role', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const parsed = updateUserRoleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const membership = db.prepare(`
    SELECT m.id, m.user_id, m.company_id, m.role_id
    FROM user_company_memberships m
    WHERE m.user_id = ? AND m.company_id = ?
  `).get(req.params.userId, req.auth.context.company_id);
  if (!membership) throw notFound('User membership not found');

  // basic safety: don't allow users to remove their own ability to manage users unless global admin
  if (membership.user_id === req.auth.context.id && !req.auth.context.is_global_admin) {
    throw forbidden('You cannot change your own role');
  }

  const role = db.prepare('SELECT id, code, scope FROM roles WHERE code = ?').get(parsed.data.roleCode);
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');

  db.prepare('UPDATE user_company_memberships SET role_id = ? WHERE id = ?').run(role.id, membership.id);
  res.json({ ok: true });
}));

export default router;

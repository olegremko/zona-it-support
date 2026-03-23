import { Router } from 'express';
import { env } from '../../config/env.js';
import { execute, queryMany, queryOne, withTransaction } from '../../db/client.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

const router = Router();

function sql(pgSql, sqliteSql = pgSql) {
  return env.dbClient === 'postgres' ? pgSql : sqliteSql;
}

router.get('/roles', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const roles = await queryMany(`
    SELECT id, code, name, scope, is_system
    FROM roles
    WHERE code IN ('client_admin', 'client_user')
    ORDER BY CASE code WHEN 'client_admin' THEN 0 ELSE 1 END
  `);

  res.json({ roles });
}));

router.get('/', requireAuth, requirePermission('user.manage.company'), asyncHandler(async (req, res) => {
  const rows = await queryMany(
    sql(
      `
        SELECT u.id, u.email, u.full_name, u.status, r.code AS role_code, r.name AS role_name, m.title
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id
        JOIN roles r ON r.id = m.role_id
        WHERE m.company_id = $1
        ORDER BY u.full_name
      `,
      `
        SELECT u.id, u.email, u.full_name, u.status, r.code AS role_code, r.name AS role_name, m.title
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id
        JOIN roles r ON r.id = m.role_id
        WHERE m.company_id = ?
        ORDER BY u.full_name
      `
    ),
    [req.auth.context.company_id]
  );

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

  const role = await queryOne(
    sql('SELECT id, code, scope FROM roles WHERE code = $1', 'SELECT id, code, scope FROM roles WHERE code = ?'),
    [parsed.data.roleCode]
  );
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');

  const existing = await queryOne(
    sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'),
    [email]
  );
  if (existing) throw badRequest('Email already registered');

  const userId = createId('usr');
  const membershipId = createId('mbr');
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(password, 10);

  await withTransaction(async (tx) => {
    await tx.execute(
      sql(
        `
          INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'active', FALSE, $5, $6)
        `,
        `
          INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
        `
      ),
      [userId, email, passwordHash, fullName, now, now]
    );

    await tx.execute(
      sql(
        `
          INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
          VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        `,
        `
          INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `
      ),
      [membershipId, userId, req.auth.context.company_id, role.id, title || null, now]
    );
  });

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

  const membership = await queryOne(
    sql(
      `
        SELECT m.id, m.user_id, m.company_id, m.role_id
        FROM user_company_memberships m
        WHERE m.user_id = $1 AND m.company_id = $2
      `,
      `
        SELECT m.id, m.user_id, m.company_id, m.role_id
        FROM user_company_memberships m
        WHERE m.user_id = ? AND m.company_id = ?
      `
    ),
    [req.params.userId, req.auth.context.company_id]
  );
  if (!membership) throw notFound('User membership not found');

  if (membership.user_id === req.auth.context.id && !req.auth.context.is_global_admin) {
    throw forbidden('You cannot change your own role');
  }

  const role = await queryOne(
    sql('SELECT id, code, scope FROM roles WHERE code = $1', 'SELECT id, code, scope FROM roles WHERE code = ?'),
    [parsed.data.roleCode]
  );
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');

  await execute(
    sql('UPDATE user_company_memberships SET role_id = $1 WHERE id = $2', 'UPDATE user_company_memberships SET role_id = ? WHERE id = ?'),
    [role.id, membership.id]
  );
  res.json({ ok: true });
}));

export default router;

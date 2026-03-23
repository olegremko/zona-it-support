import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { queryMany, queryOne, execute, withTransaction } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { hasPermission } from '../permissions/permissionService.js';

const router = Router();

function sql(pgSql, sqliteSql = pgSql) {
  return env.dbClient === 'postgres' ? pgSql : sqliteSql;
}

const createCompanySchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().trim().min(2).max(80).optional().default('')
});
const updateCompanySchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().trim().min(2).max(80),
  status: z.enum(['active', 'inactive']).default('active'),
  description: z.string().trim().max(2000).optional().default(''),
  contactEmail: z.string().email().optional().or(z.literal('')).default(''),
  contactPhone: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(255).optional().default('')
});

const createCompanyUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  roleCode: z.enum(['client_user', 'client_admin']),
  title: z.string().trim().max(120).optional().default('')
});

const updateCompanyUserRoleSchema = z.object({
  roleCode: z.enum(['client_user', 'client_admin'])
});
const updateCompanyUserSchema = z.object({
  fullName: z.string().min(2).max(160),
  title: z.string().trim().max(120).optional().default(''),
  status: z.enum(['active', 'dismissed'])
});

function isPlatformAdmin(context) {
  return Boolean(context?.is_global_admin) || context?.role_code === 'platform_admin';
}

function normalizeCompany(company) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    description: company.description || '',
    contactEmail: company.contact_email || '',
    contactPhone: company.contact_phone || '',
    address: company.address || '',
    createdAt: company.created_at,
    updatedAt: company.updated_at
  };
}

function normalizeUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    title: row.title || '',
    roleCode: row.role_code,
    roleName: row.role_name,
    companyId: row.company_id,
    companyName: row.company_name,
    totalTickets: Number(row.total_tickets || 0),
    activeTickets: Number(row.active_tickets || 0)
  };
}

function ensureCompanyAccess(context, companyId, { requireUserManagement = false } = {}) {
  if (isPlatformAdmin(context)) return;
  if (!context?.company_id || context.company_id !== companyId) {
    throw forbidden('Company access denied');
  }
  if (requireUserManagement && !hasPermission(context, 'user.manage.company')) {
    throw forbidden('Missing permission: user.manage.company');
  }
}

function buildSlug(rawName, fallbackSuffix = '') {
  const base = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return (base || `company-${fallbackSuffix || Date.now()}`).toLowerCase();
}

async function getClientRole(roleCode) {
  const role = await queryOne(
    sql(
      `
        SELECT id, code, name, scope
        FROM roles
        WHERE code = $1
      `,
      `
        SELECT id, code, name, scope
        FROM roles
        WHERE code = ?
      `
    ),
    [roleCode]
  );
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');
  if (!['client_user', 'client_admin'].includes(role.code)) throw badRequest('Only client roles can be assigned here');
  return role;
}

async function getCompanyOrThrow(companyId) {
  const company = await queryOne(
    sql(
      `
        SELECT id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
        FROM companies
        WHERE id = $1
      `,
      `
        SELECT id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
        FROM companies
        WHERE id = ?
      `
    ),
    [companyId]
  );
  if (!company) throw notFound('Company not found');
  return company;
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const context = req.auth.context;
  if (isPlatformAdmin(context)) {
    const companies = (await queryMany(`
      SELECT id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
      FROM companies
      ORDER BY name ASC
    `)).map(normalizeCompany);
    return res.json({ companies });
  }

  if (!context.company_id) return res.json({ companies: [] });
  const company = await getCompanyOrThrow(context.company_id);
  res.json({ companies: [normalizeCompany(company)] });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const context = req.auth.context;
  if (!isPlatformAdmin(context)) throw forbidden('Only platform admin can create companies');

  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const name = parsed.data.name.trim();
  let slug = parsed.data.slug.trim().toLowerCase() || buildSlug(name, createId('cmp').slice(-6));
  const now = nowIso();
  const companyId = createId('cmp');

  const existing = await queryOne(
    sql('SELECT id FROM companies WHERE slug = $1', 'SELECT id FROM companies WHERE slug = ?'),
    [slug]
  );
  if (existing) slug = `${slug}-${companyId.slice(-4).toLowerCase()}`;

  await execute(
    sql(
      `
        INSERT INTO companies (id, name, slug, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', $4, $5)
      `,
      `
        INSERT INTO companies (id, name, slug, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
      `
    ),
    [companyId, name, slug, now, now]
  );

  const company = await getCompanyOrThrow(companyId);
  res.status(201).json({ company: normalizeCompany(company) });
}));

router.get('/:companyId', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId);
  res.json({ company: normalizeCompany(await getCompanyOrThrow(req.params.companyId)) });
}));

router.patch('/:companyId', requireAuth, asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.auth.context)) throw forbidden('Only platform admin can update company settings');
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const current = await getCompanyOrThrow(req.params.companyId);
  const name = parsed.data.name.trim();
  const slug = parsed.data.slug.trim().toLowerCase();
  const existing = await queryOne(
    sql(
      'SELECT id FROM companies WHERE slug = $1 AND id <> $2',
      'SELECT id FROM companies WHERE slug = ? AND id <> ?'
    ),
    [slug, current.id]
  );
  if (existing) throw badRequest('Slug already in use');

  await execute(
    sql(
      `
        UPDATE companies
        SET name = $1, slug = $2, status = $3, description = $4, contact_email = $5, contact_phone = $6, address = $7, updated_at = $8
        WHERE id = $9
      `,
      `
        UPDATE companies
        SET name = ?, slug = ?, status = ?, description = ?, contact_email = ?, contact_phone = ?, address = ?, updated_at = ?
        WHERE id = ?
      `
    ),
    [
      name,
      slug,
      parsed.data.status,
      parsed.data.description || null,
      parsed.data.contactEmail || null,
      parsed.data.contactPhone || null,
      parsed.data.address || null,
      nowIso(),
      current.id
    ]
  );

  res.json({ company: normalizeCompany(await getCompanyOrThrow(current.id)) });
}));

router.get('/:companyId/roles', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const roles = await queryMany(`
    SELECT id, code, name, scope, is_system
    FROM roles
    WHERE code IN ('client_user', 'client_admin')
    ORDER BY CASE code WHEN 'client_admin' THEN 0 ELSE 1 END
  `);
  res.json({ roles });
}));

router.get('/:companyId/users', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const rows = await queryMany(
    sql(
      `
        SELECT u.id, u.email, u.full_name, u.status,
               r.code AS role_code, r.name AS role_name,
               m.title, m.company_id, c.name AS company_name,
               (
                 SELECT COUNT(*)
                 FROM tickets t
                 WHERE t.company_id = m.company_id AND t.created_by_user_id = u.id
               ) AS total_tickets,
               (
                 SELECT COUNT(*)
                 FROM tickets t
                 WHERE t.company_id = m.company_id AND t.created_by_user_id = u.id AND t.status IN ('open','progress')
               ) AS active_tickets
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id
        JOIN roles r ON r.id = m.role_id
        JOIN companies c ON c.id = m.company_id
        WHERE m.company_id = $1
        ORDER BY u.full_name ASC, u.email ASC
      `,
      `
        SELECT u.id, u.email, u.full_name, u.status,
               r.code AS role_code, r.name AS role_name,
               m.title, m.company_id, c.name AS company_name,
               (
                 SELECT COUNT(*)
                 FROM tickets t
                 WHERE t.company_id = m.company_id AND t.created_by_user_id = u.id
               ) AS total_tickets,
               (
                 SELECT COUNT(*)
                 FROM tickets t
                 WHERE t.company_id = m.company_id AND t.created_by_user_id = u.id AND t.status IN ('open','progress')
               ) AS active_tickets
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id
        JOIN roles r ON r.id = m.role_id
        JOIN companies c ON c.id = m.company_id
        WHERE m.company_id = ?
        ORDER BY u.full_name ASC, u.email ASC
      `
    ),
    [req.params.companyId]
  );
  res.json({ users: rows.map(normalizeUser) });
}));

router.post('/:companyId/users', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const parsed = createCompanyUserSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const company = await getCompanyOrThrow(req.params.companyId);
  const role = await getClientRole(parsed.data.roleCode);
  const fullName = parsed.data.fullName.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const title = (parsed.data.title || '').trim();
  const existing = await queryOne(
    sql('SELECT id FROM users WHERE email = $1', 'SELECT id FROM users WHERE email = ?'),
    [email]
  );
  if (existing) throw badRequest('Email already registered');

  const userId = createId('usr');
  const membershipId = createId('mbr');
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);

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
      [membershipId, userId, company.id, role.id, title || null, now]
    );
  });

  res.status(201).json({
    ok: true,
    user: {
      id: userId,
      email,
      fullName,
      title,
      roleCode: role.code,
      companyId: company.id,
      companyName: company.name
    }
  });
}));

router.patch('/:companyId/users/:userId/role', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const parsed = updateCompanyUserRoleSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const membership = await queryOne(
    sql(
      `
        SELECT m.id, m.user_id, m.company_id
        FROM user_company_memberships m
        WHERE m.user_id = $1 AND m.company_id = $2
      `,
      `
        SELECT m.id, m.user_id, m.company_id
        FROM user_company_memberships m
        WHERE m.user_id = ? AND m.company_id = ?
      `
    ),
    [req.params.userId, req.params.companyId]
  );
  if (!membership) throw notFound('User membership not found');

  if (membership.user_id === req.auth.context.id && !isPlatformAdmin(req.auth.context)) {
    throw forbidden('You cannot change your own role');
  }

  const role = await getClientRole(parsed.data.roleCode);
  await execute(
    sql('UPDATE user_company_memberships SET role_id = $1 WHERE id = $2', 'UPDATE user_company_memberships SET role_id = ? WHERE id = ?'),
    [role.id, membership.id]
  );
  res.json({ ok: true });
}));

router.patch('/:companyId/users/:userId', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const parsed = updateCompanyUserSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const membership = await queryOne(
    sql(
      `
        SELECT m.id, m.user_id, m.company_id
        FROM user_company_memberships m
        WHERE m.user_id = $1 AND m.company_id = $2
      `,
      `
        SELECT m.id, m.user_id, m.company_id
        FROM user_company_memberships m
        WHERE m.user_id = ? AND m.company_id = ?
      `
    ),
    [req.params.userId, req.params.companyId]
  );
  if (!membership) throw notFound('User membership not found');

  if (membership.user_id === req.auth.context.id && !isPlatformAdmin(req.auth.context) && parsed.data.status !== 'active') {
    throw forbidden('You cannot dismiss your own account');
  }

  const now = nowIso();
  await execute(
    sql(
      `
        UPDATE users
        SET full_name = $1, status = $2, updated_at = $3
        WHERE id = $4
      `,
      `
        UPDATE users
        SET full_name = ?, status = ?, updated_at = ?
        WHERE id = ?
      `
    ),
    [parsed.data.fullName.trim(), parsed.data.status, now, membership.user_id]
  );

  await execute(
    sql(
      `
        UPDATE user_company_memberships
        SET title = $1
        WHERE id = $2
      `,
      `
        UPDATE user_company_memberships
        SET title = ?
        WHERE id = ?
      `
    ),
    [(parsed.data.title || '').trim() || null, membership.id]
  );

  res.json({ ok: true });
}));

router.get('/:companyId/report', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId);
  if (!hasPermission(req.auth.context, 'ticket.view.company') && !isPlatformAdmin(req.auth.context)) {
    throw forbidden('Missing permission: ticket.view.company');
  }

  const company = await getCompanyOrThrow(req.params.companyId);
  const totalRow = await queryOne(
    sql('SELECT COUNT(*)::int AS count FROM tickets WHERE company_id = $1', 'SELECT COUNT(*) AS count FROM tickets WHERE company_id = ?'),
    [company.id]
  );
  const total = Number(totalRow?.count || 0);
  const statusRows = await queryMany(
    sql(
      `
        SELECT status, COUNT(*)::int AS count
        FROM tickets
        WHERE company_id = $1
        GROUP BY status
      `,
      `
        SELECT status, COUNT(*) AS count
        FROM tickets
        WHERE company_id = ?
        GROUP BY status
      `
    ),
    [company.id]
  );
  const priorityRows = await queryMany(
    sql(
      `
        SELECT priority, COUNT(*)::int AS count
        FROM tickets
        WHERE company_id = $1
        GROUP BY priority
      `,
      `
        SELECT priority, COUNT(*) AS count
        FROM tickets
        WHERE company_id = ?
        GROUP BY priority
      `
    ),
    [company.id]
  );
  const creatorRows = await queryMany(
    sql(
      `
        SELECT u.full_name AS full_name, u.email AS email, COUNT(*)::int AS count
        FROM tickets t
        JOIN users u ON u.id = t.created_by_user_id
        WHERE t.company_id = $1
        GROUP BY u.id, u.full_name, u.email
        ORDER BY count DESC, u.full_name ASC
      `,
      `
        SELECT u.full_name AS full_name, u.email AS email, COUNT(*) AS count
        FROM tickets t
        JOIN users u ON u.id = t.created_by_user_id
        WHERE t.company_id = ?
        GROUP BY u.id, u.full_name, u.email
        ORDER BY count DESC, u.full_name ASC
      `
    ),
    [company.id]
  );
  const assigneeRows = await queryMany(
    sql(
      `
        SELECT COALESCE(u.full_name, 'Не назначен') AS full_name,
               COUNT(DISTINCT t.id)::int AS count,
               ROUND(AVG(
                 CASE
                   WHEN t.closed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600
                   ELSE NULL
                 END
               )::numeric, 1) AS avg_resolution_hours
        FROM tickets t
        LEFT JOIN ticket_assignees ta ON ta.ticket_id = t.id AND ta.active = TRUE
        LEFT JOIN users u ON u.id = ta.user_id
        WHERE t.company_id = $1
        GROUP BY u.id, u.full_name
        ORDER BY count DESC, full_name ASC
      `,
      `
        SELECT COALESCE(u.full_name, 'Не назначен') AS full_name,
               COUNT(DISTINCT t.id) AS count,
               ROUND(AVG(CASE
                 WHEN t.closed_at IS NOT NULL THEN (julianday(t.closed_at) - julianday(t.created_at)) * 24
                 ELSE NULL
               END), 1) AS avg_resolution_hours
        FROM tickets t
        LEFT JOIN ticket_assignees ta ON ta.ticket_id = t.id AND ta.active = 1
        LEFT JOIN users u ON u.id = ta.user_id
        WHERE t.company_id = ?
        GROUP BY u.id, u.full_name
        ORDER BY count DESC, full_name ASC
      `
    ),
    [company.id]
  );
  const resolutionRow = await queryOne(
    sql(
      `
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600)::numeric, 1) AS avg_resolution_hours
        FROM tickets
        WHERE company_id = $1 AND closed_at IS NOT NULL
      `,
      `
        SELECT ROUND(AVG((julianday(closed_at) - julianday(created_at)) * 24), 1) AS avg_resolution_hours
        FROM tickets
        WHERE company_id = ? AND closed_at IS NOT NULL
      `
    ),
    [company.id]
  );

  res.json({
    company: normalizeCompany(company),
    summary: {
      totalTickets: total,
      openTickets: Number((statusRows.find((row) => row.status === 'open') || {}).count || 0),
      inProgressTickets: Number((statusRows.find((row) => row.status === 'progress') || {}).count || 0),
      resolvedTickets:
        Number((statusRows.find((row) => row.status === 'done') || {}).count || 0) +
        Number((statusRows.find((row) => row.status === 'closed') || {}).count || 0),
      avgResolutionHours: Number(resolutionRow?.avg_resolution_hours || 0)
    },
    byStatus: statusRows,
    byPriority: priorityRows,
    byCreator: creatorRows.map((row) => ({
      fullName: row.full_name,
      email: row.email,
      count: Number(row.count)
    })),
    byAssignee: assigneeRows.map((row) => ({
      fullName: row.full_name,
      count: Number(row.count),
      avgResolutionHours: Number(row.avg_resolution_hours || 0)
    }))
  });
}));

export default router;

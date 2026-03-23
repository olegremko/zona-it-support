import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { hasPermission } from '../permissions/permissionService.js';

const router = Router();

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
    totalTickets: row.total_tickets || 0,
    activeTickets: row.active_tickets || 0
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

function getClientRole(roleCode) {
  const role = db.prepare(`
    SELECT id, code, name, scope
    FROM roles
    WHERE code = ?
  `).get(roleCode);
  if (!role) throw badRequest('Unknown role');
  if (role.scope !== 'company') throw badRequest('Role must have company scope');
  if (!['client_user', 'client_admin'].includes(role.code)) throw badRequest('Only client roles can be assigned here');
  return role;
}

function getCompanyOrThrow(companyId) {
  const company = db.prepare(`
    SELECT id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
    FROM companies
    WHERE id = ?
  `).get(companyId);
  if (!company) throw notFound('Company not found');
  return company;
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const context = req.auth.context;
  if (isPlatformAdmin(context)) {
    const companies = db.prepare(`
      SELECT id, name, slug, status, description, contact_email, contact_phone, address, created_at, updated_at
      FROM companies
      ORDER BY name ASC
    `).all().map(normalizeCompany);
    return res.json({ companies });
  }

  if (!context.company_id) return res.json({ companies: [] });
  const company = getCompanyOrThrow(context.company_id);
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

  const existing = db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug);
  if (existing) slug = `${slug}-${companyId.slice(-4).toLowerCase()}`;

  db.prepare(`
    INSERT INTO companies (id, name, slug, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(companyId, name, slug, now, now);

  const company = getCompanyOrThrow(companyId);
  res.status(201).json({ company: normalizeCompany(company) });
}));

router.get('/:companyId', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId);
  res.json({ company: normalizeCompany(getCompanyOrThrow(req.params.companyId)) });
}));

router.patch('/:companyId', requireAuth, asyncHandler(async (req, res) => {
  if (!isPlatformAdmin(req.auth.context)) throw forbidden('Only platform admin can update company settings');
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const current = getCompanyOrThrow(req.params.companyId);
  const name = parsed.data.name.trim();
  const slug = parsed.data.slug.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM companies WHERE slug = ? AND id <> ?').get(slug, current.id);
  if (existing) throw badRequest('Slug already in use');

  db.prepare(`
    UPDATE companies
    SET name = ?, slug = ?, status = ?, description = ?, contact_email = ?, contact_phone = ?, address = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name,
    slug,
    parsed.data.status,
    parsed.data.description || null,
    parsed.data.contactEmail || null,
    parsed.data.contactPhone || null,
    parsed.data.address || null,
    nowIso(),
    current.id
  );

  res.json({ company: normalizeCompany(getCompanyOrThrow(current.id)) });
}));

router.get('/:companyId/roles', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const roles = db.prepare(`
    SELECT id, code, name, scope, is_system
    FROM roles
    WHERE code IN ('client_user', 'client_admin')
    ORDER BY CASE code WHEN 'client_admin' THEN 0 ELSE 1 END
  `).all();
  res.json({ roles });
}));

router.get('/:companyId/users', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const rows = db.prepare(`
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
  `).all(req.params.companyId);
  res.json({ users: rows.map(normalizeUser) });
}));

router.post('/:companyId/users', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const parsed = createCompanyUserSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const company = getCompanyOrThrow(req.params.companyId);
  const role = getClientRole(parsed.data.roleCode);
  const fullName = parsed.data.fullName.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const title = (parsed.data.title || '').trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw badRequest('Email already registered');

  const userId = createId('usr');
  const membershipId = createId('mbr');
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
    `).run(userId, email, passwordHash, fullName, now, now);

    db.prepare(`
      INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(membershipId, userId, company.id, role.id, title || null, now);
  });
  tx();

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

  const membership = db.prepare(`
    SELECT m.id, m.user_id, m.company_id
    FROM user_company_memberships m
    WHERE m.user_id = ? AND m.company_id = ?
  `).get(req.params.userId, req.params.companyId);
  if (!membership) throw notFound('User membership not found');

  if (membership.user_id === req.auth.context.id && !isPlatformAdmin(req.auth.context)) {
    throw forbidden('You cannot change your own role');
  }

  const role = getClientRole(parsed.data.roleCode);
  db.prepare('UPDATE user_company_memberships SET role_id = ? WHERE id = ?').run(role.id, membership.id);
  res.json({ ok: true });
}));

router.patch('/:companyId/users/:userId', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId, { requireUserManagement: true });
  const parsed = updateCompanyUserSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const membership = db.prepare(`
    SELECT m.id, m.user_id, m.company_id
    FROM user_company_memberships m
    WHERE m.user_id = ? AND m.company_id = ?
  `).get(req.params.userId, req.params.companyId);
  if (!membership) throw notFound('User membership not found');

  if (membership.user_id === req.auth.context.id && !isPlatformAdmin(req.auth.context) && parsed.data.status !== 'active') {
    throw forbidden('You cannot dismiss your own account');
  }

  const now = nowIso();
  db.prepare(`
    UPDATE users
    SET full_name = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(parsed.data.fullName.trim(), parsed.data.status, now, membership.user_id);

  db.prepare(`
    UPDATE user_company_memberships
    SET title = ?
    WHERE id = ?
  `).run((parsed.data.title || '').trim() || null, membership.id);

  res.json({ ok: true });
}));

router.get('/:companyId/report', requireAuth, asyncHandler(async (req, res) => {
  ensureCompanyAccess(req.auth.context, req.params.companyId);
  if (!hasPermission(req.auth.context, 'ticket.view.company') && !isPlatformAdmin(req.auth.context)) {
    throw forbidden('Missing permission: ticket.view.company');
  }

  const company = getCompanyOrThrow(req.params.companyId);
  const total = db.prepare('SELECT COUNT(*) AS count FROM tickets WHERE company_id = ?').get(company.id).count || 0;
  const statusRows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tickets
    WHERE company_id = ?
    GROUP BY status
  `).all(company.id);
  const priorityRows = db.prepare(`
    SELECT priority, COUNT(*) AS count
    FROM tickets
    WHERE company_id = ?
    GROUP BY priority
  `).all(company.id);
  const creatorRows = db.prepare(`
    SELECT u.full_name AS full_name, u.email AS email, COUNT(*) AS count
    FROM tickets t
    JOIN users u ON u.id = t.created_by_user_id
    WHERE t.company_id = ?
    GROUP BY u.id, u.full_name, u.email
    ORDER BY count DESC, u.full_name ASC
  `).all(company.id);
  const assigneeRows = db.prepare(`
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
  `).all(company.id);
  const resolutionRow = db.prepare(`
    SELECT ROUND(AVG((julianday(closed_at) - julianday(created_at)) * 24), 1) AS avg_resolution_hours
    FROM tickets
    WHERE company_id = ? AND closed_at IS NOT NULL
  `).get(company.id);

  res.json({
    company: normalizeCompany(company),
    summary: {
      totalTickets: total,
      openTickets: (statusRows.find((row) => row.status === 'open') || {}).count || 0,
      inProgressTickets: (statusRows.find((row) => row.status === 'progress') || {}).count || 0,
      resolvedTickets: ((statusRows.find((row) => row.status === 'done') || {}).count || 0) + ((statusRows.find((row) => row.status === 'closed') || {}).count || 0),
      avgResolutionHours: resolutionRow?.avg_resolution_hours || 0
    },
    byStatus: statusRows,
    byPriority: priorityRows,
    byCreator: creatorRows.map((row) => ({
      fullName: row.full_name,
      email: row.email,
      count: row.count
    })),
    byAssignee: assigneeRows.map((row) => ({
      fullName: row.full_name,
      count: row.count,
      avgResolutionHours: row.avg_resolution_hours || 0
    }))
  });
}));

export default router;

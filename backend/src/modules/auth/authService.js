import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../db/client.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import { getUserContext } from '../permissions/permissionService.js';
import { badRequest } from '../../lib/errors.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'active');
  if (!user) throw unauthorized('Invalid email or password');
  if (!bcrypt.compareSync(password, user.password_hash)) throw unauthorized('Invalid email or password');

  const context = getUserContext(user.id);
  const token = signToken({
    sub: user.id,
    companyId: context?.company_id || null,
    role: context?.role_code || null
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      companyId: context?.company_id || null,
      companyName: context?.company_name || null,
      role: context?.role_code || null,
      permissions: context?.permissions || []
    }
  };
}

export function register({ fullName, companyName, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw badRequest('Email is required');
  if (!String(password || '').trim() || String(password).length < 6) throw badRequest('Password must be at least 6 characters');
  if (!String(fullName || '').trim()) throw badRequest('Full name is required');

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) throw badRequest('Email already registered');

  const now = nowIso();
  const userId = createId('usr');
  const companyId = createId('cmp');
  const passwordHash = bcrypt.hashSync(password, 10);

  const companyDisplayName = String(companyName || '').trim() || normalizedEmail;
  const slugBase = companyDisplayName
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `company-${userId.slice(-6)}`;
  const slug = `${slugBase}-${userId.slice(-4)}`.toLowerCase();

  const clientAdminRole = db.prepare('SELECT id FROM roles WHERE code = ?').get('client_admin');
  if (!clientAdminRole) throw badRequest('Role client_admin not found (seed the DB)');

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO companies (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(companyId, companyDisplayName, slug, 'active', now, now);

    db.prepare('INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, normalizedEmail, passwordHash, String(fullName).trim(), 'active', 0, now, now);

    db.prepare('INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(createId('mbr'), userId, companyId, clientAdminRole.id, 'Owner', 1, now);
  });
  tx();

  return login(normalizedEmail, password);
}

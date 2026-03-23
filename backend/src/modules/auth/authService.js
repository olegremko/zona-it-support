import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, withTransaction } from '../../db/client.js';
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

export async function login(email, password) {
  const user = await queryOne(
    env.dbClient === 'postgres'
      ? 'SELECT * FROM users WHERE email = $1 AND status = $2'
      : 'SELECT * FROM users WHERE email = ? AND status = ?',
    [email, 'active']
  );
  if (!user) throw unauthorized('Invalid email or password');
  if (!bcrypt.compareSync(password, user.password_hash)) throw unauthorized('Invalid email or password');

  const context = await getUserContext(user.id);
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
      isGlobalAdmin: Boolean(user.is_global_admin),
      permissions: context?.permissions || []
    }
  };
}

export async function register({ fullName, companyName, email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) throw badRequest('Email is required');
  if (!String(password || '').trim() || String(password).length < 6) throw badRequest('Password must be at least 6 characters');
  if (!String(fullName || '').trim()) throw badRequest('Full name is required');

  const existing = await queryOne(
    env.dbClient === 'postgres'
      ? 'SELECT id FROM users WHERE email = $1'
      : 'SELECT id FROM users WHERE email = ?',
    [normalizedEmail]
  );
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

  const clientAdminRole = await queryOne(
    env.dbClient === 'postgres'
      ? 'SELECT id FROM roles WHERE code = $1'
      : 'SELECT id FROM roles WHERE code = ?',
    ['client_admin']
  );
  if (!clientAdminRole) throw badRequest('Role client_admin not found (seed the DB)');

  await withTransaction(async (tx) => {
    await tx.execute(
      env.dbClient === 'postgres'
        ? 'INSERT INTO companies (id, name, slug, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)'
        : 'INSERT INTO companies (id, name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [companyId, companyDisplayName, slug, 'active', now, now]
    );

    await tx.execute(
      env.dbClient === 'postgres'
        ? 'INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
        : 'INSERT INTO users (id, email, password_hash, full_name, status, is_global_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, normalizedEmail, passwordHash, String(fullName).trim(), 'active', env.dbClient === 'postgres' ? false : 0, now, now]
    );

    await tx.execute(
      env.dbClient === 'postgres'
        ? 'INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)'
        : 'INSERT INTO user_company_memberships (id, user_id, company_id, role_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [createId('mbr'), userId, companyId, clientAdminRole.id, 'Owner', env.dbClient === 'postgres' ? true : 1, now]
    );
  });

  return await login(normalizedEmail, password);
}

import { unauthorized, forbidden } from '../lib/errors.js';
import { verifyToken } from '../modules/auth/authService.js';
import { getUserContext, hasPermission } from '../modules/permissions/permissionService.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Missing bearer token'));

  try {
    const payload = verifyToken(token);
    const context = await getUserContext(payload.sub);
    if (!context) return next(unauthorized('User not found'));
    req.auth = { userId: payload.sub, context };
    next();
  } catch (error) {
    next(unauthorized('Invalid token'));
  }
}

export function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!hasPermission(req.auth?.context, permissionCode)) {
      return next(forbidden(`Missing permission: ${permissionCode}`));
    }
    next();
  };
}

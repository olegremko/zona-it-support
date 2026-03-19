import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { badRequest } from '../../lib/errors.js';
import { login, register } from './authService.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  fullName: z.string().min(2),
  companyName: z.string().optional().nullable(),
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.json(login(parsed.data.email, parsed.data.password));
}));

router.post('/register', asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(201).json(register(parsed.data));
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.auth.context });
}));

export default router;

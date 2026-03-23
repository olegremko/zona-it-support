import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { badRequest } from '../../lib/errors.js';
import { addTicketMessage, createTicket, createTicketFromLiveChat, getTicketById, listVisibleTickets, updateTicket } from './ticketService.js';

const router = Router();

const createFromLiveChatSchema = z.object({
  conversationId: z.string().min(1)
});

const createSchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(3),
  category: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal')
});

const messageSchema = z.object({
  body: z.string().min(1)
});

const updateSchema = z.object({
  subject: z.string().min(3).optional(),
  description: z.string().min(3).optional(),
  category: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  status: z.enum(['open', 'progress', 'done', 'closed']).optional(),
  assigneeUserId: z.string().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.json({ tickets: await listVisibleTickets(req.auth.context) });
}));

router.get('/:ticketId', requireAuth, asyncHandler(async (req, res) => {
  res.json({ ticket: await getTicketById(req.params.ticketId, req.auth.context) });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(201).json({ ticket: await createTicket(req.auth.context, parsed.data) });
}));

router.post('/from-live-chat', requireAuth, asyncHandler(async (req, res) => {
  const parsed = createFromLiveChatSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(201).json({ ticket: await createTicketFromLiveChat(req.auth.context, parsed.data.conversationId) });
}));

router.post('/:ticketId/messages', requireAuth, asyncHandler(async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(201).json({ ticket: await addTicketMessage(req.params.ticketId, req.auth.context, parsed.data.body) });
}));

router.patch('/:ticketId', requireAuth, asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.json({ ticket: await updateTicket(req.params.ticketId, req.auth.context, parsed.data) });
}));

export default router;

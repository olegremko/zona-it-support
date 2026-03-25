import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { badRequest } from '../../lib/errors.js';
import {
  addTicketMessage,
  createRemoteSession,
  createTicket,
  createTicketFromLiveChat,
  getTicketById,
  listVisibleTickets,
  syncTicketMessageToLiveChat,
  updateRemoteSession,
  updateTicket
} from './ticketService.js';

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

const remoteSessionCreateSchema = z.object({
  accessMode: z.enum(['interactive', 'unattended']).default('interactive'),
  deviceLabel: z.string().min(1).max(120).optional(),
  remoteClientId: z.string().min(1).max(120).optional(),
  deviceName: z.string().min(1).max(255).optional(),
  localIp: z.string().min(1).max(120).optional(),
  publicIp: z.string().min(1).max(120).optional(),
  gatewayIp: z.string().min(1).max(120).optional(),
  joinCode: z.string().min(3).max(64).optional()
});

const remoteSessionUpdateSchema = z.object({
  status: z.enum(['requested', 'ready', 'active', 'ended', 'cancelled']).optional(),
  engineerUserId: z.string().nullable().optional(),
  remoteClientId: z.string().nullable().optional(),
  joinCode: z.string().nullable().optional(),
  endedReason: z.string().nullable().optional(),
  unattendedEnabled: z.boolean().optional()
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
  const ticket = await addTicketMessage(req.params.ticketId, req.auth.context, parsed.data.body);
  await syncTicketMessageToLiveChat(req.params.ticketId, req.auth.context, parsed.data.body);
  res.status(201).json({ ticket });
}));

router.patch('/:ticketId', requireAuth, asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.json({ ticket: await updateTicket(req.params.ticketId, req.auth.context, parsed.data) });
}));

router.post('/:ticketId/remote-sessions', requireAuth, asyncHandler(async (req, res) => {
  const parsed = remoteSessionCreateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(201).json({ ticket: await createRemoteSession(req.params.ticketId, req.auth.context, parsed.data) });
}));

router.patch('/:ticketId/remote-sessions/:sessionId', requireAuth, asyncHandler(async (req, res) => {
  const parsed = remoteSessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.json({ ticket: await updateRemoteSession(req.params.ticketId, req.params.sessionId, req.auth.context, parsed.data) });
}));

export default router;

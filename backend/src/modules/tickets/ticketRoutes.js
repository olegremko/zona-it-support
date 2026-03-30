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
  syncRemoteDevice,
  syncTicketMessageToLiveChat,
  updateRemoteSession,
  updateTicket
} from './ticketService.js';

const router = Router();

function optionalTrimmedString(max, min = 1) {
  return z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string().min(min).max(max).optional());
}

const createFromLiveChatSchema = z.object({
  conversationId: z.string().min(1)
});

const createSchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(3),
  category: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  remoteDevice: z.object({
    deviceLabel: optionalTrimmedString(120),
    remoteClientId: optionalTrimmedString(120),
    remotePassword: optionalTrimmedString(64, 4),
    deviceName: optionalTrimmedString(255),
    localIp: optionalTrimmedString(120),
    publicIp: optionalTrimmedString(120),
    gatewayIp: optionalTrimmedString(120)
  }).optional()
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
  deviceLabel: optionalTrimmedString(120),
  remoteClientId: optionalTrimmedString(120),
  remotePassword: optionalTrimmedString(64, 4),
  deviceName: optionalTrimmedString(255),
  localIp: optionalTrimmedString(120),
  publicIp: optionalTrimmedString(120),
  gatewayIp: optionalTrimmedString(120),
  joinCode: optionalTrimmedString(64, 3)
});

const remoteDeviceSyncSchema = z.object({
  deviceLabel: optionalTrimmedString(120),
  remoteClientId: optionalTrimmedString(120),
  remotePassword: optionalTrimmedString(64, 4),
  deviceName: optionalTrimmedString(255),
  localIp: optionalTrimmedString(120),
  publicIp: optionalTrimmedString(120),
  gatewayIp: optionalTrimmedString(120)
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required'
});

const remoteSessionUpdateSchema = z.object({
  status: z.enum(['requested', 'ready', 'active', 'ended', 'cancelled']).optional(),
  engineerUserId: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, z.string().nullable().optional()),
  remoteClientId: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, z.string().nullable().optional()),
  joinCode: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, z.string().nullable().optional()),
  endedReason: z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }, z.string().nullable().optional()),
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

router.post('/:ticketId/remote-device', requireAuth, asyncHandler(async (req, res) => {
  const parsed = remoteDeviceSyncSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.status(200).json({ ticket: await syncRemoteDevice(req.params.ticketId, req.auth.context, parsed.data) });
}));

router.patch('/:ticketId/remote-sessions/:sessionId', requireAuth, asyncHandler(async (req, res) => {
  const parsed = remoteSessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());
  res.json({ ticket: await updateRemoteSession(req.params.ticketId, req.params.sessionId, req.auth.context, parsed.data) });
}));

export default router;

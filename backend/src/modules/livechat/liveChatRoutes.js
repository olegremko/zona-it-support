import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { queryMany, queryOne, execute, withTransaction } from '../../db/client.js';
import { ensureLiveChatTicket, syncLiveChatMessageToTicket } from '../tickets/ticketService.js';

const router = Router();

function sql(pgSql, sqliteSql = pgSql) {
  return env.dbClient === 'postgres' ? pgSql : sqliteSql;
}

const startSchema = z.object({
  visitorName: z.string().min(2),
  message: z.string().min(1),
  sourcePage: z.string().max(500).optional().nullable()
});

const publicMessageSchema = z.object({
  token: z.string().min(6),
  message: z.string().min(1)
});

const operatorMessageSchema = z.object({
  body: z.string().min(1)
});

const updateConversationSchema = z.object({
  status: z.enum(['new', 'active', 'closed']).optional(),
  assignToMe: z.boolean().optional()
});

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicToken: row.public_token,
    visitorName: row.visitor_name,
    visitorContact: row.visitor_contact,
    sourcePage: row.source_page,
    ticketId: row.ticket_id || null,
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at
  };
}

async function listMessages(conversationId) {
  return (await queryMany(
    sql(
      `
        SELECT m.id, m.author_type, m.author_user_id, m.author_name, m.body, m.created_at
        FROM live_chat_messages m
        WHERE m.conversation_id = $1
        ORDER BY m.created_at ASC
      `,
      `
        SELECT m.id, m.author_type, m.author_user_id, m.author_name, m.body, m.created_at
        FROM live_chat_messages m
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC
      `
    ),
    [conversationId]
  )).map((row) => ({
    id: row.id,
    authorType: row.author_type,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at
  }));
}

async function getConversationById(conversationId) {
  const row = await queryOne(
    sql(
      `
        SELECT c.*, u.full_name AS assigned_user_name
        FROM live_chat_conversations c
        LEFT JOIN users u ON u.id = c.assigned_user_id
        WHERE c.id = $1
      `,
      `
        SELECT c.*, u.full_name AS assigned_user_name
        FROM live_chat_conversations c
        LEFT JOIN users u ON u.id = c.assigned_user_id
        WHERE c.id = ?
      `
    ),
    [conversationId]
  );
  return mapConversation(row);
}

async function assertPublicConversation(conversationId, token) {
  const row = await queryOne(
    sql(
      'SELECT * FROM live_chat_conversations WHERE id = $1 AND public_token = $2',
      'SELECT * FROM live_chat_conversations WHERE id = ? AND public_token = ?'
    ),
    [conversationId, token]
  );
  if (!row) throw notFound('Conversation not found');
  return row;
}

router.post('/start', asyncHandler(async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const now = nowIso();
  const conversationId = createId('lch');
  const messageId = createId('lcm');
  const token = crypto.randomBytes(18).toString('hex');

  await withTransaction(async (tx) => {
    await tx.execute(
      sql(
        `
          INSERT INTO live_chat_conversations (
            id, public_token, visitor_name, visitor_contact, source_page,
            status, assigned_user_id, created_at, updated_at, last_message_at
          ) VALUES ($1, $2, $3, $4, $5, 'new', NULL, $6, $7, $8)
        `,
        `
          INSERT INTO live_chat_conversations (
            id, public_token, visitor_name, visitor_contact, source_page,
            status, assigned_user_id, created_at, updated_at, last_message_at
          ) VALUES (?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?)
        `
      ),
      [
        conversationId,
        token,
        parsed.data.visitorName.trim(),
        null,
        parsed.data.sourcePage || null,
        now,
        now,
        now
      ]
    );

    await tx.execute(
      sql(
        `
          INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
          VALUES ($1, $2, 'visitor', NULL, $3, $4, $5)
        `,
        `
          INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
          VALUES (?, ?, 'visitor', NULL, ?, ?, ?)
        `
      ),
      [messageId, conversationId, parsed.data.visitorName.trim(), parsed.data.message.trim(), now]
    );
  });
  await ensureLiveChatTicket(conversationId);

  const conversation = await getConversationById(conversationId);
  res.status(201).json({ conversation, messages: await listMessages(conversationId), token });
}));

router.get('/conversations/:conversationId/public', asyncHandler(async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) throw badRequest('Token is required');
  const row = await assertPublicConversation(req.params.conversationId, token);
  res.json({ conversation: mapConversation(row), messages: await listMessages(row.id) });
}));

router.post('/conversations/:conversationId/public-messages', asyncHandler(async (req, res) => {
  const parsed = publicMessageSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const row = await assertPublicConversation(req.params.conversationId, parsed.data.token);
  if (row.status === 'closed') throw forbidden('Conversation is closed');

  const now = nowIso();
  await execute(
    sql(
      `
        INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
        VALUES ($1, $2, 'visitor', NULL, $3, $4, $5)
      `,
      `
        INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
        VALUES (?, ?, 'visitor', NULL, ?, ?, ?)
      `
    ),
    [createId('lcm'), row.id, row.visitor_name, parsed.data.message.trim(), now]
  );

  await execute(
    sql(
      `
        UPDATE live_chat_conversations
        SET status = CASE WHEN status = 'closed' THEN status ELSE 'active' END,
            updated_at = $1,
            last_message_at = $2
        WHERE id = $3
      `,
      `
        UPDATE live_chat_conversations
        SET status = CASE WHEN status = 'closed' THEN status ELSE 'active' END,
            updated_at = ?,
            last_message_at = ?
        WHERE id = ?
      `
    ),
    [now, now, row.id]
  );
  await ensureLiveChatTicket(row.id);
  await syncLiveChatMessageToTicket(row.id, parsed.data.message.trim(), null);

  res.json({ ok: true, conversation: await getConversationById(row.id), messages: await listMessages(row.id) });
}));

router.get('/conversations', requireAuth, requirePermission('livechat.reply'), asyncHandler(async (req, res) => {
  const rows = await queryMany(`
    SELECT c.*, u.full_name AS assigned_user_name,
           (
             SELECT body
             FROM live_chat_messages m
             WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC
             LIMIT 1
           ) AS last_message_preview
    FROM live_chat_conversations c
    LEFT JOIN users u ON u.id = c.assigned_user_id
    ORDER BY
      CASE c.status WHEN 'new' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
      c.last_message_at DESC
  `);

  res.json({
    conversations: rows.map((row) => ({
      ...mapConversation(row),
      lastMessagePreview: row.last_message_preview || ''
    }))
  });
}));

router.get('/conversations/:conversationId', requireAuth, requirePermission('livechat.reply'), asyncHandler(async (req, res) => {
  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) throw notFound('Conversation not found');
  res.json({ conversation, messages: await listMessages(conversation.id) });
}));

router.patch('/conversations/:conversationId', requireAuth, requirePermission('livechat.reply'), asyncHandler(async (req, res) => {
  const parsed = updateConversationSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) throw notFound('Conversation not found');

  const nextStatus = parsed.data.status || conversation.status;
  const nextAssignedUserId = parsed.data.assignToMe ? req.auth.userId : conversation.assignedUserId;
  const now = nowIso();

  await execute(
    sql(
      `
        UPDATE live_chat_conversations
        SET status = $1, assigned_user_id = $2, updated_at = $3
        WHERE id = $4
      `,
      `
        UPDATE live_chat_conversations
        SET status = ?, assigned_user_id = ?, updated_at = ?
        WHERE id = ?
      `
    ),
    [nextStatus, nextAssignedUserId || null, now, conversation.id]
  );

  res.json({ ok: true, conversation: await getConversationById(conversation.id), messages: await listMessages(conversation.id) });
}));

router.post('/conversations/:conversationId/messages', requireAuth, requirePermission('livechat.reply'), asyncHandler(async (req, res) => {
  const parsed = operatorMessageSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest('Validation failed', parsed.error.flatten());

  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) throw notFound('Conversation not found');

  const now = nowIso();
  await execute(
    sql(
      `
        INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
        VALUES ($1, $2, 'operator', $3, $4, $5, $6)
      `,
      `
        INSERT INTO live_chat_messages (id, conversation_id, author_type, author_user_id, author_name, body, created_at)
        VALUES (?, ?, 'operator', ?, ?, ?, ?)
      `
    ),
    [createId('lcm'), conversation.id, req.auth.userId, req.auth.context.full_name, parsed.data.body.trim(), now]
  );

  await execute(
    sql(
      `
        UPDATE live_chat_conversations
        SET status = CASE WHEN status = 'closed' THEN status ELSE 'active' END,
            assigned_user_id = COALESCE(assigned_user_id, $1),
            updated_at = $2,
            last_message_at = $3
        WHERE id = $4
      `,
      `
        UPDATE live_chat_conversations
        SET status = CASE WHEN status = 'closed' THEN status ELSE 'active' END,
            assigned_user_id = COALESCE(assigned_user_id, ?),
            updated_at = ?,
            last_message_at = ?
        WHERE id = ?
      `
    ),
    [req.auth.userId, now, now, conversation.id]
  );
  await ensureLiveChatTicket(conversation.id);
  await syncLiveChatMessageToTicket(conversation.id, parsed.data.body.trim(), req.auth.userId);

  res.json({ ok: true, conversation: await getConversationById(conversation.id), messages: await listMessages(conversation.id) });
}));

export default router;

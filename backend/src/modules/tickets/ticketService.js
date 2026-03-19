import { db } from '../../db/client.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { hasPermission } from '../permissions/permissionService.js';

function nextTicketNumber() {
  const row = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM tickets').get();
  return row.next_number;
}

export function listVisibleTickets(context) {
  if (hasPermission(context, 'ticket.view.company')) {
    return db.prepare(`
      SELECT t.*, u.full_name AS created_by_name
      FROM tickets t
      JOIN users u ON u.id = t.created_by_user_id
      WHERE t.company_id = ?
      ORDER BY t.updated_at DESC
    `).all(context.company_id);
  }

  return db.prepare(`
    SELECT t.*, u.full_name AS created_by_name
    FROM tickets t
    JOIN users u ON u.id = t.created_by_user_id
    WHERE t.company_id = ? AND t.created_by_user_id = ?
    ORDER BY t.updated_at DESC
  `).all(context.company_id, context.id);
}

export function getTicketById(ticketId, context) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw notFound('Ticket not found');
  if (ticket.company_id !== context.company_id && !context.is_global_admin) throw forbidden('Ticket belongs to another company');
  if (!hasPermission(context, 'ticket.view.company') && ticket.created_by_user_id !== context.id) {
    throw forbidden('You cannot view this ticket');
  }

  const messages = db.prepare(`
    SELECT tm.*, u.full_name AS author_name
    FROM ticket_messages tm
    LEFT JOIN users u ON u.id = tm.author_user_id
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
  `).all(ticketId);

  return { ...ticket, messages };
}

export function createTicket(context, input) {
  if (!hasPermission(context, 'ticket.create')) throw forbidden('You cannot create tickets');
  if (!input.subject?.trim() || !input.description?.trim()) throw badRequest('Subject and description are required');

  const now = nowIso();
  const ticketId = createId('tkt');
  const messageId = createId('msg');
  const ticketNumber = nextTicketNumber();

  db.prepare(`
    INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'company', ?, ?)
  `).run(ticketId, ticketNumber, context.company_id, context.id, input.subject.trim(), input.description.trim(), input.category || null, input.priority || 'normal', now, now);

  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
    VALUES (?, ?, ?, 'message', ?, 0, ?)
  `).run(messageId, ticketId, context.id, input.description.trim(), now);

  return getTicketById(ticketId, context);
}

export function addTicketMessage(ticketId, context, body) {
  const ticket = getTicketById(ticketId, context);
  if (!body?.trim()) throw badRequest('Message body is required');

  const now = nowIso();
  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
    VALUES (?, ?, ?, 'message', ?, 0, ?)
  `).run(createId('msg'), ticketId, context.id, body.trim(), now);

  db.prepare('UPDATE tickets SET updated_at = ?, status = CASE WHEN status = ? THEN ? ELSE status END WHERE id = ?')
    .run(now, 'open', 'progress', ticketId);

  return getTicketById(ticketId, context);
}

export function updateTicket(ticketId, context, input) {
  const ticket = getTicketById(ticketId, context);
  const canUpdateCompany = hasPermission(context, 'ticket.update.company');
  const canUpdateOwn = hasPermission(context, 'ticket.update.own') && ticket.created_by_user_id === context.id;

  if (!canUpdateCompany && !canUpdateOwn) {
    throw forbidden('You cannot edit this ticket');
  }

  const now = nowIso();
  const nextSubject = input.subject?.trim() || ticket.subject;
  const nextDescription = input.description?.trim() || ticket.description;
  const nextCategory = input.category === undefined ? ticket.category : input.category;
  const nextPriority = input.priority || ticket.priority;
  const nextStatus = canUpdateCompany && input.status ? input.status : ticket.status;

  db.prepare(`
    UPDATE tickets
    SET subject = ?, description = ?, category = ?, priority = ?, status = ?, updated_at = ?, closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, ?) ELSE NULL END
    WHERE id = ?
  `).run(nextSubject, nextDescription, nextCategory, nextPriority, nextStatus, now, nextStatus, now, ticketId);

  return getTicketById(ticketId, context);
}

export function createTicketFromLiveChat(context, conversationId) {
  const conversation = db.prepare(`
    SELECT *
    FROM live_chat_conversations
    WHERE id = ?
  `).get(conversationId);
  if (!conversation) throw notFound('Live chat conversation not found');
  if (conversation.ticket_id) return getTicketById(conversation.ticket_id, context);
  if (!hasPermission(context, 'ticket.create')) throw forbidden('You cannot create tickets');

  const messages = db.prepare(`
    SELECT author_type, author_name, body, created_at
    FROM live_chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);

  const transcript = messages.map((message) => {
    const author = message.author_name || (message.author_type === 'operator' ? 'Operator' : message.author_type === 'visitor' ? 'Visitor' : 'System');
    return `[${message.created_at}] ${author}: ${message.body}`;
  }).join('\n');

  const subject = `Сайт: ${conversation.visitor_name}`;
  const description = transcript || `Обращение с сайта от ${conversation.visitor_name}`;
  const ticket = createTicket(context, {
    subject,
    description,
    category: 'Live Chat',
    priority: 'normal'
  });

  const now = nowIso();
  db.prepare(`
    UPDATE live_chat_conversations
    SET status = 'closed',
        updated_at = ?,
        last_message_at = ?
    WHERE id = ?
  `).run(now, now, conversationId);

  return ticket;
}

function getDefaultSupportOwner() {
  return db.prepare(`
    SELECT u.id AS user_id, m.company_id
    FROM users u
    JOIN user_company_memberships m ON m.user_id = u.id AND m.is_primary = 1
    JOIN roles r ON r.id = m.role_id
    WHERE u.status = 'active' AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
    ORDER BY CASE r.code WHEN 'support_lead' THEN 0 WHEN 'support_agent' THEN 1 ELSE 2 END, u.created_at ASC
    LIMIT 1
  `).get();
}

export function ensureLiveChatTicket(conversationId) {
  const conversation = db.prepare(`
    SELECT *
    FROM live_chat_conversations
    WHERE id = ?
  `).get(conversationId);
  if (!conversation) throw notFound('Live chat conversation not found');
  if (conversation.ticket_id) return db.prepare('SELECT * FROM tickets WHERE id = ?').get(conversation.ticket_id);

  const owner = getDefaultSupportOwner();
  if (!owner) throw badRequest('No support user available to own website chat tickets');

  const firstMessage = db.prepare(`
    SELECT body
    FROM live_chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(conversationId);

  const now = nowIso();
  const ticketId = createId('tkt');
  const ticketNumber = nextTicketNumber();
  const description = (firstMessage?.body || `Обращение с сайта от ${conversation.visitor_name}`).trim();

  db.prepare(`
    INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'company', ?, ?)
  `).run(
    ticketId,
    ticketNumber,
    owner.company_id,
    owner.user_id,
    `Сайт: ${conversation.visitor_name}`,
    description,
    'Live Chat',
    'normal',
    now,
    now
  );

  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
    VALUES (?, ?, NULL, 'message', ?, 0, ?)
  `).run(createId('msg'), ticketId, description, now);

  db.prepare(`
    UPDATE live_chat_conversations
    SET ticket_id = ?, updated_at = ?
    WHERE id = ?
  `).run(ticketId, now, conversationId);

  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
}

export function syncLiveChatMessageToTicket(conversationId, body, authorUserId = null) {
  const conversation = db.prepare('SELECT ticket_id FROM live_chat_conversations WHERE id = ?').get(conversationId);
  if (!conversation?.ticket_id || !body?.trim()) return;

  const now = nowIso();
  db.prepare(`
    INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
    VALUES (?, ?, ?, 'message', ?, 0, ?)
  `).run(createId('msg'), conversation.ticket_id, authorUserId, body.trim(), now);

  db.prepare(`
    UPDATE tickets
    SET updated_at = ?, status = CASE WHEN status = 'open' THEN 'progress' ELSE status END
    WHERE id = ?
  `).run(now, conversation.ticket_id);
}

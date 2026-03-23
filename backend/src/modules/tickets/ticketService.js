import { env } from '../../config/env.js';
import { queryMany, queryOne, execute, withTransaction } from '../../db/client.js';
import { createId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { hasPermission } from '../permissions/permissionService.js';

function sql(pgSql, sqliteSql = pgSql) {
  return env.dbClient === 'postgres' ? pgSql : sqliteSql;
}

async function nextTicketNumber() {
  const row = await queryOne('SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM tickets');
  return Number(row?.next_number || 1);
}

function currentAssigneeSelectSql(alias = 't') {
  return env.dbClient === 'postgres'
    ? `
      (
        SELECT ta.user_id
        FROM ticket_assignees ta
        WHERE ta.ticket_id = ${alias}.id AND ta.active = TRUE
        ORDER BY ta.created_at DESC
        LIMIT 1
      ) AS assignee_user_id,
      (
        SELECT u.full_name
        FROM ticket_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.ticket_id = ${alias}.id AND ta.active = TRUE
        ORDER BY ta.created_at DESC
        LIMIT 1
      ) AS assignee_name
    `
    : `
      (
        SELECT ta.user_id
        FROM ticket_assignees ta
        WHERE ta.ticket_id = ${alias}.id AND ta.active = 1
        ORDER BY ta.created_at DESC
        LIMIT 1
      ) AS assignee_user_id,
      (
        SELECT u.full_name
        FROM ticket_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.ticket_id = ${alias}.id AND ta.active = 1
        ORDER BY ta.created_at DESC
        LIMIT 1
      ) AS assignee_name
    `;
}

async function getAssignableSupportUsers() {
  return await queryMany(sql(
    `
      SELECT DISTINCT
        u.id,
        u.full_name,
        u.email,
        r.code AS role_code,
        COALESCE(m.title, r.name) AS title,
        CASE r.code WHEN 'platform_admin' THEN 0 WHEN 'support_lead' THEN 1 ELSE 2 END AS role_sort
      FROM users u
      JOIN user_company_memberships m ON m.user_id = u.id
      JOIN roles r ON r.id = m.role_id
      WHERE u.status = 'active'
        AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
      ORDER BY role_sort, u.full_name
    `
  ));
}

async function getTicketHistory(ticketId) {
  const rows = await queryMany(
    sql(
      `
        SELECT tm.id, tm.message_type, tm.body, tm.created_at, u.full_name AS author_name
        FROM ticket_messages tm
        LEFT JOIN users u ON u.id = tm.author_user_id
        WHERE tm.ticket_id = $1 AND tm.message_type IN ('system', 'internal_note')
        ORDER BY tm.created_at DESC
      `,
      `
        SELECT tm.id, tm.message_type, tm.body, tm.created_at, u.full_name AS author_name
        FROM ticket_messages tm
        LEFT JOIN users u ON u.id = tm.author_user_id
        WHERE tm.ticket_id = ? AND tm.message_type IN ('system', 'internal_note')
        ORDER BY tm.created_at DESC
      `
    ),
    [ticketId]
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.message_type,
    body: row.body,
    created_at: row.created_at,
    author_name: row.author_name || null
  }));
}

async function addSystemTicketEvent(ticketId, actorUserId, body, createdAt = nowIso()) {
  await execute(
    sql(
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES ($1, $2, $3, 'system', $4, FALSE, $5)
      `,
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES (?, ?, ?, 'system', ?, 0, ?)
      `
    ),
    [createId('msg'), ticketId, actorUserId || null, body, createdAt]
  );
}

export async function listVisibleTickets(context) {
  if (context.is_global_admin || hasPermission(context, 'ticket.view.all')) {
    return await queryMany(`
      SELECT t.*, u.full_name AS created_by_name, c.name AS company_name, ${currentAssigneeSelectSql('t')}
      FROM tickets t
      JOIN users u ON u.id = t.created_by_user_id
      LEFT JOIN companies c ON c.id = t.company_id
      ORDER BY t.updated_at DESC
    `);
  }

  if (hasPermission(context, 'ticket.view.company')) {
    return await queryMany(
      sql(
        `
          SELECT t.*, u.full_name AS created_by_name, c.name AS company_name, ${currentAssigneeSelectSql('t')}
          FROM tickets t
          JOIN users u ON u.id = t.created_by_user_id
          LEFT JOIN companies c ON c.id = t.company_id
          WHERE t.company_id = $1
          ORDER BY t.updated_at DESC
        `,
        `
          SELECT t.*, u.full_name AS created_by_name, c.name AS company_name, ${currentAssigneeSelectSql('t')}
          FROM tickets t
          JOIN users u ON u.id = t.created_by_user_id
          LEFT JOIN companies c ON c.id = t.company_id
          WHERE t.company_id = ?
          ORDER BY t.updated_at DESC
        `
      ),
      [context.company_id]
    );
  }

  return await queryMany(
    sql(
      `
        SELECT t.*, u.full_name AS created_by_name, c.name AS company_name, ${currentAssigneeSelectSql('t')}
        FROM tickets t
        JOIN users u ON u.id = t.created_by_user_id
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.company_id = $1 AND t.created_by_user_id = $2
        ORDER BY t.updated_at DESC
      `,
      `
        SELECT t.*, u.full_name AS created_by_name, c.name AS company_name, ${currentAssigneeSelectSql('t')}
        FROM tickets t
        JOIN users u ON u.id = t.created_by_user_id
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.company_id = ? AND t.created_by_user_id = ?
        ORDER BY t.updated_at DESC
      `
    ),
    [context.company_id, context.id]
  );
}

export async function getTicketById(ticketId, context) {
  const ticket = await queryOne(
    sql('SELECT * FROM tickets WHERE id = $1', 'SELECT * FROM tickets WHERE id = ?'),
    [ticketId]
  );
  if (!ticket) throw notFound('Ticket not found');
  if (ticket.company_id !== context.company_id && !context.is_global_admin && !hasPermission(context, 'ticket.view.all')) {
    throw forbidden('Ticket belongs to another company');
  }
  if (!hasPermission(context, 'ticket.view.company') && !hasPermission(context, 'ticket.view.all') && ticket.created_by_user_id !== context.id) {
    throw forbidden('You cannot view this ticket');
  }

  const messages = await queryMany(
    sql(
      `
        SELECT tm.*, u.full_name AS author_name
        FROM ticket_messages tm
        LEFT JOIN users u ON u.id = tm.author_user_id
        WHERE tm.ticket_id = $1
        ORDER BY tm.created_at ASC
      `,
      `
        SELECT tm.*, u.full_name AS author_name
        FROM ticket_messages tm
        LEFT JOIN users u ON u.id = tm.author_user_id
        WHERE tm.ticket_id = ?
        ORDER BY tm.created_at ASC
      `
    ),
    [ticketId]
  );

  const createdBy = await queryOne(
    sql('SELECT full_name FROM users WHERE id = $1', 'SELECT full_name FROM users WHERE id = ?'),
    [ticket.created_by_user_id]
  );
  const assignee = await queryOne(
    sql(
      `
        SELECT ta.user_id, u.full_name
        FROM ticket_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.ticket_id = $1 AND ta.active = TRUE
        ORDER BY ta.created_at DESC
        LIMIT 1
      `,
      `
        SELECT ta.user_id, u.full_name
        FROM ticket_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.ticket_id = ? AND ta.active = 1
        ORDER BY ta.created_at DESC
        LIMIT 1
      `
    ),
    [ticketId]
  );

  return {
    ...ticket,
    created_by_name: createdBy?.full_name || null,
    assignee_user_id: assignee?.user_id || null,
    assignee_name: assignee?.full_name || null,
    history: await getTicketHistory(ticketId),
    assignable_users: hasPermission(context, 'ticket.assign') || context.is_global_admin ? await getAssignableSupportUsers() : [],
    messages
  };
}

export async function createTicket(context, input) {
  if (!hasPermission(context, 'ticket.create')) throw forbidden('You cannot create tickets');
  if (!input.subject?.trim() || !input.description?.trim()) throw badRequest('Subject and description are required');

  const now = nowIso();
  const ticketId = createId('tkt');
  const messageId = createId('msg');
  const ticketNumber = await nextTicketNumber();

  await withTransaction(async (tx) => {
    await tx.execute(
      sql(
        `
          INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 'company', $9, $10)
        `,
        `
          INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'company', ?, ?)
        `
      ),
      [ticketId, ticketNumber, context.company_id, context.id, input.subject.trim(), input.description.trim(), input.category || null, input.priority || 'normal', now, now]
    );

    await tx.execute(
      sql(
        `
          INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
          VALUES ($1, $2, $3, 'message', $4, FALSE, $5)
        `,
        `
          INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
          VALUES (?, ?, ?, 'message', ?, 0, ?)
        `
      ),
      [messageId, ticketId, context.id, input.description.trim(), now]
    );
  });

  await addSystemTicketEvent(ticketId, context.id, 'Тикет создан', now);

  return await getTicketById(ticketId, context);
}

export async function addTicketMessage(ticketId, context, body) {
  const ticket = await getTicketById(ticketId, context);
  if (!body?.trim()) throw badRequest('Message body is required');

  const now = nowIso();
  await execute(
    sql(
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES ($1, $2, $3, 'message', $4, FALSE, $5)
      `,
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES (?, ?, ?, 'message', ?, 0, ?)
      `
    ),
    [createId('msg'), ticketId, context.id, body.trim(), now]
  );

  await execute(
    sql(
      `
        UPDATE tickets
        SET updated_at = $1, status = CASE WHEN status = $2 THEN $3 ELSE status END
        WHERE id = $4
      `,
      `
        UPDATE tickets
        SET updated_at = ?, status = CASE WHEN status = ? THEN ? ELSE status END
        WHERE id = ?
      `
    ),
    [now, 'open', 'progress', ticketId]
  );

  if (ticket.status === 'open') {
    await addSystemTicketEvent(ticketId, context.id, 'Статус изменен: Открыт -> В работе', now);
  }

  return await getTicketById(ticketId, context);
}

export async function updateTicket(ticketId, context, input) {
  const ticket = await getTicketById(ticketId, context);
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
  const canAssign = hasPermission(context, 'ticket.assign') || context.is_global_admin;
  const nextAssigneeUserId = input.assigneeUserId === undefined ? null : (input.assigneeUserId || null);

  await execute(
    sql(
      `
        UPDATE tickets
        SET subject = $1,
            description = $2,
            category = $3,
            priority = $4,
            status = $5,
            updated_at = $6,
            closed_at = CASE
              WHEN $7 = 'closed' THEN COALESCE(closed_at, $8::timestamptz)
              ELSE NULL
            END
        WHERE id = $9
      `,
      `
        UPDATE tickets
        SET subject = ?,
            description = ?,
            category = ?,
            priority = ?,
            status = ?,
            updated_at = ?,
            closed_at = CASE
              WHEN ? = 'closed' THEN COALESCE(closed_at, ?)
              ELSE NULL
            END
        WHERE id = ?
      `
    ),
    [nextSubject, nextDescription, nextCategory, nextPriority, nextStatus, now, nextStatus, now, ticketId]
  );

  if (input.priority && input.priority !== ticket.priority) {
    await addSystemTicketEvent(ticketId, context.id, `Приоритет изменен: ${ticket.priority} -> ${input.priority}`, now);
  }
  if (canUpdateCompany && input.status && input.status !== ticket.status) {
    await addSystemTicketEvent(ticketId, context.id, `Статус изменен: ${ticket.status} -> ${input.status}`, now);
  }
  if (canAssign && input.assigneeUserId !== undefined) {
    const currentAssignee = await queryOne(
      sql(
        `
          SELECT ta.user_id, u.full_name
          FROM ticket_assignees ta
          JOIN users u ON u.id = ta.user_id
          WHERE ta.ticket_id = $1 AND ta.active = TRUE
          ORDER BY ta.created_at DESC
          LIMIT 1
        `,
        `
          SELECT ta.user_id, u.full_name
          FROM ticket_assignees ta
          JOIN users u ON u.id = ta.user_id
          WHERE ta.ticket_id = ? AND ta.active = 1
          ORDER BY ta.created_at DESC
          LIMIT 1
        `
      ),
      [ticketId]
    );

    await execute(
      sql(
        'UPDATE ticket_assignees SET active = FALSE WHERE ticket_id = $1 AND active = TRUE',
        'UPDATE ticket_assignees SET active = 0 WHERE ticket_id = ? AND active = 1'
      ),
      [ticketId]
    );

    if (nextAssigneeUserId) {
      const assigneeUser = await queryOne(
        sql(
          `
            SELECT u.id, u.full_name
            FROM users u
            JOIN user_company_memberships m ON m.user_id = u.id
            JOIN roles r ON r.id = m.role_id
            WHERE u.id = $1 AND u.status = 'active' AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
            LIMIT 1
          `,
          `
            SELECT u.id, u.full_name
            FROM users u
            JOIN user_company_memberships m ON m.user_id = u.id
            JOIN roles r ON r.id = m.role_id
            WHERE u.id = ? AND u.status = 'active' AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
            LIMIT 1
          `
        ),
        [nextAssigneeUserId]
      );
      if (!assigneeUser) throw badRequest('Assignee not found');

      await execute(
        sql(
          `
            INSERT INTO ticket_assignees (id, ticket_id, user_id, assigned_by_user_id, created_at, active)
            VALUES ($1, $2, $3, $4, $5, TRUE)
          `,
          `
            INSERT INTO ticket_assignees (id, ticket_id, user_id, assigned_by_user_id, created_at, active)
            VALUES (?, ?, ?, ?, ?, 1)
          `
        ),
        [createId('tas'), ticketId, assigneeUser.id, context.id, now]
      );

      if (!currentAssignee || currentAssignee.user_id !== assigneeUser.id) {
        await addSystemTicketEvent(ticketId, context.id, `Назначен исполнитель: ${assigneeUser.full_name}`, now);
      }
    } else if (currentAssignee) {
      await addSystemTicketEvent(ticketId, context.id, `Исполнитель снят: ${currentAssignee.full_name}`, now);
    }
  }

  return await getTicketById(ticketId, context);
}

export async function createTicketFromLiveChat(context, conversationId) {
  const conversation = await queryOne(
    sql(
      `
        SELECT *
        FROM live_chat_conversations
        WHERE id = $1
      `,
      `
        SELECT *
        FROM live_chat_conversations
        WHERE id = ?
      `
    ),
    [conversationId]
  );
  if (!conversation) throw notFound('Live chat conversation not found');
  if (conversation.ticket_id) return await getTicketById(conversation.ticket_id, context);
  if (!hasPermission(context, 'ticket.create')) throw forbidden('You cannot create tickets');

  const messages = await queryMany(
    sql(
      `
        SELECT author_type, author_name, body, created_at
        FROM live_chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      `
        SELECT author_type, author_name, body, created_at
        FROM live_chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `
    ),
    [conversationId]
  );

  const transcript = messages.map((message) => {
    const author = message.author_name || (message.author_type === 'operator' ? 'Operator' : message.author_type === 'visitor' ? 'Visitor' : 'System');
    return `[${message.created_at}] ${author}: ${message.body}`;
  }).join('\n');

  const subject = `Сайт: ${conversation.visitor_name}`;
  const description = transcript || `Обращение с сайта от ${conversation.visitor_name}`;
  const ticket = await createTicket(context, {
    subject,
    description,
    category: 'Live Chat',
    priority: 'normal'
  });

  const now = nowIso();
  await execute(
    sql(
      `
        UPDATE live_chat_conversations
        SET status = 'closed',
            updated_at = $1,
            last_message_at = $2
        WHERE id = $3
      `,
      `
        UPDATE live_chat_conversations
        SET status = 'closed',
            updated_at = ?,
            last_message_at = ?
        WHERE id = ?
      `
    ),
    [now, now, conversationId]
  );

  return ticket;
}

async function getDefaultSupportOwner() {
  return await queryOne(
    sql(
      `
        SELECT u.id AS user_id, m.company_id
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id AND m.is_primary = TRUE
        JOIN roles r ON r.id = m.role_id
        WHERE u.status = 'active' AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
        ORDER BY CASE r.code WHEN 'support_lead' THEN 0 WHEN 'support_agent' THEN 1 ELSE 2 END, u.created_at ASC
        LIMIT 1
      `,
      `
        SELECT u.id AS user_id, m.company_id
        FROM users u
        JOIN user_company_memberships m ON m.user_id = u.id AND m.is_primary = 1
        JOIN roles r ON r.id = m.role_id
        WHERE u.status = 'active' AND r.code IN ('support_agent', 'support_lead', 'platform_admin')
        ORDER BY CASE r.code WHEN 'support_lead' THEN 0 WHEN 'support_agent' THEN 1 ELSE 2 END, u.created_at ASC
        LIMIT 1
      `
    )
  );
}

export async function ensureLiveChatTicket(conversationId) {
  const conversation = await queryOne(
    sql(
      `
        SELECT *
        FROM live_chat_conversations
        WHERE id = $1
      `,
      `
        SELECT *
        FROM live_chat_conversations
        WHERE id = ?
      `
    ),
    [conversationId]
  );
  if (!conversation) throw notFound('Live chat conversation not found');
  if (conversation.ticket_id) {
    return await queryOne(
      sql('SELECT * FROM tickets WHERE id = $1', 'SELECT * FROM tickets WHERE id = ?'),
      [conversation.ticket_id]
    );
  }

  const owner = await getDefaultSupportOwner();
  if (!owner) throw badRequest('No support user available to own website chat tickets');

  const firstMessage = await queryOne(
    sql(
      `
        SELECT body
        FROM live_chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      `,
      `
        SELECT body
        FROM live_chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT 1
      `
    ),
    [conversationId]
  );

  const now = nowIso();
  const ticketId = createId('tkt');
  const ticketNumber = await nextTicketNumber();
  const description = (firstMessage?.body || `Обращение с сайта от ${conversation.visitor_name}`).trim();

  await withTransaction(async (tx) => {
    await tx.execute(
      sql(
        `
          INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 'company', $9, $10)
        `,
        `
          INSERT INTO tickets (id, number, company_id, created_by_user_id, subject, description, category, priority, status, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'company', ?, ?)
        `
      ),
      [ticketId, ticketNumber, owner.company_id, owner.user_id, `Сайт: ${conversation.visitor_name}`, description, 'Live Chat', 'normal', now, now]
    );

    await tx.execute(
      sql(
        `
          INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
          VALUES ($1, $2, NULL, 'message', $3, FALSE, $4)
        `,
        `
          INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
          VALUES (?, ?, NULL, 'message', ?, 0, ?)
        `
      ),
      [createId('msg'), ticketId, description, now]
    );

    await tx.execute(
      sql(
        `
          UPDATE live_chat_conversations
          SET ticket_id = $1, updated_at = $2
          WHERE id = $3
        `,
        `
          UPDATE live_chat_conversations
          SET ticket_id = ?, updated_at = ?
          WHERE id = ?
        `
      ),
      [ticketId, now, conversationId]
    );
  });

  return await queryOne(
    sql('SELECT * FROM tickets WHERE id = $1', 'SELECT * FROM tickets WHERE id = ?'),
    [ticketId]
  );
}

export async function syncLiveChatMessageToTicket(conversationId, body, authorUserId = null) {
  const conversation = await queryOne(
    sql('SELECT ticket_id FROM live_chat_conversations WHERE id = $1', 'SELECT ticket_id FROM live_chat_conversations WHERE id = ?'),
    [conversationId]
  );
  if (!conversation?.ticket_id || !body?.trim()) return;

  const now = nowIso();
  await execute(
    sql(
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES ($1, $2, $3, 'message', $4, FALSE, $5)
      `,
      `
        INSERT INTO ticket_messages (id, ticket_id, author_user_id, message_type, body, is_internal, created_at)
        VALUES (?, ?, ?, 'message', ?, 0, ?)
      `
    ),
    [createId('msg'), conversation.ticket_id, authorUserId, body.trim(), now]
  );

  await execute(
    sql(
      `
        UPDATE tickets
        SET updated_at = $1, status = CASE WHEN status = 'open' THEN 'progress' ELSE status END
        WHERE id = $2
      `,
      `
        UPDATE tickets
        SET updated_at = ?, status = CASE WHEN status = 'open' THEN 'progress' ELSE status END
        WHERE id = ?
      `
    ),
    [now, conversation.ticket_id]
  );
}

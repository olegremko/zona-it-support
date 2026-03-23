(function () {
  var state = {
    token: '',
    user: null,
    mode: 'tickets',
    tickets: [],
    filteredTickets: [],
    selectedTicketId: null,
    selectedTicket: null,
    conversations: [],
    filteredConversations: [],
    selectedConversationId: null,
    selectedConversation: null,
    pollTimer: null
  };

  var TOKEN_KEY = 'zit_desk_token';
  var USER_KEY = 'zit_desk_user';
  var IS_DESKTOP_RUNTIME = !!(window.zonaDeskEnv && window.zonaDeskEnv.platform === 'windows-electron');

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function relativeDate(value) {
    if (!value) return '—';
    var now = Date.now();
    var then = new Date(value).getTime();
    var diffMinutes = Math.round((then - now) / 60000);
    var abs = Math.abs(diffMinutes);
    if (abs < 1) return 'только что';
    if (abs < 60) return diffMinutes < 0 ? abs + ' мин назад' : 'через ' + abs + ' мин';
    var diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return diffHours < 0 ? Math.abs(diffHours) + ' ч назад' : 'через ' + diffHours + ' ч';
    return formatDate(value);
  }

  function statusLabel(code) {
    return ({ open: 'Открыт', progress: 'В работе', done: 'Решен', closed: 'Закрыт' }[code] || code || '—');
  }

  function priorityLabel(code) {
    return ({ low: 'Низкий', normal: 'Средний', high: 'Высокий', critical: 'Критичный' }[code] || code || '—');
  }

  function conversationStatusLabel(code) {
    return ({ new: 'Новый', active: 'Активный', closed: 'Закрыт' }[code] || code || '—');
  }

  function hasPermission(code) {
    return !!(state.user && state.user.permissions && state.user.permissions.indexOf(code) >= 0);
  }

  function hasLiveChatAccess() {
    return !!(state.user && (state.user.isGlobalAdmin || hasPermission('livechat.reply')));
  }

  function showCompanyContext() {
    return !!(state.user && (state.user.isGlobalAdmin || hasPermission('ticket.view.all')));
  }

  function roleLabel() {
    if (!state.user) return 'client_user';
    return ({
      client_user: 'Клиент',
      client_admin: 'Руководитель компании',
      support_agent: 'Инженер поддержки',
      support_lead: 'Руководитель поддержки',
      platform_admin: 'Администратор платформы'
    }[state.user.role] || state.user.role || 'Клиент');
  }

  function authHeaders() {
    return state.token ? { Authorization: 'Bearer ' + state.token } : {};
  }

  async function api(path, options) {
    var request = Object.assign({
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders())
    }, options || {});
    var response = await fetch(path, request);
    var data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    if (!response.ok) throw new Error(data && data.error ? data.error : 'Ошибка запроса');
    return data;
  }

  function saveSession() {
    localStorage.setItem(TOKEN_KEY, state.token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(state.user || null));
  }

  function restoreSession() {
    state.token = localStorage.getItem(TOKEN_KEY) || '';
    try { state.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (error) { state.user = null; }
  }

  function clearSession() {
    state.token = '';
    state.user = null;
    state.mode = 'tickets';
    state.tickets = [];
    state.filteredTickets = [];
    state.selectedTicketId = null;
    state.selectedTicket = null;
    state.conversations = [];
    state.filteredConversations = [];
    state.selectedConversationId = null;
    state.selectedConversation = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function showError(id, message) {
    var box = $(id);
    box.textContent = message;
    box.classList.add('show');
  }

  function clearErrors() {
    $('deskAuthError').classList.remove('show');
    $('deskModalError').classList.remove('show');
  }

  function renderAuthState(isAuthed) {
    $('deskAuth').classList.toggle('hidden', isAuthed);
    $('deskApp').classList.toggle('hidden', !isAuthed);
  }

  function lockBrowserVersion() {
    $('deskBrowserNote').classList.remove('hidden');
    $('deskEmail').disabled = true;
    $('deskPassword').disabled = true;
    $('deskLoginBtn').disabled = true;
    $('deskLoginBtn').textContent = 'Доступно только в Windows';
  }

  function closeAllCustomSelects(exceptSelectId) {
    Array.prototype.forEach.call(document.querySelectorAll('.desk-select'), function (node) {
      if (exceptSelectId && node.getAttribute('data-select-id') === exceptSelectId) return;
      node.classList.remove('open');
    });
  }

  function buildCustomSelectOptions(select, menu, label) {
    var selectedValue = select.value;
    menu.innerHTML = '';
    Array.prototype.forEach.call(select.options, function (option) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'desk-select-option' + (option.value === selectedValue ? ' active' : '');
      btn.disabled = !!option.disabled;
      btn.innerHTML = '<span>' + escapeHtml(option.textContent || '') + '</span><span class="desk-select-check">✓</span>';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        if (option.disabled) return;
        select.value = option.value;
        label.textContent = option.textContent || '';
        buildCustomSelectOptions(select, menu, label);
        closeAllCustomSelects();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(btn);
    });
    label.textContent = select.options[select.selectedIndex] ? (select.options[select.selectedIndex].textContent || '') : '';
  }

  function ensureCustomSelect(select) {
    if (!select) return null;
    var existing = document.querySelector('.desk-select[data-select-id="' + select.id + '"]');
    if (existing) return existing;
    var wrapper = document.createElement('div');
    wrapper.className = 'desk-select' + (select.classList.contains('hidden') ? ' hidden' : '');
    wrapper.setAttribute('data-select-id', select.id);
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'desk-select-trigger';
    trigger.innerHTML = '<span class="desk-select-label"></span><span class="desk-select-caret">▾</span>';
    var menu = document.createElement('div');
    menu.className = 'desk-select-menu';
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    select.insertAdjacentElement('afterend', wrapper);
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      var isOpen = wrapper.classList.contains('open');
      closeAllCustomSelects();
      if (!isOpen) wrapper.classList.add('open');
    });
    return wrapper;
  }

  function refreshCustomSelect(selectOrId) {
    var select = typeof selectOrId === 'string' ? $(selectOrId) : selectOrId;
    if (!select) return;
    var wrapper = ensureCustomSelect(select);
    if (!wrapper) return;
    wrapper.classList.toggle('hidden', select.classList.contains('hidden'));
    buildCustomSelectOptions(select, wrapper.querySelector('.desk-select-menu'), wrapper.querySelector('.desk-select-label'));
  }

  function refreshAllCustomSelects() {
    Array.prototype.forEach.call(document.querySelectorAll('select.native-select'), function (select) {
      refreshCustomSelect(select);
    });
  }

  function ticketPreview(ticket) {
    var message = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1].body : ticket.description;
    return message || 'Без сообщений';
  }

  function conversationPreview(conversation) {
    return conversation.lastMessagePreview || 'Диалог еще не начат';
  }

  function renderModeControls() {
    var tabs = $('deskModeTabs');
    var isChatMode = state.mode === 'livechat';
    tabs.classList.toggle('hidden', !hasLiveChatAccess());
    $('deskModeTickets').classList.toggle('active', !isChatMode);
    $('deskModeChats').classList.toggle('active', isChatMode);
    $('deskStatusFilter').classList.toggle('hidden', isChatMode);
    $('deskCompanyFilter').classList.toggle('hidden', isChatMode || !showCompanyContext());
    $('deskNewTicketBtn').classList.toggle('hidden', isChatMode);
    refreshCustomSelect('deskStatusFilter');
    refreshCustomSelect('deskCompanyFilter');
    $('deskTicketSearch').placeholder = isChatMode ? 'Поиск по живым чатам...' : 'Поиск по тикетам...';
  }

  function renderSidebarHeader() {
    var title = document.querySelector('.sidebar-title h2');
    var sub = document.querySelector('.sidebar-sub');
    if (state.mode === 'livechat') {
      title.textContent = 'Живые чаты';
      sub.textContent = 'Очередь обращений с сайта для superuser и поддержки: новые диалоги, ответы и быстрый переход в задачу.';
    } else {
      title.textContent = hasPermission('ticket.view.all') || (state.user && state.user.isGlobalAdmin) ? 'Все тикеты' : 'Мои тикеты';
      sub.textContent = 'Легкий рабочий режим: список заявок, переписка по задаче и быстрые обновления без полного портала.';
    }
  }

  function renderTicketList() {
    var container = $('deskTicketList');
    if (!state.filteredTickets.length) {
      container.innerHTML = '<div class="empty">Пока нет тикетов. Создайте первую заявку и ведите диалог по задаче как в чате.</div>';
      return;
    }
    container.innerHTML = state.filteredTickets.map(function (ticket) {
      return '<div class="ticket-card' + (ticket.id === state.selectedTicketId ? ' active' : '') + '" data-ticket-id="' + escapeHtml(ticket.id) + '">' +
        '<div class="ticket-top"><div class="ticket-no">#' + escapeHtml(ticket.number) + '</div><div class="pill ' + escapeHtml(ticket.status) + '">' + escapeHtml(statusLabel(ticket.status)) + '</div></div>' +
        '<div class="ticket-subject">' + escapeHtml(ticket.subject) + '</div>' +
        (showCompanyContext() ? '<div class="ticket-no" style="margin-top:6px">' + escapeHtml(ticket.company_name || 'Без компании') + (ticket.created_by_name ? ' • ' + escapeHtml(ticket.created_by_name) : '') + '</div>' : '') +
        '<div class="ticket-preview">' + escapeHtml(ticketPreview(ticket)) + '</div>' +
        '<div class="ticket-meta"><div class="pill ' + escapeHtml(ticket.priority) + '">' + escapeHtml(priorityLabel(ticket.priority)) + '</div><div class="pill normal">' + escapeHtml(relativeDate(ticket.updated_at)) + '</div></div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(container.querySelectorAll('.ticket-card'), function (card) {
      card.addEventListener('click', function () { selectTicket(card.getAttribute('data-ticket-id')); });
    });
  }

  function renderConversationList() {
    var container = $('deskTicketList');
    if (!state.filteredConversations.length) {
      container.innerHTML = '<div class="empty">Сейчас нет активных живых чатов. Новые обращения с сайта появятся здесь автоматически.</div>';
      return;
    }
    container.innerHTML = state.filteredConversations.map(function (conversation) {
      return '<div class="ticket-card' + (conversation.id === state.selectedConversationId ? ' active' : '') + '" data-conversation-id="' + escapeHtml(conversation.id) + '">' +
        '<div class="ticket-top"><div class="ticket-no">' + escapeHtml(conversationStatusLabel(conversation.status)) + '</div><div class="pill ' + escapeHtml(conversation.status === 'closed' ? 'closed' : conversation.status === 'new' ? 'high' : 'progress') + '">' + escapeHtml(relativeDate(conversation.lastMessageAt || conversation.updatedAt)) + '</div></div>' +
        '<div class="ticket-subject">' + escapeHtml(conversation.visitorName || 'Посетитель') + '</div>' +
        '<div class="ticket-no" style="margin-top:6px">' + escapeHtml(conversation.assignedUserName || 'Без исполнителя') + (conversation.ticketId ? ' • тикет связан' : '') + '</div>' +
        '<div class="ticket-preview">' + escapeHtml(conversationPreview(conversation)) + '</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(container.querySelectorAll('.ticket-card'), function (card) {
      card.addEventListener('click', function () { selectConversation(card.getAttribute('data-conversation-id')); });
    });
  }

  function renderSelectedTicket() {
    var stream = $('deskThreadStream');
    var facts = $('deskTicketFacts');
    var history = $('deskHistory');
    var sendBtn = $('deskSendBtn');
    var composer = $('deskComposer');
    if (!state.selectedTicket) {
      $('deskThreadTitle').textContent = 'Выберите тикет';
      $('deskThreadMeta').textContent = 'Откройте заявку слева или создайте новую.';
      stream.innerHTML = '<div class="empty">Здесь появится переписка по выбранному тикету. Клиент видит только свои доступные тикеты, а поддержка и superuser — общую очередь.</div>';
      facts.innerHTML = '<div class="kv-row"><span>Статус</span><span>—</span></div><div class="kv-row"><span>Приоритет</span><span>—</span></div><div class="kv-row"><span>Исполнитель</span><span>—</span></div><div class="kv-row"><span>Создан</span><span>—</span></div><div class="kv-row"><span>Обновлен</span><span>—</span></div>';
      history.innerHTML = '<div class="empty" style="padding:0">История появится после выбора тикета.</div>';
      composer.disabled = true;
      sendBtn.disabled = true;
      return;
    }
    var ticket = state.selectedTicket;
    $('deskThreadTitle').textContent = '#' + ticket.number + ' • ' + ticket.subject;
    $('deskThreadMeta').textContent = 'Статус: ' + statusLabel(ticket.status) + ' • Приоритет: ' + priorityLabel(ticket.priority);
    stream.innerHTML = (ticket.messages || []).map(function (message) {
      var kind = 'other';
      if (message.message_type === 'system' || message.message_type === 'internal_note') kind = 'system';
      else if (message.author_user_id && state.user && message.author_user_id === state.user.id) kind = 'me';
      var author = message.author_name || (kind === 'me' ? 'Вы' : message.message_type === 'system' ? 'Система' : 'Поддержка');
      return '<div class="bubble ' + kind + '"><div class="bubble-meta"><span>' + escapeHtml(author) + '</span><span>' + escapeHtml(formatDate(message.created_at)) + '</span></div><div>' + escapeHtml(message.body) + '</div></div>';
    }).join('') || '<div class="empty">В этом тикете пока нет сообщений.</div>';
    stream.scrollTop = stream.scrollHeight;
    facts.innerHTML =
      '<div class="kv-row"><span>Статус</span><span><span class="pill ' + escapeHtml(ticket.status) + '">' + escapeHtml(statusLabel(ticket.status)) + '</span></span></div>' +
      '<div class="kv-row"><span>Приоритет</span><span><span class="pill ' + escapeHtml(ticket.priority) + '">' + escapeHtml(priorityLabel(ticket.priority)) + '</span></span></div>' +
      '<div class="kv-row"><span>Исполнитель</span><span>' + escapeHtml(ticket.assignee_name || 'Не назначен') + '</span></div>' +
      '<div class="kv-row"><span>Создан</span><span>' + escapeHtml(formatDate(ticket.created_at)) + '</span></div>' +
      '<div class="kv-row"><span>Обновлен</span><span>' + escapeHtml(relativeDate(ticket.updated_at)) + '</span></div>';
    history.innerHTML = (ticket.history || []).length ? ticket.history.slice(0, 8).map(function (item) {
      return '<div class="history-item"><strong>' + escapeHtml(formatDate(item.created_at)) + '</strong><div>' + escapeHtml(item.body) + '</div></div>';
    }).join('') : '<div class="empty" style="padding:0">История по тикету пока пуста.</div>';
    composer.disabled = false;
    sendBtn.disabled = false;
  }

  function renderSelectedConversation() {
    var stream = $('deskThreadStream');
    var facts = $('deskTicketFacts');
    var history = $('deskHistory');
    var sendBtn = $('deskSendBtn');
    var composer = $('deskComposer');
    if (!state.selectedConversation) {
      $('deskThreadTitle').textContent = 'Выберите чат';
      $('deskThreadMeta').textContent = 'Откройте диалог слева, чтобы ответить посетителю.';
      stream.innerHTML = '<div class="empty">Здесь появится переписка по живому чату с сайта.</div>';
      facts.innerHTML = '<div class="kv-row"><span>Статус</span><span>—</span></div><div class="kv-row"><span>Посетитель</span><span>—</span></div><div class="kv-row"><span>Исполнитель</span><span>—</span></div><div class="kv-row"><span>Связанный тикет</span><span>—</span></div><div class="kv-row"><span>Обновлен</span><span>—</span></div>';
      history.innerHTML = '<div class="empty" style="padding:0">История диалога появится после выбора чата.</div>';
      composer.disabled = true;
      sendBtn.disabled = true;
      return;
    }
    var conversation = state.selectedConversation;
    $('deskThreadTitle').textContent = conversation.visitorName || 'Посетитель сайта';
    $('deskThreadMeta').textContent = 'Статус: ' + conversationStatusLabel(conversation.status) + (conversation.ticketId ? ' • связан с тикетом' : '');
    stream.innerHTML = (conversation.messages || []).map(function (message) {
      var kind = message.authorType === 'operator' ? 'me' : 'other';
      var author = message.authorName || (message.authorType === 'operator' ? 'Поддержка' : 'Посетитель');
      return '<div class="bubble ' + kind + '"><div class="bubble-meta"><span>' + escapeHtml(author) + '</span><span>' + escapeHtml(formatDate(message.createdAt)) + '</span></div><div>' + escapeHtml(message.body) + '</div></div>';
    }).join('') || '<div class="empty">В этом чате пока нет сообщений.</div>';
    stream.scrollTop = stream.scrollHeight;
    facts.innerHTML =
      '<div class="kv-row"><span>Статус</span><span><span class="pill ' + escapeHtml(conversation.status === 'closed' ? 'closed' : conversation.status === 'new' ? 'high' : 'progress') + '">' + escapeHtml(conversationStatusLabel(conversation.status)) + '</span></span></div>' +
      '<div class="kv-row"><span>Посетитель</span><span>' + escapeHtml(conversation.visitorName || '—') + '</span></div>' +
      '<div class="kv-row"><span>Исполнитель</span><span>' + escapeHtml(conversation.assignedUserName || 'Не назначен') + '</span></div>' +
      '<div class="kv-row"><span>Связанный тикет</span><span>' + escapeHtml(conversation.ticketId || 'Нет') + '</span></div>' +
      '<div class="kv-row"><span>Обновлен</span><span>' + escapeHtml(relativeDate(conversation.updatedAt)) + '</span></div>';
    history.innerHTML = (conversation.messages || []).length ? conversation.messages.slice(-8).reverse().map(function (message) {
      return '<div class="history-item"><strong>' + escapeHtml(formatDate(message.createdAt)) + '</strong><div>' + escapeHtml((message.authorName || 'Участник') + ': ' + message.body) + '</div></div>';
    }).join('') : '<div class="empty" style="padding:0">История по чату пока пуста.</div>';
    composer.disabled = false;
    sendBtn.disabled = false;
  }

  function renderSelectedEntity() {
    if (state.mode === 'livechat') renderSelectedConversation();
    else renderSelectedTicket();
  }

  function applySearch() {
    var query = ($('deskTicketSearch').value || '').trim().toLowerCase();
    if (state.mode === 'livechat') {
      state.filteredConversations = state.conversations.filter(function (conversation) {
        if (!query) return true;
        return [
          conversation.visitorName,
          conversation.assignedUserName,
          conversation.lastMessagePreview,
          conversation.ticketId
        ].filter(Boolean).some(function (value) {
          return String(value).toLowerCase().indexOf(query) >= 0;
        });
      });
      return;
    }

    var status = $('deskStatusFilter').value;
    var company = $('deskCompanyFilter').value;
    state.filteredTickets = state.tickets.filter(function (ticket) {
      if (status && ticket.status !== status) return false;
      if (company && ticket.company_name !== company) return false;
      if (!query) return true;
      return [ticket.subject, ticket.description, String(ticket.number), ticket.company_name].filter(Boolean).some(function (value) {
        return String(value).toLowerCase().indexOf(query) >= 0;
      });
    });
  }

  function renderList() {
    renderSidebarHeader();
    renderModeControls();
    applySearch();
    if (state.mode === 'livechat') renderConversationList();
    else renderTicketList();
  }

  function syncCompanyFilter() {
    var select = $('deskCompanyFilter');
    if (!showCompanyContext() || state.mode === 'livechat') {
      select.classList.add('hidden');
      select.innerHTML = '<option value="">Все компании</option>';
      refreshCustomSelect(select);
      return;
    }
    var current = select.value;
    var companies = Array.from(new Set(state.tickets.map(function (ticket) { return ticket.company_name || 'Без компании'; }))).sort();
    select.innerHTML = '<option value="">Все компании</option>' + companies.map(function (company) {
      return '<option value="' + escapeHtml(company) + '">' + escapeHtml(company) + '</option>';
    }).join('');
    if (companies.indexOf(current) >= 0) select.value = current;
    select.classList.remove('hidden');
    refreshCustomSelect(select);
  }

  async function fetchTickets() {
    var data = await api('/api/tickets');
    state.tickets = data.tickets || [];
    syncCompanyFilter();
    renderList();
    if (state.selectedTicketId && state.mode === 'tickets') await selectTicket(state.selectedTicketId, true);
  }

  async function fetchConversations() {
    if (!hasLiveChatAccess()) return;
    var data = await api('/api/live-chat/conversations');
    state.conversations = data.conversations || [];
    renderList();
    if (state.selectedConversationId && state.mode === 'livechat') await selectConversation(state.selectedConversationId, true);
  }

  async function selectTicket(ticketId, silent) {
    state.selectedTicketId = ticketId;
    renderList();
    try {
      var data = await api('/api/tickets/' + encodeURIComponent(ticketId));
      state.selectedTicket = data.ticket;
      renderSelectedTicket();
    } catch (error) {
      if (!silent) {
        state.selectedTicket = null;
        renderSelectedTicket();
      }
    }
  }

  async function selectConversation(conversationId, silent) {
    state.selectedConversationId = conversationId;
    renderList();
    try {
      var data = await api('/api/live-chat/conversations/' + encodeURIComponent(conversationId));
      state.selectedConversation = {
        id: data.conversation.id,
        visitorName: data.conversation.visitorName,
        assignedUserName: data.conversation.assignedUserName,
        ticketId: data.conversation.ticketId,
        status: data.conversation.status,
        updatedAt: data.conversation.updatedAt,
        messages: data.messages || []
      };
      renderSelectedConversation();
    } catch (error) {
      if (!silent) {
        state.selectedConversation = null;
        renderSelectedConversation();
      }
    }
  }

  async function login() {
    clearErrors();
    var email = $('deskEmail').value.trim();
    var password = $('deskPassword').value;
    if (!email || !password) return showError('deskAuthError', 'Введите email и пароль.');
    try {
      var data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password }),
        headers: { 'Content-Type': 'application/json' }
      });
      state.token = data.token;
      state.user = data.user;
      saveSession();
      bootDesk();
    } catch (error) {
      showError('deskAuthError', error.message);
    }
  }

  function openModal() {
    clearErrors();
    $('deskNewTicketModal').classList.add('open');
    refreshCustomSelect('deskTicketPriority');
  }

  function closeModal() {
    $('deskNewTicketModal').classList.remove('open');
    $('deskTicketSubject').value = '';
    $('deskTicketDescription').value = '';
    $('deskTicketPriority').value = 'normal';
    clearErrors();
    refreshCustomSelect('deskTicketPriority');
  }

  async function createTicket() {
    clearErrors();
    var subject = $('deskTicketSubject').value.trim();
    var description = $('deskTicketDescription').value.trim();
    var priority = $('deskTicketPriority').value;
    if (subject.length < 3 || description.length < 3) return showError('deskModalError', 'Заполните тему и первое сообщение.');
    try {
      var data = await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject,
          description: description,
          priority: priority,
          category: 'Desktop Desk'
        })
      });
      closeModal();
      await fetchTickets();
      state.mode = 'tickets';
      renderList();
      await selectTicket(data.ticket.id);
    } catch (error) {
      showError('deskModalError', error.message);
    }
  }

  async function sendMessage() {
    var body = $('deskComposer').value.trim();
    if (!body) return;
    $('deskComposer').value = '';
    try {
      if (state.mode === 'livechat') {
        if (!state.selectedConversationId) return;
        await api('/api/live-chat/conversations/' + encodeURIComponent(state.selectedConversationId) + '/messages', {
          method: 'POST',
          body: JSON.stringify({ body: body })
        });
        await fetchConversations();
        await selectConversation(state.selectedConversationId, true);
      } else {
        if (!state.selectedTicketId) return;
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/messages', {
          method: 'POST',
          body: JSON.stringify({ body: body })
        });
        await fetchTickets();
        await selectTicket(state.selectedTicketId, true);
      }
    } catch (error) {
      $('deskComposer').value = body;
    }
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async function () {
      if (!state.token) return;
      try {
        await fetchTickets();
        if (hasLiveChatAccess()) await fetchConversations();
      } catch (error) {}
    }, 12000);
  }

  function setMode(mode) {
    state.mode = mode;
    $('deskComposer').value = '';
    renderList();
    renderSelectedEntity();
  }

  async function bootDesk() {
    if (!state.token || !state.user) return renderAuthState(false);
    renderAuthState(true);
    $('deskUserName').textContent = state.user.fullName || state.user.email || 'Пользователь';
    $('deskUserMeta').textContent = [state.user.companyName || 'Без компании', roleLabel()].join(' • ');
    await fetchTickets();
    if (hasLiveChatAccess()) await fetchConversations();
    renderList();
    renderSelectedEntity();
    startPolling();
  }

  function logout() {
    stopPolling();
    clearSession();
    $('deskPassword').value = '';
    $('deskComposer').value = '';
    renderAuthState(false);
  }

  function bindEvents() {
    $('deskLoginBtn').addEventListener('click', login);
    $('deskPassword').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') login();
    });
    $('deskTicketSearch').addEventListener('input', function () {
      renderList();
    });
    $('deskStatusFilter').addEventListener('change', function () {
      renderList();
    });
    $('deskCompanyFilter').addEventListener('change', function () {
      renderList();
    });
    $('deskRefreshBtn').addEventListener('click', async function () {
      await fetchTickets();
      if (hasLiveChatAccess()) await fetchConversations();
    });
    $('deskLogoutBtn').addEventListener('click', logout);
    $('deskNewTicketBtn').addEventListener('click', openModal);
    $('deskCloseModalBtn').addEventListener('click', closeModal);
    $('deskCreateTicketBtn').addEventListener('click', createTicket);
    $('deskSendBtn').addEventListener('click', sendMessage);
    $('deskModeTickets').addEventListener('click', function () { setMode('tickets'); });
    $('deskModeChats').addEventListener('click', function () { setMode('livechat'); });
    $('deskComposer').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    $('deskNewTicketModal').addEventListener('click', function (event) {
      if (event.target === $('deskNewTicketModal')) closeModal();
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.desk-select')) closeAllCustomSelects();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    refreshAllCustomSelects();
    if (!IS_DESKTOP_RUNTIME) {
      lockBrowserVersion();
      return;
    }
    restoreSession();
    bootDesk();
  });
})();

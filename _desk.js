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
  var utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;

  function $(id) { return document.getElementById(id); }

  function demojibake(value) {
    if (typeof value !== 'string' || !value) return value;
    if (!/[РСЃ]/.test(value)) return value;
    try {
      if (!utf8Decoder) return value;
      var bytes = new Uint8Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        bytes[i] = value.charCodeAt(i) & 255;
      }
      var fixed = utf8Decoder.decode(bytes);
      return /[А-Яа-яЁё]/.test(fixed) ? fixed : value;
    } catch (error) {
      return value;
    }
  }

  function fixNodeText(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      var fixed = demojibake(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    }
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('input[placeholder], textarea[placeholder]') : [], function (field) {
      var placeholder = field.getAttribute('placeholder');
      if (!placeholder) return;
      var fixed = demojibake(placeholder);
      if (fixed !== placeholder) field.setAttribute('placeholder', fixed);
    });
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('option') : [], function (option) {
      var fixed = demojibake(option.textContent);
      if (fixed !== option.textContent) option.textContent = fixed;
    });
  }

  function normalizeDeskText() {
    fixNodeText(document.body);
  }

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

  function remoteSessionStatusLabel(code) {
    return ({
      requested: 'Ожидает',
      ready: 'Готово',
      active: 'Подключено',
      ended: 'Завершена',
      cancelled: 'Отменена'
    }[code] || code || '?');
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

  function canEditSelectedTicketStatus() {
    if (!state.selectedTicket || state.mode !== 'tickets') return false;
    if (state.user && state.user.isGlobalAdmin) return true;
    if (hasPermission('ticket.update.all') || hasPermission('ticket.update.company')) return true;
    return hasPermission('ticket.update.own') && state.user && state.selectedTicket.created_by_user_id === state.user.id;
  }

  function canManageRemoteDesk() {
    return !!(state.user && (state.user.isGlobalAdmin || hasPermission('ticket.assign') || hasPermission('ticket.view.all')));
  }

  function ensureRemotePanel() {
    var panel = $('deskRemotePanel');
    if (panel) return panel;
    var historyCard = $('deskHistory');
    if (!historyCard || !historyCard.closest) return null;
    var historyAsideCard = historyCard.closest('.aside-card');
    if (!historyAsideCard || !historyAsideCard.parentNode) return null;

    var remoteCard = document.createElement('div');
    remoteCard.className = 'aside-card';
    remoteCard.innerHTML = '<h3>Удаленная помощь</h3><div id="deskRemotePanel" class="history"><div class="empty" style="padding:0">Выберите тикет, чтобы запросить или запустить удаленную помощь.</div></div>';
    historyAsideCard.parentNode.insertBefore(remoteCard, historyAsideCard);
    return $('deskRemotePanel');
  }

  function latestRemoteSession() {
    if (!state.selectedTicket || !state.selectedTicket.remote_sessions || !state.selectedTicket.remote_sessions.length) return null;
    return state.selectedTicket.remote_sessions[0];
  }

  function latestRemoteDevice() {
    if (!state.selectedTicket || !state.selectedTicket.remote_devices || !state.selectedTicket.remote_devices.length) return null;
    return state.selectedTicket.remote_devices[0];
  }

  function syncQuickStatusPanel() {
    var wrap = $('deskQuickStatusWrap');
    var select = $('deskQuickStatus');
    if (!wrap || !select) return;
    var visible = !!(state.mode === 'tickets' && state.selectedTicket && canEditSelectedTicketStatus());
    wrap.classList.toggle('hidden', !visible);
    if (!visible) {
      closeAllCustomSelects('deskQuickStatus');
      return;
    }
    select.value = state.selectedTicket.status || 'open';
    refreshCustomSelect(select);
  }

  function renderRemotePanel() {
    var panel = ensureRemotePanel();
    if (!panel) return;

    if (!state.selectedTicket || state.mode !== 'tickets') {
      panel.innerHTML = '<div class="empty" style="padding:0">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043a\u0435\u0442, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0438\u043b\u0438 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0443\u0434\u0430\u043b\u0435\u043d\u043d\u0443\u044e \u043f\u043e\u043c\u043e\u0449\u044c.</div>';
      return;
    }

    var session = latestRemoteSession();
    var device = latestRemoteDevice();
    var canManage = canManageRemoteDesk();
    var canRequest = !!state.user;
    var parts = [];

    if (device) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>' + escapeHtml(device.label || '\u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0430') + '</strong>' +
          '<div class="remote-row"><span>ID</span><span>' + escapeHtml(device.remote_client_id || '\u0435\u0449\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d') + '</span></div>' +
          '<div class="remote-row"><span>\u0414\u043e\u0441\u0442\u0443\u043f</span><span>' + escapeHtml(device.unattended_enabled ? '\u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0439' : '\u043f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443') + '</span></div>' +
        '</div>'
      );
    }

    if (session) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u0441\u0435\u0441\u0441\u0438\u044f</strong>' +
          '<div class="remote-row"><span>\u0420\u0435\u0436\u0438\u043c</span><span>' + escapeHtml(session.access_mode === 'unattended' ? '\u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0439' : '\u0440\u0430\u0437\u043e\u0432\u044b\u0439') + '</span></div>' +
          '<div class="remote-row"><span>\u0421\u0442\u0430\u0442\u0443\u0441</span><span>' + escapeHtml(remoteSessionStatusLabel(session.status)) + '</span></div>' +
          '<div class="remote-row"><span>\u041a\u043e\u0434</span><span>' + escapeHtml(session.join_code || '?') + '</span></div>' +
          '<div class="remote-row"><span>\u0418\u043d\u0436\u0435\u043d\u0435\u0440</span><span>' + escapeHtml(session.engineer_name || '\u043d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d') + '</span></div>' +
        '</div>'
      );
    } else {
      parts.push('<div class="remote-card"><strong>\u0421\u0435\u0441\u0441\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</strong><div class="remote-note">\u041c\u043e\u0436\u043d\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u0440\u0430\u0437\u043e\u0432\u043e\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u0438\u043b\u0438 \u0432\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u0437\u0430\u0434\u0430\u0447\u0438.</div></div>');
    }

    var buttons = [];
    if (canRequest) {
      buttons.push('<button class="btn btn-secondary" type="button" data-remote-action="request">\u0417\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u043f\u043e\u043c\u043e\u0449\u044c</button>');
      buttons.push('<button class="btn btn-secondary" type="button" data-remote-action="unattended">\u041f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f</button>');
    }
    if (canManage && session) {
      if (session.status !== 'active') buttons.push('<button class="btn btn-primary" type="button" data-remote-action="connect">\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f</button>');
      if (session.status === 'active' || session.status === 'ready' || session.status === 'requested') buttons.push('<button class="btn btn-ghost" type="button" data-remote-action="finish">\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c</button>');
    }
    if (canManage && device && device.unattended_enabled) {
      buttons.push('<button class="btn btn-ghost" type="button" data-remote-action="disable-unattended">\u041e\u0442\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f</button>');
    }

    parts.push('<div class="remote-actions">' + buttons.join('') + '</div>');
    panel.innerHTML = parts.join('');
    Array.prototype.forEach.call(panel.querySelectorAll('[data-remote-action]'), function (button) {
      button.addEventListener('click', function () {
        handleRemoteAction(button.getAttribute('data-remote-action'));
      });
    });
  }

  function renderSidebarHeader() {
    var title = document.querySelector('.sidebar-title h2');
    var sub = document.querySelector('.sidebar-sub');
    if (state.mode === 'livechat') {
      title.textContent = 'Живые чаты';
      if (sub) sub.textContent = 'Очередь обращений с сайта для superuser и поддержки: новые диалоги, ответы и быстрый переход в задачу.';
    } else {
      title.textContent = hasPermission('ticket.view.all') || (state.user && state.user.isGlobalAdmin) ? 'Все тикеты' : 'Мои тикеты';
      if (sub) sub.textContent = 'Легкий рабочий режим: список заявок, переписка по задаче и быстрые обновления без полного портала.';
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
      syncQuickStatusPanel();
      renderRemotePanel();
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
    syncQuickStatusPanel();
    renderRemotePanel();
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
      syncQuickStatusPanel();
      renderRemotePanel();
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
    syncQuickStatusPanel();
    renderRemotePanel();
  }

  function renderSelectedEntity() {
    if (state.mode === 'livechat') renderSelectedConversation();
    else renderSelectedTicket();
    normalizeDeskText();
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
    normalizeDeskText();
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

  async function updateSelectedTicketStatus() {
    if (!state.selectedTicketId || !state.selectedTicket || !canEditSelectedTicketStatus()) return;
    var select = $('deskQuickStatus');
    var nextStatus = select.value;
    var currentStatus = state.selectedTicket.status;
    if (!nextStatus || nextStatus === currentStatus) return;
    try {
      await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId), {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      await fetchTickets();
      await selectTicket(state.selectedTicketId, true);
    } catch (error) {
      select.value = currentStatus;
      refreshCustomSelect(select);
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

  async function handleRemoteAction(action) {
    if (!state.selectedTicketId || !state.selectedTicket) return;
    try {
      if (action === 'request') {
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions', {
          method: 'POST',
          body: JSON.stringify({ accessMode: 'interactive', deviceLabel: 'Рабочее место клиента' })
        });
      } else if (action === 'unattended') {
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions', {
          method: 'POST',
          body: JSON.stringify({ accessMode: 'unattended', deviceLabel: 'Рабочее место клиента' })
        });
      } else if (action === 'connect') {
        var connectSession = latestRemoteSession();
        if (!connectSession) return;
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions/' + encodeURIComponent(connectSession.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' })
        });
      } else if (action === 'finish') {
        var finishSession = latestRemoteSession();
        if (!finishSession) return;
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions/' + encodeURIComponent(finishSession.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ended', endedReason: 'Сеанс завершен инженером' })
        });
      } else if (action === 'disable-unattended') {
        var unattendedSession = latestRemoteSession();
        if (!unattendedSession) return;
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions/' + encodeURIComponent(unattendedSession.id), {
          method: 'PATCH',
          body: JSON.stringify({ unattendedEnabled: false })
        });
      }

      await fetchTickets();
      await selectTicket(state.selectedTicketId, true);
    } catch (error) {}
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
    $('deskQuickStatus').addEventListener('change', function () {
      updateSelectedTicketStatus();
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
    normalizeDeskText();
    if (!IS_DESKTOP_RUNTIME) {
      lockBrowserVersion();
      normalizeDeskText();
      return;
    }
    restoreSession();
    bootDesk();
  });
})();

(function () {
  var state = {
    token: '',
    user: null,
    tickets: [],
    filteredTickets: [],
    selectedTicketId: null,
    selectedTicket: null,
    pollTimer: null
  };
  var TOKEN_KEY = 'zit_desk_token';
  var USER_KEY = 'zit_desk_user';
  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatDate(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
    catch (e) { return value; }
  }
  function relativeDate(value) {
    if (!value) return '—';
    var now = Date.now();
    var then = new Date(value).getTime();
    var diffMinutes = Math.round((then - now) / 60000);
    var abs = Math.abs(diffMinutes);
    if (abs < 1) return 'только что';
    if (abs < 60) return (diffMinutes < 0 ? abs + ' мин назад' : 'через ' + abs + ' мин');
    var diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return diffHours < 0 ? Math.abs(diffHours) + ' ч назад' : 'через ' + diffHours + ' ч';
    return formatDate(value);
  }
  function statusLabel(code) { return ({ open: 'Открыт', progress: 'В работе', done: 'Решен', closed: 'Закрыт' }[code] || code || '—'); }
  function priorityLabel(code) { return ({ low: 'Низкий', normal: 'Средний', high: 'Высокий', critical: 'Критичный' }[code] || code || '—'); }
  function hasPermission(code) { return !!(state.user && state.user.permissions && state.user.permissions.indexOf(code) >= 0); }
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
  function authHeaders() { return state.token ? { Authorization: 'Bearer ' + state.token } : {}; }
  async function api(path, options) {
    var request = Object.assign({ headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()) }, options || {});
    var response = await fetch(path, request);
    var data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (!response.ok) throw new Error(data && data.error ? data.error : 'Ошибка запроса');
    return data;
  }
  function saveSession() {
    localStorage.setItem(TOKEN_KEY, state.token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(state.user || null));
  }
  function restoreSession() {
    state.token = localStorage.getItem(TOKEN_KEY) || '';
    try { state.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { state.user = null; }
  }
  function clearSession() {
    state.token = ''; state.user = null; state.tickets = []; state.filteredTickets = []; state.selectedTicketId = null; state.selectedTicket = null;
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  }
  function showError(id, message) { var box = $(id); box.textContent = message; box.classList.add('show'); }
  function clearErrors() { $('deskAuthError').classList.remove('show'); $('deskModalError').classList.remove('show'); }
  function renderAuthState(isAuthed) { $('deskAuth').classList.toggle('hidden', isAuthed); $('deskApp').classList.toggle('hidden', !isAuthed); }
  function ticketPreview(ticket) {
    var message = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1].body : ticket.description;
    return message || 'Без сообщений';
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
  function renderSelectedTicket() {
    var stream = $('deskThreadStream');
    var facts = $('deskTicketFacts');
    var history = $('deskHistory');
    var sendBtn = $('deskSendBtn');
    var composer = $('deskComposer');
    if (!state.selectedTicket) {
      $('deskThreadTitle').textContent = 'Выберите тикет';
      $('deskThreadMeta').textContent = 'Откройте заявку слева или создайте новую.';
      stream.innerHTML = '<div class="empty">Здесь появится переписка по выбранному тикету. Клиент видит только свои доступные тикеты и может вести диалог по задаче как в мессенджере.</div>';
      facts.innerHTML = '<div class="kv-row"><span>Статус</span><span>—</span></div><div class="kv-row"><span>Приоритет</span><span>—</span></div><div class="kv-row"><span>Исполнитель</span><span>—</span></div><div class="kv-row"><span>Создан</span><span>—</span></div><div class="kv-row"><span>Обновлен</span><span>—</span></div>';
      history.innerHTML = '<div class="empty" style="padding:0">История появится после выбора тикета.</div>';
      composer.disabled = true; sendBtn.disabled = true; return;
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
    composer.disabled = false; sendBtn.disabled = false;
  }
  function applySearch() {
    var query = ($('deskTicketSearch').value || '').trim().toLowerCase();
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
  function showCompanyContext() {
    return hasPermission('ticket.view.all') || !!(state.user && state.user.isGlobalAdmin);
  }
  function syncCompanyFilter() {
    var select = $('deskCompanyFilter');
    if (!showCompanyContext()) {
      select.classList.add('hidden');
      select.innerHTML = '<option value="">Все компании</option>';
      return;
    }
    var current = select.value;
    var companies = Array.from(new Set(state.tickets.map(function (ticket) { return ticket.company_name || 'Без компании'; }))).sort();
    select.innerHTML = '<option value="">Все компании</option>' + companies.map(function (company) {
      return '<option value="' + escapeHtml(company) + '">' + escapeHtml(company) + '</option>';
    }).join('');
    if (companies.indexOf(current) >= 0) select.value = current;
    select.classList.remove('hidden');
  }
  async function fetchTickets() {
    var data = await api('/api/tickets');
    state.tickets = data.tickets || [];
    syncCompanyFilter();
    applySearch();
    renderTicketList();
    if (state.selectedTicketId) await selectTicket(state.selectedTicketId, true);
  }
  async function selectTicket(ticketId, silent) {
    state.selectedTicketId = ticketId;
    renderTicketList();
    try {
      var data = await api('/api/tickets/' + encodeURIComponent(ticketId));
      state.selectedTicket = data.ticket;
      renderSelectedTicket();
    } catch (error) {
      if (!silent) { state.selectedTicket = null; renderSelectedTicket(); }
    }
  }
  async function login() {
    clearErrors();
    var email = $('deskEmail').value.trim();
    var password = $('deskPassword').value;
    if (!email || !password) return showError('deskAuthError', 'Введите email и пароль.');
    try {
      var data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }), headers: { 'Content-Type': 'application/json' } });
      state.token = data.token; state.user = data.user; saveSession(); bootDesk();
    } catch (error) { showError('deskAuthError', error.message); }
  }
  function openModal() { clearErrors(); $('deskNewTicketModal').classList.add('open'); }
  function closeModal() {
    $('deskNewTicketModal').classList.remove('open');
    $('deskTicketSubject').value = ''; $('deskTicketDescription').value = ''; $('deskTicketPriority').value = 'normal'; clearErrors();
  }
  async function createTicket() {
    clearErrors();
    var subject = $('deskTicketSubject').value.trim();
    var description = $('deskTicketDescription').value.trim();
    var priority = $('deskTicketPriority').value;
    if (subject.length < 3 || description.length < 3) return showError('deskModalError', 'Заполните тему и первое сообщение.');
    try {
      var data = await api('/api/tickets', { method: 'POST', body: JSON.stringify({ subject: subject, description: description, priority: priority, category: 'Desktop Desk' }) });
      closeModal(); await fetchTickets(); await selectTicket(data.ticket.id);
    } catch (error) { showError('deskModalError', error.message); }
  }
  async function sendMessage() {
    if (!state.selectedTicketId) return;
    var body = $('deskComposer').value.trim();
    if (!body) return;
    $('deskComposer').value = '';
    try {
      var data = await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/messages', { method: 'POST', body: JSON.stringify({ body: body }) });
      state.selectedTicket = data.ticket; await fetchTickets(); renderSelectedTicket();
    } catch (error) { $('deskComposer').value = body; }
  }
  function stopPolling() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async function () { if (!state.token) return; try { await fetchTickets(); } catch (e) {} }, 12000);
  }
  async function bootDesk() {
    if (!state.token || !state.user) return renderAuthState(false);
    renderAuthState(true);
    $('deskUserName').textContent = state.user.fullName || state.user.email || 'Пользователь';
    $('deskUserMeta').textContent = [state.user.companyName || 'Без компании', roleLabel()].join(' • ');
    await fetchTickets(); renderSelectedTicket(); startPolling();
  }
  function logout() { stopPolling(); clearSession(); renderAuthState(false); $('deskPassword').value = ''; $('deskComposer').value = ''; }
  function bindEvents() {
    $('deskLoginBtn').addEventListener('click', login);
    $('deskPassword').addEventListener('keydown', function (event) { if (event.key === 'Enter') login(); });
    $('deskTicketSearch').addEventListener('input', function () { applySearch(); renderTicketList(); });
    $('deskStatusFilter').addEventListener('change', function () { applySearch(); renderTicketList(); });
    $('deskCompanyFilter').addEventListener('change', function () { applySearch(); renderTicketList(); });
    $('deskRefreshBtn').addEventListener('click', fetchTickets);
    $('deskLogoutBtn').addEventListener('click', logout);
    $('deskNewTicketBtn').addEventListener('click', openModal);
    $('deskCloseModalBtn').addEventListener('click', closeModal);
    $('deskCreateTicketBtn').addEventListener('click', createTicket);
    $('deskSendBtn').addEventListener('click', sendMessage);
    $('deskComposer').addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    $('deskNewTicketModal').addEventListener('click', function (event) { if (event.target === $('deskNewTicketModal')) closeModal(); });
  }
  document.addEventListener('DOMContentLoaded', function () { bindEvents(); restoreSession(); bootDesk(); });
})();

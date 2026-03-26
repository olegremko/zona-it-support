(function () {
  var state = {
    token: '',
    user: null,
    mode: 'tickets',
    tickets: [],
    filteredTickets: [],
    selectedTicketId: null,
    selectedTicket: null,
    selectedTicketUnreadCount: 0,
    conversations: [],
    filteredConversations: [],
    selectedConversationId: null,
    selectedConversation: null,
    selectedConversationUnreadCount: 0,
    pollTimer: null,
    unreadTickets: {},
    unreadConversations: {},
    lastTicketSignatures: {},
    lastConversationSignatures: {},
    remotePasswords: {},
    remotePreparedTickets: {},
    desktopRemote: {
      installed: false,
      clientId: '',
      password: '',
      busy: false
    }
  };

  var TOKEN_KEY = 'zit_desk_token';
  var USER_KEY = 'zit_desk_user';
  var UNREAD_TICKETS_KEY = 'zit_desk_unread_tickets';
  var UNREAD_CONVERSATIONS_KEY = 'zit_desk_unread_conversations';
  var REMOTE_PASSWORDS_KEY = 'zit_desk_remote_passwords';
  var IS_DESKTOP_RUNTIME = !!(window.zonaDeskEnv && window.zonaDeskEnv.platform === 'windows-electron');
  var DESK_BRIDGE = window.zonaDeskBridge || null;
  var utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: false }) : null;

  function $(id) { return document.getElementById(id); }

  function demojibake(value) {
    if (typeof value !== 'string' || !value) return value;
    if (!/[Р РЎРѓ]/.test(value)) return value;
    try {
      if (!utf8Decoder) return value;
      var bytes = new Uint8Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        bytes[i] = value.charCodeAt(i) & 255;
      }
      var fixed = utf8Decoder.decode(bytes);
      return /[\u0400-\u04FF]/.test(fixed) ? fixed : value;
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

  function formatDeskError(error, fallback) {
    if (!error) return fallback || 'РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР°.';
    if (typeof error === 'string') return error;
    if (error.message && typeof error.message === 'string') return error.message;
    if (error.error && typeof error.error === 'string') return error.error;
    if (error.error && typeof error.error === 'object') return formatDeskError(error.error, fallback);
    if (error.code && typeof error.code === 'string' && error.syscall) return 'Р С›РЎв‚¬Р С‘Р В±Р С”Р В° ' + error.code + ' Р С—РЎР‚Р С‘ ' + error.syscall + '.';
    try {
      return JSON.stringify(error, function (_key, value) {
        if (value instanceof Error) {
          return {
            message: value.message,
            code: value.code,
            syscall: value.syscall,
            path: value.path
          };
        }
        return value;
      });
    } catch (_jsonError) {
      return fallback || String(error);
    }
  }

  function formatDate(value) {
    if (!value) return 'вЂ”';
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
    if (!value) return 'вЂ”';
    var now = Date.now();
    var then = new Date(value).getTime();
    var diffMinutes = Math.round((then - now) / 60000);
    var abs = Math.abs(diffMinutes);
    if (abs < 1) return 'С‚РѕР»СЊРєРѕ С‡С‚Рѕ';
    if (abs < 60) return diffMinutes < 0 ? abs + ' РјРёРЅ РЅР°Р·Р°Рґ' : 'С‡РµСЂРµР· ' + abs + ' РјРёРЅ';
    var diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return diffHours < 0 ? Math.abs(diffHours) + ' С‡ РЅР°Р·Р°Рґ' : 'С‡РµСЂРµР· ' + diffHours + ' С‡';
    return formatDate(value);
  }

  function statusLabel(code) {
    return ({ open: 'РћС‚РєСЂС‹С‚', progress: 'Р’ СЂР°Р±РѕС‚Рµ', done: 'Р РµС€РµРЅ', closed: 'Р—Р°РєСЂС‹С‚' }[code] || code || 'вЂ”');
  }

  function priorityLabel(code) {
    return ({ low: 'РќРёР·РєРёР№', normal: 'РЎСЂРµРґРЅРёР№', high: 'Р’С‹СЃРѕРєРёР№', critical: 'РљСЂРёС‚РёС‡РЅС‹Р№' }[code] || code || 'вЂ”');
  }

  function conversationStatusLabel(code) {
    return ({ new: 'РќРѕРІС‹Р№', active: 'РђРєС‚РёРІРЅС‹Р№', closed: 'Р—Р°РєСЂС‹С‚' }[code] || code || 'вЂ”');
  }

  function ticketMessageSignature(ticket) {
    var last = ticket && ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1] : null;
    if (!last) return String(ticket && ticket.updated_at || '');
    return [last.id || '', last.created_at || '', last.author_user_id || '', last.body || ''].join('|');
  }

  function conversationMessageSignature(conversation) {
    var last = conversation && conversation.messages && conversation.messages.length ? conversation.messages[conversation.messages.length - 1] : null;
    if (!last) return String((conversation && (conversation.lastMessageAt || conversation.updatedAt)) || '');
    return [last.id || '', last.createdAt || '', last.authorType || '', last.body || ''].join('|');
  }

  function remoteSessionStatusLabel(code) {
    return ({
      requested: 'РћР¶РёРґР°РµС‚',
      ready: 'Р“РѕС‚РѕРІРѕ',
      active: 'РџРѕРґРєР»СЋС‡РµРЅРѕ',
      ended: 'Р—Р°РІРµСЂС€РµРЅР°',
      cancelled: 'РћС‚РјРµРЅРµРЅР°'
    }[code] || code || '?');
  }

  function hasPermission(code) {
    return !!(state.user && state.user.permissions && state.user.permissions.indexOf(code) >= 0);
  }

  function normalizeUser(rawUser, previousUser) {
    var source = rawUser || {};
    var previous = previousUser || state.user || {};
    var email = source.email || previous.email || '';
    var role = source.role_code || source.role || previous.role || '';
    var permissions = Array.isArray(source.permissions) ? source.permissions.slice() : (Array.isArray(previous.permissions) ? previous.permissions.slice() : []);
    var isGlobalAdmin = source.is_global_admin === undefined && source.isGlobalAdmin === undefined
      ? Boolean(previous.isGlobalAdmin)
      : Boolean(source.is_global_admin || source.isGlobalAdmin);

    if (!role && /^(agent@zonait\.local|superuser@i-zone\.pro|admin@i-zone\.pro|admin@zonait\.local)$/i.test(email)) {
      role = /^agent@zonait\.local$/i.test(email) ? 'support_agent' : 'platform_admin';
    }

    if (String(role).indexOf('support_') === 0) {
      if (permissions.indexOf('ticket.view.all') < 0) permissions.push('ticket.view.all');
      if (permissions.indexOf('livechat.reply') < 0) permissions.push('livechat.reply');
      if (permissions.indexOf('ticket.assign') < 0) permissions.push('ticket.assign');
    }

    if (role === 'platform_admin') {
      isGlobalAdmin = true;
    }

    return {
      id: source.user_id || source.id || previous.id || null,
      email: email,
      fullName: source.full_name || source.fullName || previous.fullName || '',
      companyId: source.company_id || source.companyId || previous.companyId || null,
      companyName: source.company_name || source.companyName || previous.companyName || '',
      role: role,
      isGlobalAdmin: isGlobalAdmin,
      permissions: permissions
    };
  }

  function isSupportRole() {
    return !!(state.user && (
      String(state.user.role || '').indexOf('support_') === 0 ||
      String(state.user.role || '') === 'platform_admin'
    ));
  }

  function hasLiveChatAccess() {
    return !!(state.user && (state.user.isGlobalAdmin || hasPermission('livechat.reply') || isSupportRole()));
  }

  function showCompanyContext() {
    return !!(state.user && (state.user.isGlobalAdmin || hasPermission('ticket.view.all') || isSupportRole()));
  }

  function roleLabel() {
    if (!state.user) return 'client_user';
    return ({
      client_user: 'РљР»РёРµРЅС‚',
      client_admin: 'Р СѓРєРѕРІРѕРґРёС‚РµР»СЊ РєРѕРјРїР°РЅРёРё',
      support_agent: 'РРЅР¶РµРЅРµСЂ РїРѕРґРґРµСЂР¶РєРё',
      support_lead: 'Р СѓРєРѕРІРѕРґРёС‚РµР»СЊ РїРѕРґРґРµСЂР¶РєРё',
      platform_admin: 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РїР»Р°С‚С„РѕСЂРјС‹'
    }[state.user.role] || state.user.role || 'РљР»РёРµРЅС‚');
  }

  function authHeaders() {
    return state.token ? { Authorization: 'Bearer ' + state.token } : {};
  }

  function remoteRuntime() {
    return state.selectedTicket && state.selectedTicket.remote_runtime ? state.selectedTicket.remote_runtime : null;
  }

  function randomRemotePassword() {
    return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
  }

  function ticketRemotePassword(ticket) {
    if (!ticket) return '';
    var device = ticket.remote_devices && ticket.remote_devices.length ? ticket.remote_devices[0] : null;
    if (device && device.remote_password) return String(device.remote_password).trim();
    if (state.remotePasswords[ticket.id]) return String(state.remotePasswords[ticket.id]).trim();
    var generated = randomRemotePassword();
    state.remotePasswords[ticket.id] = generated;
    saveSession();
    return generated;
  }

  function remoteOptionsForTicket(ticket) {
    var runtime = ticket && ticket.remote_runtime ? ticket.remote_runtime : remoteRuntime();
    return {
      host: runtime && runtime.server_host ? runtime.server_host : '',
      key: runtime && runtime.server_key ? runtime.server_key : '',
      configString: runtime && runtime.server_config ? runtime.server_config : '',
      password: ticketRemotePassword(ticket || state.selectedTicket)
    };
  }

  function hasDesktopBridge() {
    return !!(IS_DESKTOP_RUNTIME && DESK_BRIDGE);
  }

  function updateUnreadIndicator() {
    var ticketCount = Object.keys(state.unreadTickets || {}).filter(function (id) { return !!state.unreadTickets[id]; }).length;
    var conversationCount = Object.keys(state.unreadConversations || {}).filter(function (id) { return !!state.unreadConversations[id]; }).length;
    if (hasDesktopBridge() && DESK_BRIDGE.setUnreadCount) {
      DESK_BRIDGE.setUnreadCount(ticketCount + conversationCount);
    }
    saveSession();
  }

  async function notifyDesk(title, body) {
    if (!hasDesktopBridge() || !DESK_BRIDGE.notify) return;
    try {
      await DESK_BRIDGE.notify({ title: title, body: body });
    } catch (error) {}
  }

  function markTicketRead(ticketId) {
    if (!ticketId) return;
    delete state.unreadTickets[ticketId];
    updateUnreadIndicator();
  }

  function markConversationRead(conversationId) {
    if (!conversationId) return;
    delete state.unreadConversations[conversationId];
    updateUnreadIndicator();
  }

  async function copyDeskText(value) {
    if (!value) return false;
    try {
      if (hasDesktopBridge() && DESK_BRIDGE.copyText) {
        await DESK_BRIDGE.copyText(value);
        return true;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (error) {}
    return false;
  }

  async function refreshDesktopRemoteState() {
    if (!hasDesktopBridge() || !DESK_BRIDGE.getRustDeskStatus) return;
    try {
      state.desktopRemote.busy = true;
      var info = await DESK_BRIDGE.getRustDeskStatus();
      state.desktopRemote.installed = !!(info && info.installed);
      state.desktopRemote.clientId = info && info.clientId ? String(info.clientId).trim() : '';
      state.desktopRemote.password = info && info.password ? String(info.password).trim() : '';
    } catch (error) {
      state.desktopRemote.installed = false;
      state.desktopRemote.clientId = '';
      state.desktopRemote.password = '';
    } finally {
      state.desktopRemote.busy = false;
    }
  }

  async function getDesktopSystemInfo() {
    if (!hasDesktopBridge() || !DESK_BRIDGE.getSystemInfo) return null;
    try {
      var info = await DESK_BRIDGE.getSystemInfo();
      return info || null;
    } catch (error) {
      return null;
    }
  }

  async function syncCurrentDeviceInfo(remotePassword) {
    if (!state.selectedTicketId) return;
    var systemInfo = await getDesktopSystemInfo();
    var localClientId = state.desktopRemote && state.desktopRemote.clientId ? state.desktopRemote.clientId : null;
    var password = remotePassword || state.desktopRemote.password || ticketRemotePassword(state.selectedTicket);
    if (!systemInfo && !localClientId && !password) return;
    var payload = {
      deviceLabel: 'Р Р°Р±РѕС‡РµРµ РјРµСЃС‚Рѕ РєР»РёРµРЅС‚Р°',
      remoteClientId: localClientId || '',
      deviceName: systemInfo && systemInfo.deviceName ? systemInfo.deviceName : '',
      localIp: systemInfo && systemInfo.localIp ? systemInfo.localIp : '',
      publicIp: systemInfo && systemInfo.publicIp ? systemInfo.publicIp : '',
      gatewayIp: systemInfo && systemInfo.gatewayIp ? systemInfo.gatewayIp : ''
    };
    if (password) payload.remotePassword = password;
    await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-device', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async function api(path, options) {
    var request = Object.assign({
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders())
    }, options || {});
    var response = await fetch(path, request);
    var data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    if (!response.ok) throw new Error(data && data.error ? data.error : 'РћС€РёР±РєР° Р·Р°РїСЂРѕСЃР°');
    return data;
  }

  function saveSession() {
    localStorage.setItem(TOKEN_KEY, state.token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(state.user || null));
    localStorage.setItem(UNREAD_TICKETS_KEY, JSON.stringify(state.unreadTickets || {}));
    localStorage.setItem(UNREAD_CONVERSATIONS_KEY, JSON.stringify(state.unreadConversations || {}));
    localStorage.setItem(REMOTE_PASSWORDS_KEY, JSON.stringify(state.remotePasswords || {}));
  }

  function restoreSession() {
    state.token = localStorage.getItem(TOKEN_KEY) || '';
    try { state.user = normalizeUser(JSON.parse(localStorage.getItem(USER_KEY) || 'null') || null, null); } catch (error) { state.user = null; }
    try { state.unreadTickets = JSON.parse(localStorage.getItem(UNREAD_TICKETS_KEY) || '{}') || {}; } catch (error) { state.unreadTickets = {}; }
    try { state.unreadConversations = JSON.parse(localStorage.getItem(UNREAD_CONVERSATIONS_KEY) || '{}') || {}; } catch (error) { state.unreadConversations = {}; }
    try { state.remotePasswords = JSON.parse(localStorage.getItem(REMOTE_PASSWORDS_KEY) || '{}') || {}; } catch (error) { state.remotePasswords = {}; }
  }

  function clearSession() {
    state.token = '';
    state.user = null;
    state.mode = 'tickets';
    state.tickets = [];
    state.filteredTickets = [];
    state.selectedTicketId = null;
    state.selectedTicket = null;
    state.selectedTicketUnreadCount = 0;
    state.conversations = [];
    state.filteredConversations = [];
    state.selectedConversationId = null;
    state.selectedConversation = null;
    state.selectedConversationUnreadCount = 0;
    state.unreadTickets = {};
    state.unreadConversations = {};
    state.lastTicketSignatures = {};
    state.lastConversationSignatures = {};
    state.remotePasswords = {};
    state.remotePreparedTickets = {};
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(UNREAD_TICKETS_KEY);
    localStorage.removeItem(UNREAD_CONVERSATIONS_KEY);
    localStorage.removeItem(REMOTE_PASSWORDS_KEY);
  }

  async function refreshCurrentUser() {
    if (!state.token) return false;
    try {
      var data = await api('/api/auth/me', { method: 'GET' });
      if (!data || !data.user) return false;
      state.user = normalizeUser(data.user, state.user);
      saveSession();
      return true;
    } catch (error) {
      return false;
    }
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
    $('deskLoginBtn').textContent = 'Р”РѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РІ Windows';
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
      btn.innerHTML = '<span>' + escapeHtml(option.textContent || '') + '</span><span class="desk-select-check">вњ“</span>';
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
    trigger.innerHTML = '<span class="desk-select-label"></span><span class="desk-select-caret">в–ѕ</span>';
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
    return message || 'Р‘РµР· СЃРѕРѕР±С‰РµРЅРёР№';
  }

  function conversationPreview(conversation) {
    return conversation.lastMessagePreview || 'Р”РёР°Р»РѕРі РµС‰Рµ РЅРµ РЅР°С‡Р°С‚';
  }

  function renderModeControls() {
    var tabs = $('deskModeTabs');
    var isChatMode = state.mode === 'livechat';
    tabs.classList.toggle('hidden', !hasLiveChatAccess());
    $('deskModeTickets').classList.toggle('active', !isChatMode);
    $('deskModeChats').classList.toggle('active', isChatMode);
    $('deskStatusFilter').classList.toggle('hidden', isChatMode);
    $('deskSortFilter').classList.toggle('hidden', false);
    $('deskCompanyFilter').classList.toggle('hidden', isChatMode || !showCompanyContext());
    $('deskNewTicketBtn').classList.toggle('hidden', isChatMode);
    refreshCustomSelect('deskStatusFilter');
    refreshCustomSelect('deskSortFilter');
    refreshCustomSelect('deskCompanyFilter');
    $('deskTicketSearch').placeholder = isChatMode ? 'РџРѕРёСЃРє РїРѕ Р¶РёРІС‹Рј С‡Р°С‚Р°Рј...' : 'РџРѕРёСЃРє РїРѕ С‚РёРєРµС‚Р°Рј...';
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

  function viewerIsSupportSide() {
    return !!(state.user && (
      state.user.isGlobalAdmin ||
      hasPermission('ticket.view.all') ||
      hasPermission('ticket.assign') ||
      String(state.user.role || '').indexOf('support_') === 0
    ));
  }

  function messageBelongsToViewerSide(message) {
    if (!message || !state.user) return false;
    if (message.author_user_id && message.author_user_id === state.user.id) return true;
    if (viewerIsSupportSide()) return !!message.author_is_support;
    if (message.author_user_id && state.user.companyId && message.author_company_id) {
      return String(message.author_company_id) === String(state.user.companyId);
    }
    return false;
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
    remoteCard.innerHTML = '<h3>РЈРґР°Р»РµРЅРЅР°СЏ РїРѕРјРѕС‰СЊ</h3><div id="deskRemotePanel" class="history"><div class="empty" style="padding:0">Р’С‹Р±РµСЂРёС‚Рµ С‚РёРєРµС‚, С‡С‚РѕР±С‹ Р·Р°РїСЂРѕСЃРёС‚СЊ РёР»Рё Р·Р°РїСѓСЃС‚РёС‚СЊ СѓРґР°Р»РµРЅРЅСѓСЋ РїРѕРјРѕС‰СЊ.</div></div>';
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

  async function ensureRemoteSupportReady(options) {
    var settings = options || {};
    if (!hasDesktopBridge() || canManageRemoteDesk() || !state.selectedTicketId || !state.selectedTicket) return;
    var runtime = remoteRuntime();
    if (!runtime || !runtime.enabled) return;
    if (state.desktopRemote.busy) return;

    var ticketId = state.selectedTicketId;
    var remoteOptions = remoteOptionsForTicket(state.selectedTicket);
    try {
      var lastPreparedAt = Number(state.remotePreparedTickets[ticketId] || 0);
      var preparedRecently = lastPreparedAt && (Date.now() - lastPreparedAt) < 300000;
      var shouldPrepareRuntime = !!settings.force || !!settings.createSession || (!state.desktopRemote.installed && !preparedRecently) || !state.remotePreparedTickets[ticketId];
      if (shouldPrepareRuntime) {
        await DESK_BRIDGE.installRustDesk(remoteOptions);
      }
      await refreshDesktopRemoteState();
      await syncCurrentDeviceInfo(remoteOptions.password);
      state.remotePreparedTickets[ticketId] = Date.now();
      await fetchTickets();
      await selectTicket(ticketId, true);

      if (settings.createSession && !latestRemoteSession()) {
        var systemInfo = await getDesktopSystemInfo();
        var localClientId = state.desktopRemote && state.desktopRemote.clientId ? state.desktopRemote.clientId : null;
        var sessionPayload = {
          accessMode: 'interactive',
          deviceLabel: 'Р Р°Р±РѕС‡РµРµ РјРµСЃС‚Рѕ РєР»РёРµРЅС‚Р°',
          remoteClientId: localClientId || '',
          remotePassword: remoteOptions.password
        };
        if (systemInfo && systemInfo.deviceName) sessionPayload.deviceName = systemInfo.deviceName;
        if (systemInfo && systemInfo.localIp) sessionPayload.localIp = systemInfo.localIp;
        if (systemInfo && systemInfo.publicIp) sessionPayload.publicIp = systemInfo.publicIp;
        if (systemInfo && systemInfo.gatewayIp) sessionPayload.gatewayIp = systemInfo.gatewayIp;
        await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions', {
          method: 'POST',
          body: JSON.stringify(sessionPayload)
        });
        await fetchTickets();
        await selectTicket(ticketId, true);
      }
    } catch (error) {
      if (!settings.background) throw error;
    }
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
    var runtime = remoteRuntime();
    var canManage = canManageRemoteDesk();
    var parts = [];

    if (runtime && runtime.enabled) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>РЎРµСЂРІРµСЂ РїРѕРґРєР»СЋС‡РµРЅРёСЏ</strong>' +
          '<div class="remote-row"><span>РҐРѕСЃС‚</span><span>' + escapeHtml(runtime.server_host || 'РЅРµ Р·Р°РґР°РЅ') + '</span></div>' +
          '<div class="remote-note">' + escapeHtml(canManage
            ? 'РўРёРєРµС‚ СѓР¶Рµ СЃС‡РёС‚Р°РµС‚СЃСЏ Р·Р°РїСЂРѕСЃРѕРј РїРѕРјРѕС‰Рё. Р”Р»СЏ РїРѕРґРєР»СЋС‡РµРЅРёСЏ РёСЃРїРѕР»СЊР·СѓР№С‚Рµ ID Рё РїР°СЂРѕР»СЊ РєР»РёРµРЅС‚Р° РЅРёР¶Рµ.'
            : (state.desktopRemote.installed
              ? 'РњРѕРґСѓР»СЊ СѓРґР°Р»РµРЅРЅРѕР№ РїРѕРјРѕС‰Рё РіРѕС‚РѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІ С„РѕРЅРµ.'
              : 'РњРѕРґСѓР»СЊ СѓРґР°Р»РµРЅРЅРѕР№ РїРѕРјРѕС‰Рё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРѕРґРіРѕС‚Р°РІР»РёРІР°РµС‚СЃСЏ РїРѕСЃР»Рµ РІС…РѕРґР° Рё СЃРѕР·РґР°РЅРёСЏ С‚РёРєРµС‚Р°.')) + '</div>' +
        '</div>'
      );
    }

    if (device && canManage) {
      var deviceRows = [
        '<div class="remote-row"><span>ID</span><span>' + escapeHtml(device.remote_client_id || 'РµС‰Рµ РЅРµ РїРµСЂРµРґР°РЅ') + '</span></div>',
        '<div class="remote-row"><span>РџР°СЂРѕР»СЊ</span><span>' + escapeHtml(device.remote_password || 'РµС‰Рµ РЅРµ Р·Р°РґР°РЅ') + '</span></div>',
        '<div class="remote-row"><span>Р”РѕСЃС‚СѓРї</span><span>' + escapeHtml(device.unattended_enabled ? 'РїРѕСЃС‚РѕСЏРЅРЅС‹Р№' : 'РїРѕ Р·Р°РїСЂРѕСЃСѓ') + '</span></div>'
      ];
      deviceRows.push(
        '<div class="remote-inline-actions">' +
          (device.remote_client_id ? '<button class="btn btn-ghost" type="button" data-remote-action="copy-device-id">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ ID</button>' : '') +
          (device.remote_password ? '<button class="btn btn-ghost" type="button" data-remote-action="copy-device-password">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїР°СЂРѕР»СЊ</button>' : '') +
        '</div>'
      );
      parts.push(
        '<div class="remote-card">' +
          '<strong>' + escapeHtml(device.label || 'РЈСЃС‚СЂРѕР№СЃС‚РІРѕ РєР»РёРµРЅС‚Р°') + '</strong>' +
          deviceRows.join('') +
        '</div>'
      );
      if (device.device_name || device.local_ip || device.public_ip || device.gateway_ip) {
        parts.push(
          '<div class="remote-card">' +
            '<strong>Р”Р°РЅРЅС‹Рµ РџРљ РєР»РёРµРЅС‚Р°</strong>' +
            '<div class="remote-row"><span>РРјСЏ РџРљ</span><span>' + escapeHtml(device.device_name || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅРѕ') + '</span></div>' +
            '<div class="remote-row"><span>IP Р»РѕРєР°Р»СЊРЅС‹Р№</span><span>' + escapeHtml(device.local_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
            '<div class="remote-row"><span>IP РІРЅРµС€РЅРёР№</span><span>' + escapeHtml(device.public_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
            '<div class="remote-row"><span>РЁР»СЋР·</span><span>' + escapeHtml(device.gateway_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
          '</div>'
        );
      }
    } else if (device) {
      parts.push('<div class="remote-card"><strong>РЈРґР°Р»РµРЅРЅР°СЏ РїРѕРјРѕС‰СЊ</strong><div class="remote-note">Р”Р°РЅРЅС‹Рµ СЌС‚РѕРіРѕ СѓСЃС‚СЂРѕР№СЃС‚РІР° СѓР¶Рµ РїРµСЂРµРґР°РЅС‹ РёРЅР¶РµРЅРµСЂСѓ. РџРѕРґРєР»СЋС‡РµРЅРёРµ РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ СЃРѕ СЃС‚РѕСЂРѕРЅС‹ РїРѕРґРґРµСЂР¶РєРё.</div></div>');
    } else {
      parts.push('<div class="remote-card"><strong>РЎРµСЃСЃРёР№ РїРѕРєР° РЅРµС‚</strong><div class="remote-note">РџРѕСЃР»Рµ СЃРѕР·РґР°РЅРёСЏ С‚РёРєРµС‚Р° РєР»РёРµРЅС‚СЃРєРёР№ РјРѕРґСѓР»СЊ РіРѕС‚РѕРІРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.</div></div>');
    }

    if (session) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>РџРѕСЃР»РµРґРЅСЏСЏ СЃРµСЃСЃРёСЏ</strong>' +
          '<div class="remote-row"><span>Р РµР¶РёРј</span><span>' + escapeHtml(session.access_mode === 'unattended' ? 'РїРѕСЃС‚РѕСЏРЅРЅС‹Р№' : 'СЂР°Р·РѕРІС‹Р№') + '</span></div>' +
          '<div class="remote-row"><span>РЎС‚Р°С‚СѓСЃ</span><span>' + escapeHtml(remoteSessionStatusLabel(session.status)) + '</span></div>' +
          '<div class="remote-row"><span>РљРѕРґ</span><span>' + escapeHtml(session.join_code || '?') + '</span></div>' +
          '<div class="remote-row"><span>РРЅР¶РµРЅРµСЂ</span><span>' + escapeHtml(session.engineer_name || 'РЅРµ РЅР°Р·РЅР°С‡РµРЅ') + '</span></div>' +
        '</div>'
      );
    }

    var buttons = [];
    if (canManage && device && device.remote_client_id) {
      buttons.push('<button class="btn btn-primary" type="button" data-remote-action="connect">РџРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ</button>');
    }

    parts.push('<div class="remote-actions">' + buttons.join('') + '</div>');
    panel.innerHTML = parts.join('');
    Array.prototype.forEach.call(panel.querySelectorAll('[data-remote-action]'), function (button) {
      button.addEventListener('click', function () {
        handleRemoteAction(button.getAttribute('data-remote-action'));
      });
    });
    return;

    if (runtime && runtime.enabled) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>РЎРµСЂРІРµСЂ РїРѕРґРєР»СЋС‡РµРЅРёСЏ</strong>' +
          '<div class="remote-row"><span>РҐРѕСЃС‚</span><span>' + escapeHtml(runtime.server_host || 'РЅРµ Р·Р°РґР°РЅ') + '</span></div>' +
          '<div class="remote-row"><span>РљР»СЋС‡</span><span>' + escapeHtml(runtime.server_key ? (String(runtime.server_key).slice(0, 14) + '...') : 'РЅРµ Р·Р°РґР°РЅ') + '</span></div>' +
          '<div class="remote-note">' + escapeHtml(state.desktopRemote.installed
            ? (state.desktopRemote.clientId
              ? 'РњРѕРґСѓР»СЊ СѓРґР°Р»РµРЅРЅРѕР№ РїРѕРјРѕС‰Рё РіРѕС‚РѕРІ. ID СЌС‚РѕРіРѕ РџРљ: ' + state.desktopRemote.clientId
              : 'РњРѕРґСѓР»СЊ СѓРґР°Р»РµРЅРЅРѕР№ РїРѕРјРѕС‰Рё Р·Р°РіСЂСѓР¶РµРЅ, РЅРѕ ID РїРѕРєР° РЅРµ РїСЂРѕС‡РёС‚Р°РЅ. РќР°Р¶РјРёС‚Рµ В«РћС‚РєСЂС‹С‚СЊ РјРѕРґСѓР»СЊВ».')
            : 'Р”Р»СЏ СѓРґР°Р»РµРЅРЅРѕР№ РїРѕРјРѕС‰Рё РЅСѓР¶РµРЅ РІСЃС‚СЂРѕРµРЅРЅС‹Р№ РјРѕРґСѓР»СЊ. Р•РіРѕ РјРѕР¶РЅРѕ Р·Р°РіСЂСѓР·РёС‚СЊ Рё РѕС‚РєСЂС‹С‚СЊ РїСЂСЏРјРѕ РёР· РєР»РёРµРЅС‚Р°.') + '</div>' +
        '</div>'
      );
    }

    if (device) {
      parts.push(
        '<div class="remote-card">' +
          '<strong>' + escapeHtml(device.label || '\u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0430') + '</strong>' +
          '<div class="remote-row"><span>ID</span><span>' + escapeHtml(device.remote_client_id || '\u0435\u0449\u0435 \u043d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u043d') + '</span></div>' +
          '<div class="remote-row"><span>\u0414\u043e\u0441\u0442\u0443\u043f</span><span>' + escapeHtml(device.unattended_enabled ? '\u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u044b\u0439' : '\u043f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443') + '</span></div>' +
        '</div>'
      );
      if (canManage && (device.device_name || device.local_ip || device.public_ip || device.gateway_ip)) {
        parts.push(
          '<div class="remote-card">' +
            '<strong>Р”Р°РЅРЅС‹Рµ РџРљ РєР»РёРµРЅС‚Р°</strong>' +
            '<div class="remote-row"><span>РРјСЏ РџРљ</span><span>' + escapeHtml(device.device_name || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅРѕ') + '</span></div>' +
            '<div class="remote-row"><span>IP Р»РѕРєР°Р»СЊРЅС‹Р№</span><span>' + escapeHtml(device.local_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
            '<div class="remote-row"><span>IP РІРЅРµС€РЅРёР№</span><span>' + escapeHtml(device.public_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
            '<div class="remote-row"><span>РЁР»СЋР·</span><span>' + escapeHtml(device.gateway_ip || 'РЅРµ РѕРїСЂРµРґРµР»РµРЅ') + '</span></div>' +
          '</div>'
        );
      }
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
      if (runtime && runtime.enabled && hasDesktopBridge()) {
        buttons.push('<button class="btn btn-secondary" type="button" data-remote-action="launch-rustdesk">' + (state.desktopRemote.installed ? 'РћС‚РєСЂС‹С‚СЊ РјРѕРґСѓР»СЊ' : 'РџРѕРґРіРѕС‚РѕРІРёС‚СЊ РјРѕРґСѓР»СЊ') + '</button>');
        buttons.push('<button class="btn btn-ghost" type="button" data-remote-action="copy-host">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ С…РѕСЃС‚</button>');
        if (runtime.server_key) buttons.push('<button class="btn btn-ghost" type="button" data-remote-action="copy-key">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РєР»СЋС‡</button>');
        if (device && device.remote_client_id) buttons.push('<button class="btn btn-ghost" type="button" data-remote-action="copy-device-id">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ ID РџРљ</button>');
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
      title.textContent = 'Р–РёРІС‹Рµ С‡Р°С‚С‹';
      if (sub) sub.textContent = 'РћС‡РµСЂРµРґСЊ РѕР±СЂР°С‰РµРЅРёР№ СЃ СЃР°Р№С‚Р° РґР»СЏ superuser Рё РїРѕРґРґРµСЂР¶РєРё: РЅРѕРІС‹Рµ РґРёР°Р»РѕРіРё, РѕС‚РІРµС‚С‹ Рё Р±С‹СЃС‚СЂС‹Р№ РїРµСЂРµС…РѕРґ РІ Р·Р°РґР°С‡Сѓ.';
    } else {
      title.textContent = hasPermission('ticket.view.all') || (state.user && state.user.isGlobalAdmin) ? 'Р’СЃРµ С‚РёРєРµС‚С‹' : 'РњРѕРё С‚РёРєРµС‚С‹';
      if (sub) sub.textContent = 'Р›РµРіРєРёР№ СЂР°Р±РѕС‡РёР№ СЂРµР¶РёРј: СЃРїРёСЃРѕРє Р·Р°СЏРІРѕРє, РїРµСЂРµРїРёСЃРєР° РїРѕ Р·Р°РґР°С‡Рµ Рё Р±С‹СЃС‚СЂС‹Рµ РѕР±РЅРѕРІР»РµРЅРёСЏ Р±РµР· РїРѕР»РЅРѕРіРѕ РїРѕСЂС‚Р°Р»Р°.';
    }
  }

  function renderTicketList() {
    var container = $('deskTicketList');
    if (!state.filteredTickets.length) {
      container.innerHTML = '<div class="empty">РџРѕРєР° РЅРµС‚ С‚РёРєРµС‚РѕРІ. РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ Р·Р°СЏРІРєСѓ Рё РІРµРґРёС‚Рµ РґРёР°Р»РѕРі РїРѕ Р·Р°РґР°С‡Рµ РєР°Рє РІ С‡Р°С‚Рµ.</div>';
      return;
    }
    container.innerHTML = state.filteredTickets.map(function (ticket) {
      var unreadCount = Number(state.unreadTickets[ticket.id] || 0);
      return '<div class="ticket-card' + (ticket.id === state.selectedTicketId ? ' active' : '') + (unreadCount ? ' unread' : '') + '" data-ticket-id="' + escapeHtml(ticket.id) + '">' +
        '<div class="ticket-top"><div class="ticket-top-main">' + (unreadCount ? '<span class="ticket-unread-dot"></span>' : '') + '<div class="ticket-no">#' + escapeHtml(ticket.number) + '</div></div><div style="display:flex;align-items:center;gap:6px">' + (unreadCount ? '<div class="ticket-unread-badge">' + escapeHtml(unreadCount) + '</div>' : '') + '<div class="pill ' + escapeHtml(ticket.status) + '">' + escapeHtml(statusLabel(ticket.status)) + '</div></div></div>' +
        '<div class="ticket-subject">' + escapeHtml(ticket.subject) + '</div>' +
        (showCompanyContext() ? '<div class="ticket-no" style="margin-top:6px">' + escapeHtml(ticket.company_name || 'Р‘РµР· РєРѕРјРїР°РЅРёРё') + (ticket.created_by_name ? ' вЂў ' + escapeHtml(ticket.created_by_name) : '') + '</div>' : '') +
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
      container.innerHTML = '<div class="empty">РЎРµР№С‡Р°СЃ РЅРµС‚ Р°РєС‚РёРІРЅС‹С… Р¶РёРІС‹С… С‡Р°С‚РѕРІ. РќРѕРІС‹Рµ РѕР±СЂР°С‰РµРЅРёСЏ СЃ СЃР°Р№С‚Р° РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.</div>';
      return;
    }
    container.innerHTML = state.filteredConversations.map(function (conversation) {
      var unreadCount = Number(state.unreadConversations[conversation.id] || 0);
      return '<div class="ticket-card' + (conversation.id === state.selectedConversationId ? ' active' : '') + (unreadCount ? ' unread' : '') + '" data-conversation-id="' + escapeHtml(conversation.id) + '">' +
        '<div class="ticket-top"><div class="ticket-top-main">' + (unreadCount ? '<span class="ticket-unread-dot"></span>' : '') + '<div class="ticket-no">' + escapeHtml(conversationStatusLabel(conversation.status)) + '</div></div><div style="display:flex;align-items:center;gap:6px">' + (unreadCount ? '<div class="ticket-unread-badge">' + escapeHtml(unreadCount) + '</div>' : '') + '<div class="pill ' + escapeHtml(conversation.status === 'closed' ? 'closed' : conversation.status === 'new' ? 'high' : 'progress') + '">' + escapeHtml(relativeDate(conversation.lastMessageAt || conversation.updatedAt)) + '</div></div></div>' +
        '<div class="ticket-subject">' + escapeHtml(conversation.visitorName || 'РџРѕСЃРµС‚РёС‚РµР»СЊ') + '</div>' +
        '<div class="ticket-no" style="margin-top:6px">' + escapeHtml(conversation.assignedUserName || 'Р‘РµР· РёСЃРїРѕР»РЅРёС‚РµР»СЏ') + (conversation.ticketId ? ' вЂў С‚РёРєРµС‚ СЃРІСЏР·Р°РЅ' : '') + '</div>' +
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
      $('deskThreadTitle').textContent = 'Р’С‹Р±РµСЂРёС‚Рµ С‚РёРєРµС‚';
      $('deskThreadMeta').textContent = 'РћС‚РєСЂРѕР№С‚Рµ Р·Р°СЏРІРєСѓ СЃР»РµРІР° РёР»Рё СЃРѕР·РґР°Р№С‚Рµ РЅРѕРІСѓСЋ.';
      stream.innerHTML = '<div class="empty">Р—РґРµСЃСЊ РїРѕСЏРІРёС‚СЃСЏ РїРµСЂРµРїРёСЃРєР° РїРѕ РІС‹Р±СЂР°РЅРЅРѕРјСѓ С‚РёРєРµС‚Сѓ. РљР»РёРµРЅС‚ РІРёРґРёС‚ С‚РѕР»СЊРєРѕ СЃРІРѕРё РґРѕСЃС‚СѓРїРЅС‹Рµ С‚РёРєРµС‚С‹, Р° РїРѕРґРґРµСЂР¶РєР° Рё superuser вЂ” РѕР±С‰СѓСЋ РѕС‡РµСЂРµРґСЊ.</div>';
      facts.innerHTML = '<div class="kv-row"><span>РЎС‚Р°С‚СѓСЃ</span><span>вЂ”</span></div><div class="kv-row"><span>РџСЂРёРѕСЂРёС‚РµС‚</span><span>вЂ”</span></div><div class="kv-row"><span>РСЃРїРѕР»РЅРёС‚РµР»СЊ</span><span>вЂ”</span></div><div class="kv-row"><span>РЎРѕР·РґР°РЅ</span><span>вЂ”</span></div><div class="kv-row"><span>РћР±РЅРѕРІР»РµРЅ</span><span>вЂ”</span></div>';
      history.innerHTML = '<div class="empty" style="padding:0">РСЃС‚РѕСЂРёСЏ РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РІС‹Р±РѕСЂР° С‚РёРєРµС‚Р°.</div>';
      composer.disabled = true;
      sendBtn.disabled = true;
      syncQuickStatusPanel();
      renderRemotePanel();
      return;
    }
    var ticket = state.selectedTicket;
      $('deskThreadTitle').textContent = '#' + ticket.number + ' вЂў ' + ticket.subject;
      $('deskThreadMeta').textContent = 'РЎС‚Р°С‚СѓСЃ: ' + statusLabel(ticket.status) + ' вЂў РџСЂРёРѕСЂРёС‚РµС‚: ' + priorityLabel(ticket.priority);
      stream.innerHTML = (ticket.messages || []).map(function (message) {
        if (message.message_type === 'system' || message.message_type === 'internal_note') {
          var systemAuthor = message.author_name || 'РЎРёСЃС‚РµРјР°';
          return '<div class="message-row system"><div class="system-event"><div class="system-event-meta"><span>' + escapeHtml(systemAuthor) + ' вЂў ' + escapeHtml(formatDate(message.created_at)) + '</span></div><div class="system-event-body">' + escapeHtml(message.body) + '</div></div></div>';
        }
        var kind = messageBelongsToViewerSide(message) ? 'me' : 'other';
        var author = message.author_name || (kind === 'me' ? 'Р’С‹' : 'РџРѕРґРґРµСЂР¶РєР°');
        return '<div class="message-row ' + kind + '"><div class="bubble ' + kind + '"><div class="bubble-meta"><span>' + escapeHtml(author) + '</span><span>' + escapeHtml(formatDate(message.created_at)) + '</span></div><div>' + escapeHtml(message.body) + '</div></div></div>';
      }).join('') || '<div class="empty">Р’ СЌС‚РѕРј С‚РёРєРµС‚Рµ РїРѕРєР° РЅРµС‚ СЃРѕРѕР±С‰РµРЅРёР№.</div>';
    stream.scrollTop = stream.scrollHeight;
    facts.innerHTML =
      '<div class="kv-row"><span>РЎС‚Р°С‚СѓСЃ</span><span><span class="pill ' + escapeHtml(ticket.status) + '">' + escapeHtml(statusLabel(ticket.status)) + '</span></span></div>' +
      '<div class="kv-row"><span>РџСЂРёРѕСЂРёС‚РµС‚</span><span><span class="pill ' + escapeHtml(ticket.priority) + '">' + escapeHtml(priorityLabel(ticket.priority)) + '</span></span></div>' +
      '<div class="kv-row"><span>РСЃРїРѕР»РЅРёС‚РµР»СЊ</span><span>' + escapeHtml(ticket.assignee_name || 'РќРµ РЅР°Р·РЅР°С‡РµРЅ') + '</span></div>' +
      '<div class="kv-row"><span>РЎРѕР·РґР°РЅ</span><span>' + escapeHtml(formatDate(ticket.created_at)) + '</span></div>' +
      '<div class="kv-row"><span>РћР±РЅРѕРІР»РµРЅ</span><span>' + escapeHtml(relativeDate(ticket.updated_at)) + '</span></div>';
    history.innerHTML = (ticket.history || []).length ? ticket.history.slice(0, 8).map(function (item) {
      return '<div class="history-item"><strong>' + escapeHtml(formatDate(item.created_at)) + '</strong><div>' + escapeHtml(item.body) + '</div></div>';
    }).join('') : '<div class="empty" style="padding:0">РСЃС‚РѕСЂРёСЏ РїРѕ С‚РёРєРµС‚Сѓ РїРѕРєР° РїСѓСЃС‚Р°.</div>';
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
      $('deskThreadTitle').textContent = 'Р’С‹Р±РµСЂРёС‚Рµ С‡Р°С‚';
      $('deskThreadMeta').textContent = 'РћС‚РєСЂРѕР№С‚Рµ РґРёР°Р»РѕРі СЃР»РµРІР°, С‡С‚РѕР±С‹ РѕС‚РІРµС‚РёС‚СЊ РїРѕСЃРµС‚РёС‚РµР»СЋ.';
      stream.innerHTML = '<div class="empty">Р—РґРµСЃСЊ РїРѕСЏРІРёС‚СЃСЏ РїРµСЂРµРїРёСЃРєР° РїРѕ Р¶РёРІРѕРјСѓ С‡Р°С‚Сѓ СЃ СЃР°Р№С‚Р°.</div>';
      facts.innerHTML = '<div class="kv-row"><span>РЎС‚Р°С‚СѓСЃ</span><span>вЂ”</span></div><div class="kv-row"><span>РџРѕСЃРµС‚РёС‚РµР»СЊ</span><span>вЂ”</span></div><div class="kv-row"><span>РСЃРїРѕР»РЅРёС‚РµР»СЊ</span><span>вЂ”</span></div><div class="kv-row"><span>РЎРІСЏР·Р°РЅРЅС‹Р№ С‚РёРєРµС‚</span><span>вЂ”</span></div><div class="kv-row"><span>РћР±РЅРѕРІР»РµРЅ</span><span>вЂ”</span></div>';
      history.innerHTML = '<div class="empty" style="padding:0">РСЃС‚РѕСЂРёСЏ РґРёР°Р»РѕРіР° РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РІС‹Р±РѕСЂР° С‡Р°С‚Р°.</div>';
      composer.disabled = true;
      sendBtn.disabled = true;
      syncQuickStatusPanel();
      renderRemotePanel();
      return;
    }
    var conversation = state.selectedConversation;
    $('deskThreadTitle').textContent = conversation.visitorName || 'РџРѕСЃРµС‚РёС‚РµР»СЊ СЃР°Р№С‚Р°';
    $('deskThreadMeta').textContent = 'РЎС‚Р°С‚СѓСЃ: ' + conversationStatusLabel(conversation.status) + (conversation.ticketId ? ' вЂў СЃРІСЏР·Р°РЅ СЃ С‚РёРєРµС‚РѕРј' : '');
    stream.innerHTML = (conversation.messages || []).map(function (message) {
      var kind = message.authorType === 'operator' ? 'me' : 'other';
      var author = message.authorName || (message.authorType === 'operator' ? 'РџРѕРґРґРµСЂР¶РєР°' : 'РџРѕСЃРµС‚РёС‚РµР»СЊ');
      return '<div class="message-row ' + kind + '"><div class="bubble ' + kind + '"><div class="bubble-meta"><span>' + escapeHtml(author) + '</span><span>' + escapeHtml(formatDate(message.createdAt)) + '</span></div><div>' + escapeHtml(message.body) + '</div></div></div>';
    }).join('') || '<div class="empty">Р’ СЌС‚РѕРј С‡Р°С‚Рµ РїРѕРєР° РЅРµС‚ СЃРѕРѕР±С‰РµРЅРёР№.</div>';
    stream.scrollTop = stream.scrollHeight;
    facts.innerHTML =
      '<div class="kv-row"><span>РЎС‚Р°С‚СѓСЃ</span><span><span class="pill ' + escapeHtml(conversation.status === 'closed' ? 'closed' : conversation.status === 'new' ? 'high' : 'progress') + '">' + escapeHtml(conversationStatusLabel(conversation.status)) + '</span></span></div>' +
      '<div class="kv-row"><span>РџРѕСЃРµС‚РёС‚РµР»СЊ</span><span>' + escapeHtml(conversation.visitorName || 'вЂ”') + '</span></div>' +
      '<div class="kv-row"><span>РСЃРїРѕР»РЅРёС‚РµР»СЊ</span><span>' + escapeHtml(conversation.assignedUserName || 'РќРµ РЅР°Р·РЅР°С‡РµРЅ') + '</span></div>' +
      '<div class="kv-row"><span>РЎРІСЏР·Р°РЅРЅС‹Р№ С‚РёРєРµС‚</span><span>' + escapeHtml(conversation.ticketId || 'РќРµС‚') + '</span></div>' +
      '<div class="kv-row"><span>РћР±РЅРѕРІР»РµРЅ</span><span>' + escapeHtml(relativeDate(conversation.updatedAt)) + '</span></div>';
    history.innerHTML = (conversation.messages || []).length ? conversation.messages.slice(-8).reverse().map(function (message) {
      return '<div class="history-item"><strong>' + escapeHtml(formatDate(message.createdAt)) + '</strong><div>' + escapeHtml((message.authorName || 'РЈС‡Р°СЃС‚РЅРёРє') + ': ' + message.body) + '</div></div>';
    }).join('') : '<div class="empty" style="padding:0">РСЃС‚РѕСЂРёСЏ РїРѕ С‡Р°С‚Сѓ РїРѕРєР° РїСѓСЃС‚Р°.</div>';
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
    var sortMode = $('deskSortFilter') ? $('deskSortFilter').value || 'unread' : 'unread';
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
      state.filteredConversations.sort(function (a, b) {
        var unreadDiff = Number(state.unreadConversations[b.id] || 0) - Number(state.unreadConversations[a.id] || 0);
        if (sortMode === 'unread' && unreadDiff !== 0) return unreadDiff;
        return new Date(b.lastMessageAt || b.updatedAt || 0).getTime() - new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
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
    state.filteredTickets.sort(function (a, b) {
      var unreadDiff = Number(state.unreadTickets[b.id] || 0) - Number(state.unreadTickets[a.id] || 0);
      if (sortMode === 'unread' && unreadDiff !== 0) return unreadDiff;
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
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
      select.innerHTML = '<option value="">Р’СЃРµ РєРѕРјРїР°РЅРёРё</option>';
      refreshCustomSelect(select);
      return;
    }
    var current = select.value;
    var companies = Array.from(new Set(state.tickets.map(function (ticket) { return ticket.company_name || 'Р‘РµР· РєРѕРјРїР°РЅРёРё'; }))).sort();
    select.innerHTML = '<option value="">Р’СЃРµ РєРѕРјРїР°РЅРёРё</option>' + companies.map(function (company) {
      return '<option value="' + escapeHtml(company) + '">' + escapeHtml(company) + '</option>';
    }).join('');
    if (companies.indexOf(current) >= 0) select.value = current;
    select.classList.remove('hidden');
    refreshCustomSelect(select);
  }

  async function fetchTickets() {
    var previous = {};
    state.tickets.forEach(function (ticket) {
      previous[ticket.id] = ticketMessageSignature(ticket);
    });
    var data = await api('/api/tickets');
    state.tickets = data.tickets || [];
    state.tickets.forEach(function (ticket) {
      var signature = ticketMessageSignature(ticket);
      var prevSignature = previous[ticket.id] || state.lastTicketSignatures[ticket.id];
      var lastMessage = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1] : null;
      var fromOtherSide = lastMessage && !messageBelongsToViewerSide(lastMessage);
      var selectedNow = state.mode === 'tickets' && String(state.selectedTicketId || '') === String(ticket.id || '');
      if (prevSignature && prevSignature !== signature && fromOtherSide && !selectedNow) {
        state.unreadTickets[ticket.id] = Number(state.unreadTickets[ticket.id] || 0) + 1;
        notifyDesk('РќРѕРІС‹Р№ РѕС‚РІРµС‚ РїРѕ С‚РёРєРµС‚Сѓ #' + ticket.number, (ticket.subject || '').slice(0, 120));
      }
      state.lastTicketSignatures[ticket.id] = signature;
    });
    updateUnreadIndicator();
    syncCompanyFilter();
    renderList();
    if (state.selectedTicketId && state.mode === 'tickets') await selectTicket(state.selectedTicketId, true);
  }

  async function fetchConversations() {
    if (!hasLiveChatAccess()) return;
    var previous = {};
    state.conversations.forEach(function (conversation) {
      previous[conversation.id] = conversationMessageSignature(conversation);
    });
    var data = await api('/api/live-chat/conversations');
    state.conversations = data.conversations || [];
    state.conversations.forEach(function (conversation) {
      var signature = conversationMessageSignature(conversation);
      var prevSignature = previous[conversation.id] || state.lastConversationSignatures[conversation.id];
      var selectedNow = state.mode === 'livechat' && String(state.selectedConversationId || '') === String(conversation.id || '');
      if (prevSignature && prevSignature !== signature && !selectedNow) {
        state.unreadConversations[conversation.id] = Number(state.unreadConversations[conversation.id] || 0) + 1;
        notifyDesk('РќРѕРІС‹Р№ С‡Р°С‚ СЃР°Р№С‚Р°', ((conversation.visitorName || 'РџРѕСЃРµС‚РёС‚РµР»СЊ') + ': ' + (conversation.lastMessagePreview || '')).slice(0, 140));
      }
      state.lastConversationSignatures[conversation.id] = signature;
    });
    updateUnreadIndicator();
    renderList();
    if (state.selectedConversationId && state.mode === 'livechat') await selectConversation(state.selectedConversationId, true);
  }

  async function selectTicket(ticketId, silent) {
    state.selectedTicketId = ticketId;
    renderList();
    try {
      var data = await api('/api/tickets/' + encodeURIComponent(ticketId));
      state.selectedTicket = data.ticket;
      state.selectedTicketUnreadCount = Number(state.unreadTickets[ticketId] || 0);
      markTicketRead(ticketId);
      renderSelectedTicket();
      if (!canManageRemoteDesk()) ensureRemoteSupportReady({ createSession: false, background: true });
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
      state.selectedConversationUnreadCount = Number(state.unreadConversations[conversationId] || 0);
      markConversationRead(conversationId);
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
    if (!email || !password) return showError('deskAuthError', 'Р’РІРµРґРёС‚Рµ email Рё РїР°СЂРѕР»СЊ.');
    try {
      var data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password }),
        headers: { 'Content-Type': 'application/json' }
        });
        state.token = data.token;
        state.user = normalizeUser(data.user, state.user);
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
    if (subject.length < 3 || description.length < 3) return showError('deskModalError', 'Р—Р°РїРѕР»РЅРёС‚Рµ С‚РµРјСѓ Рё РїРµСЂРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ.');
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
      await ensureRemoteSupportReady({ createSession: true });
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
      var runtime = remoteRuntime();
      var currentDevice = latestRemoteDevice();
      var currentSession = latestRemoteSession();
      var localClientId = state.desktopRemote && state.desktopRemote.clientId ? state.desktopRemote.clientId : null;

      if (action === 'connect') {
        if (!currentDevice || !currentDevice.remote_client_id) {
          throw new Error('Не найден ID клиента для удаленного подключения.');
        }
        if (!hasDesktopBridge() || !DESK_BRIDGE.launchRustDesk) {
          throw new Error('Модуль удаленной помощи недоступен в текущем приложении.');
        }

        if (!currentSession) {
          var systemInfo = await getDesktopSystemInfo();
          var createPayload = {
            accessMode: 'interactive',
            deviceLabel: currentDevice.label || 'Рабочее место клиента',
            remoteClientId: currentDevice.remote_client_id || localClientId || '',
            remotePassword: currentDevice.remote_password || ticketRemotePassword(state.selectedTicket)
          };
          if (systemInfo && systemInfo.deviceName) createPayload.deviceName = systemInfo.deviceName;
          if (systemInfo && systemInfo.localIp) createPayload.localIp = systemInfo.localIp;
          if (systemInfo && systemInfo.publicIp) createPayload.publicIp = systemInfo.publicIp;
          if (systemInfo && systemInfo.gatewayIp) createPayload.gatewayIp = systemInfo.gatewayIp;

          await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions', {
            method: 'POST',
            body: JSON.stringify(createPayload)
          });

          await fetchTickets();
          await selectTicket(state.selectedTicketId, true);
          currentSession = latestRemoteSession();
          currentDevice = latestRemoteDevice();
        }

        if (currentSession) {
          await api('/api/tickets/' + encodeURIComponent(state.selectedTicketId) + '/remote-sessions/' + encodeURIComponent(currentSession.id), {
            method: 'PATCH',
            body: JSON.stringify({ status: 'active' })
          });
        }

        var launchResult = await DESK_BRIDGE.launchRustDesk({
          host: runtime && runtime.server_host,
          key: runtime && runtime.server_key,
          configString: runtime && runtime.server_config,
          password: currentDevice && currentDevice.remote_password ? currentDevice.remote_password : ticketRemotePassword(state.selectedTicket),
          peerId: currentDevice && currentDevice.remote_client_id ? currentDevice.remote_client_id : ''
        });

        if (!launchResult || launchResult.launched !== true) {
          var launchError = launchResult && launchResult.error ? launchResult.error : launchResult;
          throw new Error(formatDeskError(launchError, 'Не удалось запустить модуль удаленной помощи.'));
        }
      } else if (action === 'copy-device-id') {
        if (currentDevice && currentDevice.remote_client_id) await copyDeskText(currentDevice.remote_client_id);
      } else if (action === 'copy-device-password') {
        if (currentDevice && currentDevice.remote_password) await copyDeskText(currentDevice.remote_password);
      }

      await fetchTickets();
      await selectTicket(state.selectedTicketId, true);
    } catch (error) {
      var message = formatDeskError(error, 'Не удалось выполнить действие удаленной помощи.');
      if (!message || message === '{}' || message === '[object Object]') {
        message = 'Не удалось запустить модуль удаленной помощи. Закройте RustDesk и повторите попытку.';
      }
      alert(String(message));
    }
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
    $('deskSortFilter').addEventListener('change', function () {
      renderList();
    });
    $('deskCompanyFilter').addEventListener('change', function () {
      renderList();
    });
    $('deskQuickStatus').addEventListener('change', function () {
      updateSelectedTicketStatus();
    });
    $('deskRefreshBtn').addEventListener('click', async function () {
      await refreshCurrentUser();
      await refreshDesktopRemoteState();
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

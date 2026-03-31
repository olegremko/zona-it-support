const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zonaDeskEnv', {
  platform: 'windows-electron'
});

contextBridge.exposeInMainWorld('zonaDeskBridge', {
  getRustDeskStatus: function () {
    return ipcRenderer.invoke('rustdesk:status');
  },
  launchRustDesk: function (options) {
    return ipcRenderer.invoke('rustdesk:launch', options || {});
  },
  installRustDesk: function (options) {
    return ipcRenderer.invoke('rustdesk:install', options || {});
  },
  prepareRustDesk: function (options) {
    return ipcRenderer.invoke('rustdesk:prepare', options || {});
  },
  copyText: function (value) {
    return ipcRenderer.invoke('desk:copy', value);
  },
  notify: function (payload) {
    return ipcRenderer.invoke('desk:notify', payload || {});
  },
  setUnreadCount: function (count) {
    return ipcRenderer.invoke('desk:set-unread-count', Number(count || 0));
  },
  getSystemInfo: function () {
    return ipcRenderer.invoke('desk:get-system-info');
  }
});

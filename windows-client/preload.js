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
  copyText: function (value) {
    return ipcRenderer.invoke('desk:copy', value);
  }
});

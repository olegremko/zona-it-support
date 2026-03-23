const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zonaDeskEnv', {
  platform: 'windows-electron'
});

contextBridge.exposeInMainWorld('zonaDeskBridge', {
  getRustDeskStatus: function () {
    return ipcRenderer.invoke('rustdesk:status');
  },
  launchRustDesk: function () {
    return ipcRenderer.invoke('rustdesk:launch');
  },
  installRustDesk: function () {
    return ipcRenderer.invoke('rustdesk:install');
  },
  copyText: function (value) {
    return ipcRenderer.invoke('desk:copy', value);
  }
});

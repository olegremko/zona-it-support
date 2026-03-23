const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('zonaDeskEnv', {
  platform: 'windows-electron'
});

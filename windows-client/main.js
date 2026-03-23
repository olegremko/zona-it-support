const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const DESK_URL = process.env.ZONA_IT_DESK_URL || 'https://i-zone.pro/desk';
app.commandLine.appendSwitch('disable-http-cache');

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: 'Zona IT Desk',
    backgroundColor: '#07111d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  var deskUrl = new URL(DESK_URL);
  deskUrl.searchParams.set('platform', 'windows');
  deskUrl.searchParams.set('appVersion', app.getVersion());
  win.webContents.setUserAgent(win.webContents.userAgent + ' ZonaITDesk/' + app.getVersion());
  win.webContents.session.clearCache().finally(function () {
    win.loadURL(deskUrl.toString());
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

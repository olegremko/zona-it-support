const { app, BrowserWindow, shell, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

const DESK_URL = process.env.ZONA_IT_DESK_URL || 'https://i-zone.pro/desk';
app.commandLine.appendSwitch('disable-http-cache');

function rustDeskCandidates() {
  return [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RustDesk', 'rustdesk.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RustDesk', 'rustdesk.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'RustDesk', 'RustDesk.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'RustDesk', 'rustdesk.exe')
  ];
}

function findRustDesk() {
  return rustDeskCandidates().find(function (candidate) {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || null;
}

function execFileAsync(file, args) {
  return new Promise(function (resolve, reject) {
    execFile(file, args, { windowsHide: true }, function (error, stdout, stderr) {
      if (error) return reject(error);
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function getRustDeskStatus() {
  const executable = findRustDesk();
  if (!executable) {
    return { installed: false, executable: null, clientId: '' };
  }

  let clientId = '';
  try {
    const result = await execFileAsync(executable, ['--get-id']);
    clientId = String(result.stdout || '').trim();
  } catch (error) {
    clientId = '';
  }

  return { installed: true, executable: executable, clientId: clientId };
}

async function launchRustDesk() {
  const executable = findRustDesk();
  if (!executable) {
    await shell.openExternal('https://rustdesk.com/');
    return { launched: false, installed: false, redirectedToDownload: true };
  }

  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return { launched: true, installed: true };
}

async function installRustDesk() {
  const powershell = [
    '$ErrorActionPreference = \"SilentlyContinue\";',
    'if (Get-Command winget -ErrorAction SilentlyContinue) {',
    '  Start-Process winget -ArgumentList \"install\",\"--exact\",\"--id\",\"RustDesk.RustDesk\",\"--accept-package-agreements\",\"--accept-source-agreements\";',
    '} else {',
    '  Start-Process \"https://rustdesk.com/\";',
    '}'
  ].join(' ');

  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', powershell], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return { started: true };
}

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

ipcMain.handle('rustdesk:status', async function () {
  return await getRustDeskStatus();
});

ipcMain.handle('rustdesk:launch', async function () {
  return await launchRustDesk();
});

ipcMain.handle('rustdesk:install', async function () {
  return await installRustDesk();
});

ipcMain.handle('desk:copy', async function (_event, value) {
  clipboard.writeText(String(value || ''));
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

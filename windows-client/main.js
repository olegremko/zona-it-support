const { app, BrowserWindow, shell, ipcMain, clipboard, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');

const APP_MODEL_ID = 'ZonaITDesk';
const DESK_URL = process.env.ZONA_IT_DESK_URL || 'https://i-zone.pro/desk?v=0.1.18';
app.setName('Zona IT Desk');
app.setAppUserModelId(APP_MODEL_ID);
app.commandLine.appendSwitch('disable-http-cache');
let mainWindow = null;
let tray = null;
let isQuitting = false;

function trayIcon() {
  const icon = nativeImage.createFromPath(process.execPath);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function updateTrayTooltip(unreadCount) {
  if (!tray) return;
  const suffix = unreadCount > 0 ? ` (${unreadCount} непрочитанных)` : '';
  tray.setToolTip('Zona IT Desk' + suffix);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return tray;
  tray = new Tray(trayIcon());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Zona IT Desk', click: function () { showMainWindow(); } },
    { type: 'separator' },
    {
      label: 'Выход',
      click: function () {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', function () {
    showMainWindow();
  });
  updateTrayTooltip(0);
  return tray;
}

function managedRustDeskDir() {
  return path.join(app.getPath('userData'), 'runtime', 'rustdesk');
}

function sanitizeRustDeskFileValue(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim();
}

function managedRustDeskFileName(options) {
  const host = sanitizeRustDeskFileValue(options && options.host ? options.host : '');
  const key = sanitizeRustDeskFileValue(options && options.key ? options.key : '');
  if (host && key) return `rustdesk-host=${host},key=${key},.exe`;
  return 'rustdesk.exe';
}

function managedRustDeskExecutable(options) {
  return path.join(managedRustDeskDir(), managedRustDeskFileName(options));
}

function managedRustDeskInstaller(options) {
  return path.join(managedRustDeskDir(), 'rustdesk-installer-' + managedRustDeskFileName(options));
}

function rustDeskCandidates(options) {
  return [
    managedRustDeskExecutable(options),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RustDesk', 'rustdesk.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RustDesk', 'rustdesk.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'RustDesk', 'RustDesk.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'RustDesk', 'rustdesk.exe')
  ];
}

function managedRustDeskOnlyCandidates(options) {
  return [managedRustDeskExecutable(options)];
}

function findRustDesk(options) {
  return rustDeskCandidates(options).find(function (candidate) {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || null;
}

function findManagedRustDesk(options) {
  return managedRustDeskOnlyCandidates(options).find(function (candidate) {
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

function buildRustDeskConfigString(options) {
  const directConfig = options && options.configString ? String(options.configString).trim() : '';
  if (directConfig) return directConfig;
  const host = options && options.host ? String(options.host).trim() : '';
  const key = options && options.key ? String(options.key).trim() : '';
  if (!host || !key) return '';
  const payload = JSON.stringify({ host: host, key: key });
  return Buffer.from(payload, 'utf8').toString('base64').split('').reverse().join('');
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function applyRustDeskConfig(executable, options) {
  const configString = buildRustDeskConfigString(options || {});
  if (!configString) return { applied: false };
  try {
    await execFileAsync(executable, ['--config', configString]);
    return { applied: true };
  } catch (error) {
    return { applied: false, error: error.message };
  }
}

async function installRustDeskService(executable) {
  try {
    await execFileAsync(executable, ['--install-service']);
    return { installed: true };
  } catch (error) {
    return { installed: false, error: error.message };
  }
}

function httpsGetJson(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, {
      headers: {
        'User-Agent': 'Zona-IT-Desk',
        'Accept': 'application/vnd.github+json'
      }
    }, function (response) {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(httpsGetJson(response.headers.location));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error('Unexpected status: ' + response.statusCode));
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destination) {
  return new Promise(function (resolve, reject) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const file = fs.createWriteStream(destination);
    https.get(url, { headers: { 'User-Agent': 'Zona-IT-Desk' } }, function (response) {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        file.close();
        fs.rmSync(destination, { force: true });
        return resolve(downloadFile(response.headers.location, destination));
      }
      if (response.statusCode !== 200) {
        response.resume();
        file.close();
        fs.rmSync(destination, { force: true });
        return reject(new Error('Unexpected status: ' + response.statusCode));
      }
      response.pipe(file);
      file.on('finish', function () {
        file.close(function () { resolve(destination); });
      });
    }).on('error', function (error) {
      file.close();
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

async function latestRustDeskAssetUrl() {
  const release = await httpsGetJson('https://api.github.com/repos/rustdesk/rustdesk/releases/latest');
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const preferred = assets.find(function (asset) {
    return /portable.*x86_64\.exe$/i.test(asset.name || '') || /x86_64\.exe$/i.test(asset.name || '');
  }) || assets.find(function (asset) {
    return /\\.exe$/i.test(asset.name || '');
  });
  if (!preferred || !preferred.browser_download_url) {
    throw new Error('RustDesk release asset not found');
  }
  return preferred.browser_download_url;
}

async function getRustDeskStatus() {
  const executable = findManagedRustDesk() || findRustDesk();
  if (!executable) {
    return { installed: false, executable: null, clientId: '', managed: false };
  }

  let clientId = '';
  try {
    const result = await execFileAsync(executable, ['--get-id']);
    clientId = String(result.stdout || '').trim();
  } catch (error) {
    clientId = '';
  }

  return {
    installed: true,
    executable: executable,
    clientId: clientId,
    managed: path.resolve(executable).startsWith(path.resolve(managedRustDeskDir()))
  };
}

async function launchRustDesk(options) {
  let executable = findManagedRustDesk(options);
  if (!executable) {
    const installResult = await installRustDesk(options);
    if (!installResult.installed) {
      return { launched: false, installed: false, error: installResult.error || 'Не удалось подготовить модуль удаленной помощи.' };
    }
    executable = findManagedRustDesk(options);
    if (!executable) {
      return { launched: false, installed: false, error: 'Модуль удаленной помощи установлен, но клиент не найден.' };
    }
  }

  await applyRustDeskConfig(executable, options);

  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return { launched: true, installed: true };
}

async function installRustDesk(options) {
  try {
    let executable = findManagedRustDesk(options);
    if (!executable) {
      const installerPath = managedRustDeskExecutable(options);
      const assetUrl = await latestRustDeskAssetUrl();
      await downloadFile(assetUrl, installerPath);
      executable = installerPath;
    }

    if (!executable) {
      return { started: false, installed: false, error: 'Не удалось подготовить встроенный модуль.' };
    }

    const serviceResult = await installRustDeskService(executable);
    await sleep(2000);
    const configResult = await applyRustDeskConfig(executable, options);
    return {
      started: true,
      installed: true,
      executable: executable,
      managed: false,
      serviceInstalled: !!serviceResult.installed,
      serviceError: serviceResult.error || null,
      configured: !!configResult.applied,
      configError: configResult.error || null
    };
  } catch (error) {
    return { started: false, installed: false, error: error.message };
  }
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
  mainWindow = win;
  ensureTray();

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
  win.on('close', function (event) {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
}

ipcMain.handle('rustdesk:status', async function () {
  return await getRustDeskStatus();
});

ipcMain.handle('rustdesk:launch', async function (_event, options) {
  return await launchRustDesk(options || {});
});

ipcMain.handle('rustdesk:install', async function (_event, options) {
  return await installRustDesk(options || {});
});

ipcMain.handle('desk:copy', async function (_event, value) {
  clipboard.writeText(String(value || ''));
  return { ok: true };
});

ipcMain.handle('desk:notify', async function (_event, payload) {
  var title = payload && payload.title ? String(payload.title) : 'Zona IT Desk';
  var body = payload && payload.body ? String(payload.body) : '';
  if (Notification.isSupported()) {
    var notification = new Notification({ title: title, body: body, silent: false });
    notification.on('click', function () {
      showMainWindow();
    });
    notification.show();
  }
  if (mainWindow && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true);
    setTimeout(function () {
      if (mainWindow) mainWindow.flashFrame(false);
    }, 5000);
  }
  return { ok: true };
});

ipcMain.handle('desk:set-unread-count', async function (_event, count) {
  ensureTray();
  updateTrayTooltip(Number(count || 0));
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('before-quit', function () {
  isQuitting = true;
});

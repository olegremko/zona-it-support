const { app, BrowserWindow, shell, ipcMain, clipboard, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');

const APP_MODEL_ID = 'ZonaITDesk';
const DESK_URL = process.env.ZONA_IT_DESK_URL || 'https://i-zone.pro/desk';
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

function managedRustDeskFileName(options) {
  return 'zona-it-rustdesk.exe';
}

function managedRustDeskExecutable(options) {
  return path.join(managedRustDeskDir(), managedRustDeskFileName(options));
}

function managedRustDeskInstaller(options) {
  return path.join(managedRustDeskDir(), 'zona-it-rustdesk-installer.exe');
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

function serializeError(error, fallbackMessage) {
  if (!error) return fallbackMessage || 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message && typeof error.message === 'string') return error.message;
  if (error.error && typeof error.error === 'string') return error.error;
  if (error.error && typeof error.error === 'object') return serializeError(error.error, fallbackMessage);
  if (error.code && typeof error.code === 'string') return error.code;
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
    return fallbackMessage || String(error);
  }
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

async function startRustDeskProcess(executable, args, options) {
  var launchArgs = Array.isArray(args) ? args : [];
  var settings = options || {};
  var showWindow = !!settings.showWindow;
  var lastError = null;

  for (var attempt = 0; attempt < 4; attempt += 1) {
    try {
        var child = spawn(executable, launchArgs, {
          detached: true,
          stdio: 'ignore',
          windowsHide: !showWindow
        });
      child.unref();
      return { launched: true };
    } catch (error) {
      lastError = error;
      if (!error || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) break;
      await sleep(700 * (attempt + 1));
    }
  }

  try {
    var argumentLiteral = '[' + launchArgs.map(function (part) {
      return "'" + String(part || '').replace(/'/g, "''") + "'";
    }).join(',') + ']';
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      "Start-Process -WindowStyle " + (showWindow ? 'Normal' : 'Hidden') + " -FilePath '" + String(executable).replace(/'/g, "''") + "' -ArgumentList " + argumentLiteral
    ], { windowsHide: true });
    return { launched: true, fallback: 'powershell' };
  } catch (fallbackError) {
    lastError = fallbackError || lastError;
  }

  try {
    var escapedPath = '"' + String(executable).replace(/"/g, '""') + '"';
    var escapedArgs = launchArgs.map(function (part) {
      return '"' + String(part || '').replace(/"/g, '""') + '"';
    }).join(' ');
    var cmdChild = spawn('cmd.exe', ['/d', '/s', '/c', 'start "" ' + escapedPath + (escapedArgs ? ' ' + escapedArgs : '')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: !showWindow
    });
    cmdChild.unref();
    return { launched: true, fallback: 'cmd' };
  } catch (cmdFallbackError) {
    lastError = cmdFallbackError || lastError;
  }

  throw lastError || new Error('Unable to start RustDesk runtime');
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

async function applyRustDeskPassword(executable, options) {
  const password = options && options.password ? String(options.password).trim() : '';
  if (!password) return { applied: false };
  try {
    await execFileAsync(executable, ['--password', password]);
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

function pickLocalIpv4() {
  var interfaces = os.networkInterfaces();
  var fallback = '';
  Object.keys(interfaces || {}).forEach(function (name) {
    (interfaces[name] || []).forEach(function (entry) {
      if (!entry || entry.internal || entry.family !== 'IPv4') return;
      if (!fallback) fallback = entry.address || '';
      if (/ethernet|wi-?fi|wlan|lan/i.test(name)) fallback = entry.address || fallback;
    });
  });
  return fallback;
}

function getGatewayIp() {
  return new Promise(function (resolve) {
    execFile('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1 -ExpandProperty NextHop) -as [string]"
    ], { windowsHide: true }, function (_error, stdout) {
      resolve(String(stdout || '').trim());
    });
  });
}

async function getExternalIp() {
  try {
    var data = await httpsGetJson('https://api.ipify.org?format=json');
    return data && data.ip ? String(data.ip).trim() : '';
  } catch (_error) {
    return '';
  }
}

async function getSystemInfo() {
  var values = await Promise.all([getGatewayIp(), getExternalIp()]);
  return {
    deviceName: os.hostname() || '',
    localIp: pickLocalIpv4() || '',
    gatewayIp: values[0] || '',
    publicIp: values[1] || ''
  };
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

  let password = '';
  try {
    const result = await execFileAsync(executable, ['--password']);
    password = String(result.stdout || '').trim();
  } catch (error) {
    password = '';
  }

  return {
    installed: true,
    executable: executable,
    clientId: clientId,
    password: password,
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
  await applyRustDeskPassword(executable, options);
  var launchArgs = [];
  if (options && options.peerId) {
    launchArgs.push(String(options.peerId));
  }
  await startRustDeskProcess(executable, launchArgs, { showWindow: true });
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

    const configResult = await applyRustDeskConfig(executable, options);
    const passwordResult = await applyRustDeskPassword(executable, options);
    try {
      await startRustDeskProcess(executable, [], { showWindow: false });
      await sleep(2400);
    } catch (_runtimeStartError) {}
    const status = await getRustDeskStatus();
    return {
      started: true,
      installed: true,
      executable: executable,
      managed: !!status.managed,
      serviceInstalled: false,
      serviceError: null,
      configured: !!configResult.applied,
      configError: configResult.error || null,
      passwordApplied: !!passwordResult.applied,
      passwordError: passwordResult.error || null,
      clientId: status.clientId || '',
      password: status.password || (options && options.password ? String(options.password).trim() : '')
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
  try {
    return await launchRustDesk(options || {});
  } catch (error) {
    return {
      launched: false,
      installed: false,
      error: serializeError(error, 'Не удалось запустить модуль удаленной помощи.')
    };
  }
});

ipcMain.handle('rustdesk:install', async function (_event, options) {
  try {
    return await installRustDesk(options || {});
  } catch (error) {
    return {
      started: false,
      installed: false,
      error: serializeError(error, 'Не удалось подготовить модуль удаленной помощи.')
    };
  }
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

ipcMain.handle('desk:get-system-info', async function () {
  return await getSystemInfo();
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

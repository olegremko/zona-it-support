const { app, BrowserWindow, shell, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, spawn } = require('child_process');

const DESK_URL = process.env.ZONA_IT_DESK_URL || 'https://i-zone.pro/desk';
app.commandLine.appendSwitch('disable-http-cache');

function managedRustDeskDir() {
  return path.join(app.getPath('userData'), 'runtime', 'rustdesk');
}

function managedRustDeskExecutable() {
  return path.join(managedRustDeskDir(), 'rustdesk.exe');
}

function rustDeskCandidates() {
  return [
    managedRustDeskExecutable(),
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
    return /x86_64\\.exe$/i.test(asset.name || '');
  }) || assets.find(function (asset) {
    return /\\.exe$/i.test(asset.name || '');
  });
  if (!preferred || !preferred.browser_download_url) {
    throw new Error('RustDesk release asset not found');
  }
  return preferred.browser_download_url;
}

async function getRustDeskStatus() {
  const executable = findRustDesk();
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
    managed: path.resolve(executable) === path.resolve(managedRustDeskExecutable())
  };
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
  try {
    const target = managedRustDeskExecutable();
    if (!fs.existsSync(target)) {
      const assetUrl = await latestRustDeskAssetUrl();
      await downloadFile(assetUrl, target);
    }
    return { started: true, installed: true, executable: target, managed: true };
  } catch (error) {
    await shell.openExternal('https://rustdesk.com/');
    return { started: false, installed: false, redirectedToDownload: true, error: error.message };
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

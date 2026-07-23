/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

function configureBrandedUserDataPath() {
  if (!app.isPackaged) {
    return;
  }

  const legacyPath = app.getPath('userData');
  const brandedPath = path.join(app.getPath('appData'), 'Image Express');
  if (legacyPath !== brandedPath && fs.existsSync(legacyPath) && !fs.existsSync(brandedPath)) {
    fs.cpSync(legacyPath, brandedPath, { recursive: true, force: false });
  }
  app.setName('Image Express');
  app.setPath('userData', brandedPath);
}

configureBrandedUserDataPath();

let autoUpdater = null;
try {
  const updaterModule = app.isPackaged
    ? path.join(process.resourcesPath, 'electron-runtime', 'node_modules', 'electron-updater')
    : 'electron-updater';
  ({ autoUpdater } = require(updaterModule));
} catch {
  autoUpdater = null;
}

const net = require('net');

const isDev = process.env.NEXT_DESKTOP === '1' || !app.isPackaged;
const PREFERRED_PORT = Number(process.env.NEXT_DESKTOP_PORT) || 3927;
let NEXT_PORT = PREFERRED_PORT;
let NEXT_URL = `http://localhost:${NEXT_PORT}`;
const localCapabilityToken = crypto.randomBytes(32).toString('hex');

/** Find a free port starting at the preferred one — never fail because 3927 is taken. */
function findFreePort(startPort, attempts = 10) {
  return new Promise((resolve) => {
    const tryPort = (port, remaining) => {
      if (remaining <= 0) {
        resolve(startPort); // give up gracefully; server start will surface the error
        return;
      }
      const probe = net.createServer();
      probe.once('error', () => tryPort(port + 1, remaining - 1));
      probe.once('listening', () => {
        probe.close(() => resolve(port));
      });
      probe.listen(port, '127.0.0.1');
    };
    tryPort(startPort, attempts);
  });
}

let mainWindow;
let productionServerStarted = false;
let serverProcess = null;

function directoryIsEmpty(directory) {
  try {
    return fs.readdirSync(directory).length === 0;
  } catch {
    return true;
  }
}

function prepareUserDataLayout(standaloneDir) {
  const userDataRoot = app.getPath('userData');
  const dataDir = path.join(userDataRoot, 'data');
  const assetsDir = path.join(userDataRoot, 'assets');
  const logsDir = path.join(userDataRoot, 'logs');
  const migrationMarker = path.join(userDataRoot, '.storage-v2-migrated.json');

  for (const directory of [userDataRoot, dataDir, assetsDir, logsDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(migrationMarker)) {
    const migrations = [
      { source: path.join(standaloneDir, 'data'), target: dataDir, label: 'data' },
      { source: path.join(standaloneDir, 'public', 'assets'), target: assetsDir, label: 'assets' },
    ];
    const copied = [];
    for (const migration of migrations) {
      if (fs.existsSync(migration.source) && directoryIsEmpty(migration.target)) {
        fs.cpSync(migration.source, migration.target, { recursive: true, force: false });
        copied.push(migration.label);
      }
    }
    fs.writeFileSync(migrationMarker, JSON.stringify({
      version: 2,
      migratedAt: new Date().toISOString(),
      copied,
    }, null, 2));
  }

  return { dataDir, assetsDir, logsDir };
}

function resolveResource(...segments) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  return path.join(base, ...segments);
}

async function waitForServer(url, attempts = 40, delay = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return;
      }
    } catch {
      // swallow and retry
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Timed out waiting for local server to start.');
}

function traceStartup(message) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'startup-trace.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // best effort only
  }
}

async function startProductionServer() {
  if (productionServerStarted || isDev) {
    return;
  }

  const standaloneDir = resolveResource('next-standalone');
  const userPaths = prepareUserDataLayout(standaloneDir);
  traceStartup(`standaloneDir=${standaloneDir} exists=${fs.existsSync(standaloneDir)}`);
  if (!fs.existsSync(standaloneDir)) {
    dialog.showErrorBox(
      'Missing build output',
      'Unable to locate the Next.js standalone output. Run "npm run desktop:build" before packaging.'
    );
    app.quit();
    return;
  }

  const serverEntry = path.join(standaloneDir, 'server.js');
  traceStartup(`serverEntry exists=${fs.existsSync(serverEntry)}`);
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      'Invalid build output',
      'The generated standalone server is missing. Please rebuild the project.'
    );
    app.quit();
    return;
  }

  NEXT_PORT = await findFreePort(PREFERRED_PORT);
  NEXT_URL = `http://localhost:${NEXT_PORT}`;

  try {
    traceStartup(`booting server child on port ${NEXT_PORT}`);
    // Run the standalone server as a plain Node child process (Electron's own
    // binary in Node mode). Far more robust than require()-ing it in-process:
    // no Electron/Next interop surprises, and a server crash can't take the
    // shell down with it.
    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(NEXT_PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        IMAGE_EXPRESS_RUNTIME: 'desktop-local',
        IMAGE_EXPRESS_LOCAL_CAPABILITY_TOKEN: localCapabilityToken,
        IMAGE_EXPRESS_PROJECT_ROOT: standaloneDir,
        IMAGE_EXPRESS_DATA_DIR: userPaths.dataDir,
        IMAGE_EXPRESS_ASSETS_DIR: userPaths.assetsDir,
        IMAGE_EXPRESS_LOGS_DIR: userPaths.logsDir,
        IMAGE_EXPRESS_BUNDLED_PUBLIC_DIR: path.join(standaloneDir, 'public'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    serverProcess.stdout.on('data', (chunk) => traceStartup(`server: ${String(chunk).trim()}`));
    serverProcess.stderr.on('data', (chunk) => traceStartup(`server err: ${String(chunk).trim()}`));
    serverProcess.on('exit', (code) => traceStartup(`server exited code=${code}`));

    await waitForServer(NEXT_URL, 120, 250);
    traceStartup('server ready');
    productionServerStarted = true;
  } catch (error) {
    logStartupError(error);
    dialog.showErrorBox('Failed to start server', String(error && error.stack ? error.stack : error));
    app.quit();
  }
}

/** Persist startup failures where support can find them (userData/startup-error.log). */
function logStartupError(error) {
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    const detail = error && error.stack ? error.stack : String(error);
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${detail}\n`);
  } catch {
    // never let logging break the error path
  }
}

function sendUpdateStatus(status, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates/status', { status, message });
  }
}

function registerAutoUpdater() {
  if (isDev || !autoUpdater) {
    return;
  }

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking', 'Checking for updates…');
  });

  autoUpdater.on('update-available', async (info) => {
    sendUpdateStatus('available', `Version ${info.version} is available. Downloading…`);
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      sendUpdateStatus('error', error?.message || 'Failed to download the update.');
    }
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('none', 'You are up to date.');
  });

  autoUpdater.on('error', (error) => {
    sendUpdateStatus('error', error == null ? 'Unknown update error.' : error.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = progress?.percent ? progress.percent.toFixed(1) : '0';
    sendUpdateStatus('downloading', `Downloading update… ${percent}%`);
  });

  autoUpdater.on('update-downloaded', () => {
    sendUpdateStatus('ready', 'Update downloaded. Restart to apply.');
  });

  const scheduleAutoCheck = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      sendUpdateStatus('error', error?.message || 'Unable to check for updates.');
    }
  };

  // Perform an automatic check shortly after startup and then every 6 hours.
  setTimeout(scheduleAutoCheck, 15000);
  setInterval(scheduleAutoCheck, 6 * 60 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Image Express',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const targetUrl = isDev ? NEXT_URL : NEXT_URL;
  mainWindow.loadURL(targetUrl).catch((error) => {
    dialog.showErrorBox('Navigation error', String(error));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // The web app warns about unsaved changes via a `beforeunload` handler.
  // Chrome shows a native "leave site?" prompt for that; Electron does NOT —
  // it silently blocks the window close with no visible dialog at all, which
  // looks exactly like a hung app (only Task Manager can kill it). Electron's
  // documented fix is `will-prevent-unload`: it fires precisely when the page
  // tried to block the close, and we supply the confirmation dialog ourselves.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Quit Without Saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved design changes. Quit anyway?',
    });
    if (choice === 0) {
      event.preventDefault(); // "prevent the prevention" — Electron's close proceeds.
    }
  });
}

ipcMain.handle('runtime/capability', () => localCapabilityToken);

ipcMain.handle('updates/check', async () => {
  if (isDev || !autoUpdater) {
    return { status: 'none', message: 'Automatic updates are not available in this build.' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { status: 'checking' };
  } catch (error) {
    const message = error?.message || 'Failed to check for updates.';
    sendUpdateStatus('error', message);
    return { status: 'error', message };
  }
});

ipcMain.handle('updates/install', async () => {
  if (isDev || !autoUpdater) {
    return { status: 'none' };
  }

  try {
    autoUpdater.quitAndInstall();
    return { status: 'restarting' };
  } catch (error) {
    const message = error?.message || 'Unable to install the update.';
    sendUpdateStatus('error', message);
    return { status: 'error', message };
  }
});

app.whenReady().then(async () => {
  traceStartup(`app ready; isDev=${isDev} packaged=${app.isPackaged}`);
  if (!isDev) {
    await startProductionServer();
    registerAutoUpdater();
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  dialog.showErrorBox('Startup error', String(error));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

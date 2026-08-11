/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { safeLogText, createDiagnosticRedactor } = require('./logRedaction');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const PROCESS_STARTED_AT = Date.now();
const LOG_MAX_BYTES = 2 * 1024 * 1024;
const LOG_ROTATION_COUNT = 3;
const isDesktopSmokeTest = process.env.IMAGE_EXPRESS_DESKTOP_SMOKE === '1';
const startupTimings = {};
let latestUpdateState = { status: 'idle', message: 'No update check has run.' };

function configureBrandedUserDataPath() {
  const smokeUserDataPath = process.env.IMAGE_EXPRESS_SMOKE_USER_DATA_DIR;
  if (isDesktopSmokeTest && smokeUserDataPath) {
    if (!path.isAbsolute(smokeUserDataPath)) {
      throw new Error('IMAGE_EXPRESS_SMOKE_USER_DATA_DIR must be an absolute path.');
    }
    app.setName('Image Express');
    app.setPath('userData', smokeUserDataPath);
    return;
  }
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

// Paths are resolved per call, not once: they are only valid after app ready.
const redactDiagnosticValue = createDiagnosticRedactor(() => [
  { path: app.getPath('home'), label: '<home>' },
  { path: app.getPath('userData'), label: '<app-data>' },
  { path: app.getAppPath(), label: '<app-data>' },
]);

function getStructuredLogPath() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, 'desktop.jsonl');
}

function rotateStructuredLogs(logPath) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size < LOG_MAX_BYTES) return;
    for (let index = LOG_ROTATION_COUNT; index >= 1; index -= 1) {
      const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
      const destination = `${logPath}.${index}`;
      if (!fs.existsSync(source)) continue;
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
      fs.renameSync(source, destination);
    }
  } catch {
    // Logging must never prevent startup or shutdown.
  }
}

function writeStructuredLog(level, event, details = {}) {
  try {
    const logPath = getStructuredLogPath();
    rotateStructuredLogs(logPath);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details: redactDiagnosticValue(details),
    };
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Logging must never affect application behavior.
  }
}

function recordStartupTiming(phase) {
  startupTimings[phase] = Date.now() - PROCESS_STARTED_AT;
  writeStructuredLog('info', 'startup.phase', {
    phase,
    elapsedMs: startupTimings[phase],
  });
}

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
  // Lives outside the resources dir (which electron-builder replaces wholesale on every
  // update) so a multi-GB ComfyUI checkout survives app updates instead of being wiped.
  const comfyDir = path.join(userDataRoot, 'ComfyUI');
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

  return { dataDir, assetsDir, logsDir, comfyDir };
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
  writeStructuredLog('info', 'startup.trace', { message });
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
        IMAGE_EXPRESS_COMFY_DIR: userPaths.comfyDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    serverProcess.stdout.on('data', (chunk) => {
      writeStructuredLog('debug', 'server.stdout', { bytes: Buffer.byteLength(chunk) });
    });
    serverProcess.stderr.on('data', (chunk) => {
      // The text, not just its size: a byte count alone made a packaged
      // startup failure undiagnosable. Redacted/truncated in logRedaction.
      writeStructuredLog('warn', 'server.stderr', {
        bytes: Buffer.byteLength(chunk),
        text: safeLogText(chunk.toString('utf8')),
      });
    });
    serverProcess.on('exit', (code) => writeStructuredLog(
      code === 0 ? 'info' : 'error',
      'server.exit',
      { code },
    ));

    await waitForServer(NEXT_URL, 120, 250);
    traceStartup('server ready');
    recordStartupTiming('server-ready');
    productionServerStarted = true;
  } catch (error) {
    logStartupError(error);
    dialog.showErrorBox('Failed to start server', String(error && error.stack ? error.stack : error));
    app.quit();
  }
}

/** Persist startup failures where support can find them (userData/startup-error.log). */
function logStartupError(error) {
  writeStructuredLog('error', 'startup.error', {
    error: error && error.stack ? error.stack : String(error),
  });
}

function sendUpdateStatus(status, message) {
  latestUpdateState = {
    status,
    message: redactDiagnosticValue(message),
    updatedAt: new Date().toISOString(),
  };
  writeStructuredLog(status === 'error' ? 'error' : 'info', 'updater.status', {
    status,
    message,
  });
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
    title: 'Image Express Beta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  mainWindow.once('ready-to-show', () => {
    recordStartupTiming('window-ready');
    if (isDesktopSmokeTest) {
      writeStructuredLog('info', 'smoke.ready', { result: 'passed' });
      return;
    }
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
    if (isDesktopSmokeTest) {
      event.preventDefault();
      return;
    }
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

function collectSupportDiagnostics() {
  const userDataPath = app.getPath('userData');
  const logsPath = path.join(userDataPath, 'logs');
  fs.mkdirSync(logsPath, { recursive: true });
  let availableDiskBytes;
  try {
    const disk = fs.statfsSync(userDataPath);
    availableDiskBytes = disk.bavail * disk.bsize;
  } catch {
    availableDiskBytes = undefined;
  }
  let logFiles = [];
  try {
    logFiles = fs.readdirSync(logsPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .slice(0, 20)
      .map((entry) => {
        const stats = fs.statSync(path.join(logsPath, entry.name));
        return { name: entry.name, bytes: stats.size };
      });
  } catch {
    logFiles = [];
  }

  return {
    generatedAt: new Date().toISOString(),
    application: {
      name: app.getName(),
      version: app.getVersion(),
      packaged: app.isPackaged,
    },
    system: {
      platform: process.platform,
      architecture: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    runtime: {
      profile: isDev ? 'developer-local' : 'desktop-local',
      uptimeSeconds: Math.round(process.uptime()),
      startupTimingsMs: { ...startupTimings },
      updater: latestUpdateState,
      availableDiskBytes,
    },
    storage: {
      userData: '<user-data>',
      data: '<user-data>/data',
      assets: '<user-data>/assets',
      logs: '<user-data>/logs',
    },
    logs: logFiles,
  };
}

async function openSupportFolder(folderPath, event) {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    const errorMessage = await shell.openPath(folderPath);
    if (errorMessage) throw new Error(errorMessage);
    writeStructuredLog('info', event, { result: 'opened' });
    return { success: true };
  } catch (error) {
    const message = error?.message || 'Unable to open folder.';
    writeStructuredLog('error', event, { result: 'failed', message });
    return { success: false, message };
  }
}

ipcMain.handle('runtime/capability', () => localCapabilityToken);

ipcMain.handle('support/open-logs', () => (
  openSupportFolder(path.join(app.getPath('userData'), 'logs'), 'support.open-logs')
));

ipcMain.handle('support/open-user-data', () => (
  openSupportFolder(app.getPath('userData'), 'support.open-user-data')
));

ipcMain.handle('support/copy-diagnostics', () => {
  try {
    const diagnostics = collectSupportDiagnostics();
    clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    writeStructuredLog('info', 'support.copy-diagnostics', { result: 'copied' });
    return { success: true };
  } catch (error) {
    const message = error?.message || 'Unable to copy diagnostics.';
    writeStructuredLog('error', 'support.copy-diagnostics', { result: 'failed', message });
    return { success: false, message };
  }
});

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

ipcMain.handle('vault/pick-watch-root', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      properties: ['openDirectory', 'createDirectory', 'treatPackageAsDirectory'],
      title: 'Browse drive or folder to index',
      buttonLabel: 'Index this folder',
      message: 'Choose a local drive, folder, or mounted network share to index in Asset Vault.',
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    const message = error?.message || 'Unable to open folder picker.';
    writeStructuredLog('error', 'vault.pick-watch-root', { result: 'failed', message });
    return { success: false, message };
  }
});

ipcMain.handle('vault/read-file', async (_event, filePath) => {
  try {
    if (typeof filePath !== 'string' || filePath.length < 2) {
      return { success: false, message: 'Invalid path.' };
    }
    // Basic path traversal guard: must be absolute.
    if (!path.isAbsolute(filePath)) {
      return { success: false, message: 'Path must be absolute.' };
    }
    const buffer = fs.readFileSync(filePath);
    // Cap preview reads at 40MB to protect renderer memory.
    if (buffer.length > 40 * 1024 * 1024) {
      return { success: false, message: 'File too large to preview.' };
    }
    return {
      success: true,
      base64: buffer.toString('base64'),
      size: buffer.length,
      mimeType: 'application/octet-stream',
    };
  } catch (error) {
    const message = error?.message || 'Unable to read file.';
    return { success: false, message };
  }
});

app.whenReady().then(async () => {
  recordStartupTiming('electron-ready');
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
  writeStructuredLog('info', 'application.quit', { uptimeSeconds: Math.round(process.uptime()) });
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

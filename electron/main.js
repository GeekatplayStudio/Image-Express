/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NEXT_DESKTOP === '1' || !app.isPackaged;
const NEXT_PORT = Number(process.env.NEXT_DESKTOP_PORT) || 3927;
const NEXT_URL = `http://localhost:${NEXT_PORT}`;

let mainWindow;
let productionServerStarted = false;

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
    } catch (error) {
      // swallow and retry
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Timed out waiting for local server to start.');
}

async function startProductionServer() {
  if (productionServerStarted || isDev) {
    return;
  }

  const standaloneDir = resolveResource('next-standalone');
  if (!fs.existsSync(standaloneDir)) {
    dialog.showErrorBox(
      'Missing build output',
      'Unable to locate the Next.js standalone output. Run "npm run desktop:build" before packaging.'
    );
    app.quit();
    return;
  }

  const serverEntry = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      'Invalid build output',
      'The generated standalone server is missing. Please rebuild the project.'
    );
    app.quit();
    return;
  }

  process.env.PORT = String(NEXT_PORT);
  process.env.HOSTNAME = '127.0.0.1';
  process.env.NODE_ENV = 'production';
  process.chdir(standaloneDir);

  try {
    // Boot the Next.js standalone server inside the Electron process.
    require(serverEntry);
    await waitForServer(NEXT_URL, 80, 200);
    productionServerStarted = true;
  } catch (error) {
    dialog.showErrorBox('Failed to start server', String(error));
    app.quit();
  }
}

function sendUpdateStatus(status, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates/status', { status, message });
  }
}

function registerAutoUpdater() {
  if (isDev) {
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
}

ipcMain.handle('updates/check', async () => {
  if (isDev) {
    return { status: 'none', message: 'Updates are disabled in development builds.' };
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
  if (isDev) {
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
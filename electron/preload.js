/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getLocalCapabilityToken: () => ipcRenderer.invoke('runtime/capability'),
  openLogsFolder: () => ipcRenderer.invoke('support/open-logs'),
  openUserDataFolder: () => ipcRenderer.invoke('support/open-user-data'),
  copyDiagnostics: () => ipcRenderer.invoke('support/copy-diagnostics'),
  checkForUpdates: () => ipcRenderer.invoke('updates/check'),
  installUpdate: () => ipcRenderer.invoke('updates/install'),
  pickWatchRootFolder: () => ipcRenderer.invoke('vault/pick-watch-root'),
  readLocalVaultFile: (filePath) => ipcRenderer.invoke('vault/read-file', filePath),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const channel = 'updates/status';
    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on(channel, listener);

    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});

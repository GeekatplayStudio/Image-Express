const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  checkForUpdates: () => ipcRenderer.invoke('updates/check'),
  installUpdate: () => ipcRenderer.invoke('updates/install'),
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

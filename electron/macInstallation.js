// Keep installation ahead of server startup so the disk-image copy never writes
// data or starts a second server while Electron moves and relaunches the app.
async function prepareMacInstallation({ app, dialog, platform, smoke }) {
  if (platform !== 'darwin' || !app.isPackaged || smoke || app.isInApplicationsFolder()) {
    return true;
  }

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Install Image Express',
    message: 'Install Image Express in Applications?',
    detail: 'Click Install and Open. Next time, open Image Express from Applications or keep it in your Dock.',
    buttons: ['Install and Open', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) {
    app.quit();
    return false;
  }

  try {
    const moved = app.moveToApplicationsFolder({
      conflictHandler: (conflictType) => {
        if (conflictType === 'existsAndRunning') {
          dialog.showMessageBoxSync({
            type: 'info',
            message: 'Image Express is already open.',
            detail: 'Quit the installed Image Express app, then open this installer again to replace it.',
            buttons: ['OK'],
          });
          return false;
        }
        return dialog.showMessageBoxSync({
          type: 'question',
          message: 'Replace the installed Image Express app?',
          detail: 'Your saved projects and settings are stored separately and will be kept.',
          buttons: ['Cancel', 'Replace'],
          defaultId: 0,
          cancelId: 0,
        }) === 1;
      },
    });
    if (moved) return false; // Electron relaunches the installed copy itself.
  } catch {
    // A canceled authorization dialog or a read-only Applications folder should
    // give the user a useful next step, not an internal startup exception.
  }
  await dialog.showMessageBox({
    type: 'info',
    message: 'Installation was not completed.',
    detail: 'You can drag Image Express into the Applications folder in the disk-image window, then open it from Applications. If your Mac is managed, ask your administrator to install it.',
    buttons: ['OK'],
  });
  app.quit();
  return false;
}

module.exports = { prepareMacInstallation };

/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareMacInstallation } = require('../electron/macInstallation');

function fixture(overrides = {}) {
  const calls = [];
  const app = {
    isPackaged: true,
    isInApplicationsFolder: () => false,
    moveToApplicationsFolder: () => { calls.push('move'); return true; },
    quit: () => calls.push('quit'),
    ...overrides,
  };
  const dialog = {
    showMessageBox: async () => { calls.push('prompt'); return { response: 0 }; },
    showMessageBoxSync: () => 0,
  };
  return { app, dialog, calls, platform: 'darwin', smoke: false };
}

test('installed Macs, development, other platforms and smoke runs start without installation prompts', async () => {
  for (const overrides of [
    { app: { isInApplicationsFolder: () => true } },
    { app: { isPackaged: false } },
    { platform: 'win32' }, { smoke: true },
  ]) {
    const context = fixture(overrides.app);
    if (overrides.platform) context.platform = overrides.platform;
    if (overrides.smoke) context.smoke = true;
    assert.equal(await prepareMacInstallation(context), true);
    assert.deepEqual(context.calls, []);
  }
});

test('Install and Open delegates the move and relaunch; original copy must not start a server', async () => {
  const context = fixture();
  assert.equal(await prepareMacInstallation(context), false);
  assert.deepEqual(context.calls, ['prompt', 'move']);
});

test('cancel quits without modifying Applications', async () => {
  const context = fixture();
  context.dialog.showMessageBox = async () => ({ response: 1 });
  assert.equal(await prepareMacInstallation(context), false);
  assert.deepEqual(context.calls, ['quit']);
});

test('permission failure and canceled move explain drag installation and quit', async () => {
  for (const move of [() => false, () => { throw new Error('permission denied'); }]) {
    const context = fixture({ moveToApplicationsFolder: move });
    assert.equal(await prepareMacInstallation(context), false);
    assert.deepEqual(context.calls, ['prompt', 'prompt', 'quit']);
  }
});

test('replacement requires confirmation and never replaces a running app', async () => {
  const context = fixture();
  let handler;
  context.app.moveToApplicationsFolder = (options) => { handler = options.conflictHandler; return true; };
  await prepareMacInstallation(context);
  assert.equal(handler('exists'), false);
  context.dialog.showMessageBoxSync = () => 1;
  assert.equal(handler('exists'), true);
  assert.equal(handler('existsAndRunning'), false);
});

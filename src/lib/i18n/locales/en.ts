import type { LocaleDictionary } from '../types';

/**
 * Base locale. This file defines the COMPLETE key set for the app.
 * Every other locale translates a subset of these keys; anything missing
 * falls back to the English string below.
 *
 * Key convention: "<area>.<name>" — e.g. "common.close", "dashboard.title".
 * See docs/i18n_multilanguage_support.md for how to add keys and locales.
 */
const en: LocaleDictionary = {
    // Common actions reused across the app
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.saveChanges': 'Save Changes',
    'common.delete': 'Delete',
    'common.rename': 'Rename',
    'common.download': 'Download',
    'common.upload': 'Upload',
    'common.search': 'Search',
    'common.settings': 'Settings',
    'common.language': 'Language',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.done': 'Done',
    'common.ok': 'OK',
    'common.confirm': 'Confirm',
    'common.loading': 'Loading…',
    'common.error': 'Error',
    'common.retry': 'Retry',

    // Auth / user
    'auth.signIn': 'Sign In',
    'auth.signOut': 'Sign Out',
    'auth.userProfile': 'User Profile',
    'auth.continueLocal': 'Continue with Local Access',
    'auth.guest': 'Guest',
    'auth.localUser': 'Local User',

    // Dashboard header
    'dashboard.appName': 'Image Express',
    'dashboard.howToUse': 'How to use Image Express',
    'dashboard.adminArea': 'Admin Area',
    'dashboard.newDesign': 'New Design',
    'dashboard.customSize': 'Custom Size',
    'dashboard.searchTemplates': 'Search templates (Instagram, Resume, Poster...)',

    // Editor top bar
    'editor.export': 'Export',
    'editor.share': 'Share',
    'editor.backToHub': 'Back to Hub',
    'editor.saveDesign': 'Save design',
    'editor.undo': 'Undo',
    'editor.redo': 'Redo',

    // Settings
    'settings.title': 'Settings',
    'settings.preferences': 'Preferences',
    'settings.setupWizard': 'Setup Wizard',
    'settings.openSetupWizard': 'Open Setup Wizard',
    'settings.updates': 'Updates',
    'settings.checkForUpdates': 'Check for Updates',
    'settings.updateNow': 'Update Now',
    'settings.upToDate': 'You are running the latest version.',
    'settings.updateAvailable': 'A newer version is available.',

    // Asset library
    'assets.title': 'Asset Library',
    'assets.uploadAsset': 'Upload Asset',
    'assets.addToCanvas': 'Add to Canvas',
    'assets.makePublic': 'Make Public',
    'assets.makePrivate': 'Make Private',
    'assets.group': 'Group',
    'assets.ungroup': 'Ungroup',
    'assets.newGroup': 'New Group…',
    'assets.selectAll': 'Select All',
    'assets.clearSelection': 'Clear selection',
};

export default en;

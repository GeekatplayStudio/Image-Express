'use client';

const SETUP_WIZARD_STATE_KEY = 'image-express-setup-wizard-state';
const SETUP_WIZARD_SESSION_DISMISSED_KEY = 'image-express-setup-wizard-session-dismissed';
const SETUP_WIZARD_OPEN_EVENT = 'image-express-setup-wizard-open';
const DRIVE_STORAGE_KEY = 'image-express-google-drive';
const ASSET_STORAGE_SETTINGS_KEY = 'image-express-asset-storage-settings';
const SETUP_API_KEY_STORAGE_KEYS = [
    'stability_api_key',
    'openai_api_key',
    'google_api_key',
    'banana_api_key',
    'meshy_api_key',
    'tripo_api_key',
    'hitems_api_key',
];

type SetupWizardState = {
    completedAt?: string; // Legacy global completion marker.
    completedByScope?: Record<string, string>;
};

function loadState(): SetupWizardState {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(SETUP_WIZARD_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as SetupWizardState;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('Failed to parse setup wizard state', error);
        return {};
    }
}

function saveState(state: SetupWizardState) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETUP_WIZARD_STATE_KEY, JSON.stringify(state));
}

function normalizeScope(scope?: string) {
    const normalized = (scope ?? '').trim().toLowerCase();
    return normalized || 'guest';
}

function getSessionDismissKey(scope?: string) {
    return `${SETUP_WIZARD_SESSION_DISMISSED_KEY}:${normalizeScope(scope)}`;
}

function hasExistingSetupConfiguration() {
    if (typeof window === 'undefined') return false;

    try {
        const hasApiKey = SETUP_API_KEY_STORAGE_KEYS.some((key) => {
            const value = window.localStorage.getItem(key);
            return Boolean(value && value.trim().length > 0);
        });
        if (hasApiKey) return true;

        const rawDrive = window.localStorage.getItem(DRIVE_STORAGE_KEY);
        if (rawDrive) {
            const parsedDrive = JSON.parse(rawDrive) as { enabled?: boolean } | null;
            if (parsedDrive?.enabled) {
                return true;
            }
        }

        const rawAssetStorage = window.localStorage.getItem(ASSET_STORAGE_SETTINGS_KEY);
        if (rawAssetStorage) {
            const parsedAssetStorage = JSON.parse(rawAssetStorage) as { mode?: string } | null;
            if (parsedAssetStorage?.mode === 'local' || parsedAssetStorage?.mode === 'hybrid' || parsedAssetStorage?.mode === 'cloud') {
                return true;
            }
        }
    } catch (error) {
        console.warn('Failed to inspect existing setup configuration', error);
    }

    return false;
}

function migrateLegacyCompletionForScope(state: SetupWizardState, scope?: string) {
    if (!state.completedAt) return state;
    const scopeKey = normalizeScope(scope);
    if (state.completedByScope?.[scopeKey]) return state;
    const migratedState: SetupWizardState = {
        completedByScope: {
            ...(state.completedByScope ?? {}),
            [scopeKey]: state.completedAt,
        },
    };
    saveState(migratedState);
    return migratedState;
}

export function isSetupWizardCompleted(scope?: string) {
    const state = loadState();
    const scopeKey = normalizeScope(scope);
    if (state.completedByScope?.[scopeKey]) {
        return true;
    }
    if (!state.completedAt) {
        return false;
    }
    // Migrate legacy global completion into scoped completion.
    return Boolean(migrateLegacyCompletionForScope(state, scope).completedByScope?.[scopeKey]);
}

export function shouldAutoOpenSetupWizard(scope?: string) {
    if (typeof window === 'undefined') return false;
    if (hasExistingSetupConfiguration()) {
        if (!isSetupWizardCompleted(scope)) {
            markSetupWizardCompleted(scope);
        }
        return false;
    }
    if (isSetupWizardCompleted(scope)) return false;
    const sessionDismissed = window.sessionStorage.getItem(getSessionDismissKey(scope));
    return sessionDismissed !== 'true';
}

export function dismissSetupWizardForSession(scope?: string) {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(getSessionDismissKey(scope), 'true');
}

export function markSetupWizardCompleted(scope?: string) {
    if (typeof window === 'undefined') return;
    const scopeKey = normalizeScope(scope);
    const state = loadState();
    const completedAt = new Date().toISOString();
    saveState({
        completedByScope: {
            ...(state.completedByScope ?? {}),
            [scopeKey]: completedAt,
        },
    });
    window.sessionStorage.removeItem(getSessionDismissKey(scope));
}

export function resetSetupWizardState(scope?: string) {
    if (typeof window === 'undefined') return;
    if (scope) {
        const scopeKey = normalizeScope(scope);
        const state = loadState();
        const completedByScope = { ...(state.completedByScope ?? {}) };
        delete completedByScope[scopeKey];
        if (Object.keys(completedByScope).length === 0) {
            window.localStorage.removeItem(SETUP_WIZARD_STATE_KEY);
        } else {
            saveState({ completedByScope });
        }
        window.sessionStorage.removeItem(getSessionDismissKey(scope));
        return;
    }

    window.localStorage.removeItem(SETUP_WIZARD_STATE_KEY);
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(`${SETUP_WIZARD_SESSION_DISMISSED_KEY}:`)) {
            window.sessionStorage.removeItem(key);
        }
    }
}

export function requestOpenSetupWizard() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SETUP_WIZARD_OPEN_EVENT));
}

export function onSetupWizardOpenRequest(listener: () => void) {
    if (typeof window === 'undefined') return () => undefined;
    const handler = () => listener();
    window.addEventListener(SETUP_WIZARD_OPEN_EVENT, handler);
    return () => {
        window.removeEventListener(SETUP_WIZARD_OPEN_EVENT, handler);
    };
}

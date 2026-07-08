import {
    dismissSetupWizardForSession,
    isSetupWizardCompleted,
    markSetupWizardCompleted,
    onSetupWizardOpenRequest,
    requestOpenSetupWizard,
    resetSetupWizardState,
    shouldAutoOpenSetupWizard,
} from '@/lib/setupWizard';

const SETUP_WIZARD_STATE_KEY = 'image-express-setup-wizard-state';

describe('setupWizard state', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it('auto-opens for first-time users', () => {
        expect(shouldAutoOpenSetupWizard('alice@example.com')).toBe(true);
        expect(isSetupWizardCompleted('alice@example.com')).toBe(false);
    });

    it('tracks dismiss state per user within a session', () => {
        dismissSetupWizardForSession('alice@example.com');
        expect(shouldAutoOpenSetupWizard('alice@example.com')).toBe(false);
        expect(shouldAutoOpenSetupWizard('bob@example.com')).toBe(true);
    });

    it('tracks completion per user', () => {
        markSetupWizardCompleted('alice@example.com');
        expect(isSetupWizardCompleted('alice@example.com')).toBe(true);
        expect(shouldAutoOpenSetupWizard('alice@example.com')).toBe(false);

        expect(isSetupWizardCompleted('bob@example.com')).toBe(false);
        expect(shouldAutoOpenSetupWizard('bob@example.com')).toBe(true);
    });

    it('migrates legacy completion to the current scope', () => {
        window.localStorage.setItem(
            SETUP_WIZARD_STATE_KEY,
            JSON.stringify({ completedAt: '2026-02-13T00:00:00.000Z' })
        );

        expect(isSetupWizardCompleted('alice@example.com')).toBe(true);
        expect(isSetupWizardCompleted('bob@example.com')).toBe(false);
    });

    it('can reset completion for one user only', () => {
        markSetupWizardCompleted('alice@example.com');
        markSetupWizardCompleted('bob@example.com');

        resetSetupWizardState('alice@example.com');

        expect(isSetupWizardCompleted('alice@example.com')).toBe(false);
        expect(isSetupWizardCompleted('bob@example.com')).toBe(true);
    });

    it('handles malformed local storage state gracefully', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        window.localStorage.setItem(SETUP_WIZARD_STATE_KEY, '{bad json');

        expect(isSetupWizardCompleted('alice@example.com')).toBe(false);
        expect(errorSpy).toHaveBeenCalled();
    });

    it('resets all wizard state when called without scope', () => {
        markSetupWizardCompleted('alice@example.com');
        markSetupWizardCompleted('bob@example.com');
        dismissSetupWizardForSession('alice@example.com');
        dismissSetupWizardForSession('bob@example.com');

        resetSetupWizardState();

        expect(window.localStorage.getItem(SETUP_WIZARD_STATE_KEY)).toBeNull();
        expect(window.sessionStorage.length).toBe(0);
    });

    it('supports manual open events and unsubscribe', () => {
        const listener = jest.fn();
        const unsubscribe = onSetupWizardOpenRequest(listener);

        requestOpenSetupWizard();
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        requestOpenSetupWizard();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

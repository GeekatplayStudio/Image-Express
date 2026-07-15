import { act, renderHook } from '@testing-library/react';
import { useEditorAutosave, AUTOSAVE_DEBOUNCE_MS } from '@/components/Editor/useEditorAutosave';
import { saveUiPreferences } from '@/lib/ui-preferences';

describe('useEditorAutosave', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        window.localStorage.clear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const setup = (args: Partial<Parameters<typeof useEditorAutosave>[0]> = {}) => {
        const handleSave = jest.fn().mockResolvedValue(undefined);
        const hook = renderHook((props: Parameters<typeof useEditorAutosave>[0]) => useEditorAutosave(props), {
            initialProps: {
                isDirty: false,
                designId: 'design-1',
                designName: 'My Design',
                handleSave,
                ...args,
            },
        });
        return { hook, handleSave };
    };

    it('is disabled by default', () => {
        const { hook, handleSave } = setup({ isDirty: true });
        act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2); });
        expect(hook.result.current.autosaveEnabled).toBe(false);
        expect(handleSave).not.toHaveBeenCalled();
    });

    it('saves after the debounce when enabled and dirty', async () => {
        const { hook, handleSave } = setup({ isDirty: true });
        act(() => { hook.result.current.setAutosaveEnabled(true); });
        await act(async () => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10); });
        expect(handleSave).toHaveBeenCalledTimes(1);
    });

    it('does not save clean documents', () => {
        const { hook, handleSave } = setup({ isDirty: false });
        act(() => { hook.result.current.setAutosaveEnabled(true); });
        act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2); });
        expect(handleSave).not.toHaveBeenCalled();
    });

    it('never autosaves unnamed, unsaved designs (would require a dialog)', () => {
        const { hook, handleSave } = setup({ isDirty: true, designId: null, designName: 'Untitled Design' });
        act(() => { hook.result.current.setAutosaveEnabled(true); });
        act(() => { jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2); });
        expect(handleSave).not.toHaveBeenCalled();
    });

    it('persists the preference and picks it up on mount', () => {
        saveUiPreferences({ autosaveEnabled: true });
        const { hook } = setup();
        expect(hook.result.current.autosaveEnabled).toBe(true);
    });
});

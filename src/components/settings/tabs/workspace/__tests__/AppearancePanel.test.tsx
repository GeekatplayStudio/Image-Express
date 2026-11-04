import { fireEvent, render, screen } from '@testing-library/react';

import AppearancePanel from '@/components/settings/tabs/workspace/AppearancePanel';
import type { WorkspacePreferences } from '@/components/settings/hooks/useWorkspacePreferences';
import { THEME_ACCENT_OPTIONS, THEME_MODE_OPTIONS } from '@/lib/themePreferences';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key) }),
}));
jest.mock('@/lib/jobNotifications', () => ({ requestSystemNotificationPermission: jest.fn() }));

const workspace = (over: Partial<WorkspacePreferences> = {}): WorkspacePreferences => ({
    expandToolRailLabelsOnHover: true, setExpandToolRailLabelsOnHover: jest.fn(),
    suppressNumberDragHints: false, setSuppressNumberDragHints: jest.fn(),
    pipelineRailMode: 'minimal', setPipelineRailMode: jest.fn(),
    notifyOnJobComplete: true, setNotifyOnJobComplete: jest.fn(),
    themeMode: 'system', setThemeMode: jest.fn(),
    themeAccentPreset: 'ocean', setThemeAccentPreset: jest.fn(),
    themeCustomAccent: '#1f8aa5', setThemeCustomAccent: jest.fn(),
    isLogVisible: false, logContent: '', isLogLoading: false, logError: null,
    handleToggleLog: jest.fn(), handleResetNumberDragHint: jest.fn(), saveWorkspacePreferences: jest.fn(),
    THEME_ACCENT_OPTIONS, THEME_MODE_OPTIONS,
    ...over,
} as unknown as WorkspacePreferences);

describe('AppearancePanel custom accent', () => {
    it('offers Custom beside the presets and selects it', () => {
        const ws = workspace();
        render(<AppearancePanel workspace={ws} />);
        fireEvent.click(screen.getByRole('button', { name: 'settings.workspace.accentPaletteAria:accent.custom' }));
        expect(ws.setThemeAccentPreset).toHaveBeenCalledWith('custom');
        expect(screen.queryByTestId('custom-accent-editor')).toBeNull();
    });

    it('shows the colour picker and contrast readout once Custom is active, and warns on a weak colour', () => {
        const ws = workspace({ themeAccentPreset: 'custom', themeCustomAccent: '#ffe066' });
        render(<AppearancePanel workspace={ws} />);
        expect(screen.getByTestId('custom-accent-editor')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('settings.workspace.contrastWarning');
        fireEvent.change(screen.getByLabelText('settings.workspace.customAccentColor'), { target: { value: '#c2410c' } });
        expect(ws.setThemeCustomAccent).toHaveBeenCalledWith('#c2410c');
    });

    it('shows no warning for an accent that meets every guideline', () => {
        render(<AppearancePanel workspace={workspace({ themeAccentPreset: 'custom', themeCustomAccent: '#1f8aa5' })} />);
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByText('#1f8aa5')).toBeInTheDocument();
    });
});

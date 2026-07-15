'use client';

import { RefreshCcw, Server } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { ThemePreferenceMode } from '@/lib/themePreferences';
import type { WorkspacePreferences } from '../../hooks/useWorkspacePreferences';
import { modalSectionClass } from '../../settingsTypes';

interface AppearancePanelProps {
    workspace: WorkspacePreferences;
}

/** Theme mode/accent, tool rail hover, and number-drag hint controls. */
export default function AppearancePanel({ workspace }: AppearancePanelProps) {
    const { t } = useI18n();
    const {
        themeMode, setThemeMode, themeAccentPreset, setThemeAccentPreset,
        expandToolRailLabelsOnHover, setExpandToolRailLabelsOnHover,
        suppressNumberDragHints, setSuppressNumberDragHints,
        handleResetNumberDragHint, THEME_ACCENT_OPTIONS, THEME_MODE_OPTIONS,
    } = workspace;

    return (
        <section className={modalSectionClass}>
            <div>
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Server size={16} className="text-primary" />
                    {t('settings.workspace.interfaceBehavior')}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                    Control the global appearance mode, accent palette, and editor rail behavior.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label htmlFor="settings-theme-mode" className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Theme mode
                    </label>
                    <select
                        id="settings-theme-mode"
                        aria-label="Theme mode"
                        value={themeMode}
                        onChange={(event) => setThemeMode(event.target.value as ThemePreferenceMode)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                        {THEME_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                        {THEME_MODE_OPTIONS.find((option) => option.value === themeMode)?.description}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Accent palette
                    </label>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                        {THEME_ACCENT_OPTIONS.map((option) => {
                            const isActive = themeAccentPreset === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-label={`Accent palette ${option.label}`}
                                    aria-pressed={isActive}
                                    onClick={() => setThemeAccentPreset(option.value)}
                                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-secondary'}`}
                                >
                                    <div className="mb-2 h-3 rounded-full" style={{ backgroundImage: option.swatch }} />
                                    <div className="text-xs font-semibold text-foreground">{option.label}</div>
                                    <div className="text-[11px] text-muted-foreground">{option.description}</div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Theme changes apply globally after saving and persist across sessions.
                    </p>
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={expandToolRailLabelsOnHover}
                        onChange={(event) => setExpandToolRailLabelsOnHover(event.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Expand side tool rails on hover
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={suppressNumberDragHints}
                        onChange={(event) => setSuppressNumberDragHints(event.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Don&apos;t remind me about number-drag tips
                </label>
            </div>

            <button
                onClick={handleResetNumberDragHint}
                className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
            >
                <RefreshCcw size={13} />
                Reset Number-Drag Hint
            </button>
        </section>
    );
}

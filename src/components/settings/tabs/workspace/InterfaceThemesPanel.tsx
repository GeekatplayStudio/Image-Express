'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Palette, RefreshCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { useDialog } from '@/providers/DialogProvider';
import { modalSectionClass } from '../../settingsTypes';
import {
    DEFAULT_UI_THEME_ID,
    type InstalledUiTheme,
} from '@/lib/ui-themes-shared';
import {
    activateUiTheme,
    listUiThemes,
    loadStoredUiTheme,
} from '@/lib/ui-themes';

/**
 * Interface theme packs: list installed packs, activate by click, install from
 * a downloaded zip (packs are distributed separately — never bundled), and remove.
 */
export default function InterfaceThemesPanel() {
    const { toast } = useToast();
    const { confirm } = useDialog();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [themes, setThemes] = useState<InstalledUiTheme[]>([]);
    const [activeId, setActiveId] = useState<string>(DEFAULT_UI_THEME_ID);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await listUiThemes();
            setThemes(list);
            setActiveId(loadStoredUiTheme().id);
        } catch {
            toast({ title: 'Themes', description: 'Could not load the theme list.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleActivate = (theme: InstalledUiTheme) => {
        activateUiTheme(theme);
        setActiveId(theme.id);
    };

    const handleInstallFile = async (file: File) => {
        setInstalling(true);
        try {
            const form = new FormData();
            form.append('file', file);
            let response = await fetch('/api/themes/install', { method: 'POST', body: form });
            let payload = await response.json() as { success: boolean; theme?: InstalledUiTheme; error?: string };

            if (!payload.success && payload.error?.includes('already installed')) {
                const overwrite = await confirm(
                    `${payload.error} Reinstall and overwrite the existing copy?`,
                    { title: 'Theme already installed', confirmText: 'Overwrite' }
                );
                if (!overwrite) return;
                const retryForm = new FormData();
                retryForm.append('file', file);
                retryForm.append('overwrite', 'true');
                response = await fetch('/api/themes/install', { method: 'POST', body: retryForm });
                payload = await response.json();
            }

            if (!payload.success || !payload.theme) {
                toast({ title: 'Theme install failed', description: payload.error || 'Unknown error.', variant: 'destructive' });
                return;
            }
            toast({ title: 'Theme installed', description: `"${payload.theme.name}" is ready to use.`, variant: 'success' });
            await refresh();
        } catch {
            toast({ title: 'Theme install failed', description: 'Could not reach the server.', variant: 'destructive' });
        } finally {
            setInstalling(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemove = async (theme: InstalledUiTheme) => {
        const confirmed = await confirm(
            `Remove the theme "${theme.name}"? You can reinstall it later from its zip file.`,
            { title: 'Remove theme', confirmText: 'Remove' }
        );
        if (!confirmed) return;
        setRemovingId(theme.id);
        try {
            const response = await fetch(`/api/themes/${encodeURIComponent(theme.id)}`, { method: 'DELETE' });
            const payload = await response.json() as { success: boolean; error?: string };
            if (!payload.success) {
                toast({ title: 'Remove failed', description: payload.error || 'Unknown error.', variant: 'destructive' });
                return;
            }
            if (activeId === theme.id) {
                const fallback = themes.find((entry) => entry.id === DEFAULT_UI_THEME_ID);
                if (fallback) handleActivate(fallback);
            }
            toast({ title: 'Theme removed', description: `"${theme.name}" was uninstalled.`, variant: 'success' });
            await refresh();
        } catch {
            toast({ title: 'Remove failed', description: 'Could not reach the server.', variant: 'destructive' });
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <section className={modalSectionClass}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Palette size={16} className="text-primary" />
                        Interface Themes
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        Theme packs restyle the whole interface — colors, window shapes, fonts, and icons.
                        Download packs separately and install them from a .zip file. Your designs are never affected.
                    </p>
                </div>
                <button
                    onClick={() => void refresh()}
                    aria-label="Refresh theme list"
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-border hover:bg-secondary transition-colors"
                >
                    <RefreshCcw size={13} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                    <Loader2 size={14} className="animate-spin" /> Loading themes…
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {themes.map((theme) => {
                        const isActive = activeId === theme.id;
                        const previewUrl = theme.preview ? theme.baseUrl + theme.preview : null;
                        return (
                            <div
                                key={theme.id}
                                className={`relative rounded-xl border text-left transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-secondary'}`}
                            >
                                <button
                                    type="button"
                                    aria-label={`Activate theme ${theme.name}`}
                                    aria-pressed={isActive}
                                    onClick={() => handleActivate(theme)}
                                    className="w-full px-3 py-2 text-left"
                                >
                                    <div className="relative mb-2 h-14 rounded-md border border-border/50 bg-secondary/40 overflow-hidden flex items-center justify-center">
                                        {previewUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full ui-brand-gradient-surface" />
                                        )}
                                        {theme.spriteTheater && (
                                            <span
                                                title="Animated theme — includes moving sprite scenes"
                                                aria-label="Animated theme"
                                                className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 backdrop-blur-sm"
                                            >
                                                <Sparkles size={10} className="shrink-0" />
                                                Animated
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isActive && <Check size={12} className="text-primary shrink-0" />}
                                        <span className="text-xs font-semibold text-foreground truncate">{theme.name}</span>
                                        {theme.spriteTheater && (
                                            <Sparkles size={11} className="text-amber-400 shrink-0" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground line-clamp-2">
                                        {theme.description || (theme.source === 'builtin' ? 'Built-in theme.' : 'Installed theme pack.')}
                                    </div>
                                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                        {theme.source === 'builtin' ? 'Built-in' : `Installed${theme.version ? ` · v${theme.version}` : ''}`}
                                    </div>
                                </button>
                                {theme.source === 'installed' && (
                                    <button
                                        type="button"
                                        aria-label={`Remove theme ${theme.name}`}
                                        onClick={() => void handleRemove(theme)}
                                        disabled={removingId === theme.id}
                                        className="absolute right-1.5 top-1.5 h-6 w-6 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors"
                                    >
                                        {removingId === theme.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleInstallFile(file);
                    }}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={installing}
                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                    {installing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {installing ? 'Installing…' : 'Install theme from .zip…'}
                </button>
                <a
                    href="https://geekatplay.gumroad.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1.5"
                >
                    ♥ Get more themes &amp; support Vlad
                </a>
                <p className="text-[11px] text-muted-foreground">
                    Optional — purchases support development. Changes apply instantly.
                </p>
            </div>
        </section>
    );
}

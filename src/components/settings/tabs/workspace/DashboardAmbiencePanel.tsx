'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RefreshCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { useDialog } from '@/providers/DialogProvider';
import { modalSectionClass } from '../../settingsTypes';
import { DEFAULT_AMBIENCE_ID, type InstalledAmbience } from '@/lib/ambience-shared';
import { activateAmbience, listAmbiencePacks, loadStoredAmbience } from '@/lib/ambience';

/**
 * Dashboard Ambience packs: subtle animated background effects for the hub only
 * (never the editor). Same install/activate/remove flow as interface themes.
 */
export default function DashboardAmbiencePanel() {
    const { toast } = useToast();
    const { confirm } = useDialog();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [packs, setPacks] = useState<InstalledAmbience[]>([]);
    const [activeId, setActiveId] = useState<string>(DEFAULT_AMBIENCE_ID);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await listAmbiencePacks();
            setPacks(list);
            setActiveId(loadStoredAmbience().id);
        } catch {
            toast({ title: 'Ambience', description: 'Could not load the ambience pack list.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleActivate = (pack: InstalledAmbience) => {
        activateAmbience(pack);
        setActiveId(pack.id);
    };

    const handleInstallFile = async (file: File) => {
        setInstalling(true);
        try {
            const form = new FormData();
            form.append('file', file);
            let response = await fetch('/api/ambience/install', { method: 'POST', body: form });
            let payload = await response.json() as { success: boolean; pack?: InstalledAmbience; error?: string };

            if (!payload.success && payload.error?.includes('already installed')) {
                const overwrite = await confirm(
                    `${payload.error} Reinstall and overwrite the existing copy?`,
                    { title: 'Pack already installed', confirmText: 'Overwrite' }
                );
                if (!overwrite) return;
                const retryForm = new FormData();
                retryForm.append('file', file);
                retryForm.append('overwrite', 'true');
                response = await fetch('/api/ambience/install', { method: 'POST', body: retryForm });
                payload = await response.json();
            }

            if (!payload.success || !payload.pack) {
                toast({ title: 'Pack install failed', description: payload.error || 'Unknown error.', variant: 'destructive' });
                return;
            }
            toast({ title: 'Ambience installed', description: `"${payload.pack.name}" is ready to use.`, variant: 'success' });
            await refresh();
        } catch {
            toast({ title: 'Pack install failed', description: 'Could not reach the server.', variant: 'destructive' });
        } finally {
            setInstalling(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemove = async (pack: InstalledAmbience) => {
        const confirmed = await confirm(
            `Remove the ambience pack "${pack.name}"? You can reinstall it later from its zip file.`,
            { title: 'Remove ambience pack', confirmText: 'Remove' }
        );
        if (!confirmed) return;
        setRemovingId(pack.id);
        try {
            const response = await fetch(`/api/ambience/${encodeURIComponent(pack.id)}`, { method: 'DELETE' });
            const payload = await response.json() as { success: boolean; error?: string };
            if (!payload.success) {
                toast({ title: 'Remove failed', description: payload.error || 'Unknown error.', variant: 'destructive' });
                return;
            }
            if (activeId === pack.id) {
                const fallback = packs.find((entry) => entry.id === DEFAULT_AMBIENCE_ID);
                if (fallback) handleActivate(fallback);
            }
            toast({ title: 'Ambience removed', description: `"${pack.name}" was uninstalled.`, variant: 'success' });
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
                        <Sparkles size={16} className="text-primary" />
                        Dashboard Ambience
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        Subtle animated backgrounds for the hub only — the editor stays untouched.
                        Packs are downloaded separately and installed from a .zip, just like themes.
                    </p>
                </div>
                <button
                    onClick={() => void refresh()}
                    aria-label="Refresh ambience list"
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-border hover:bg-secondary transition-colors"
                >
                    <RefreshCcw size={13} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                    <Loader2 size={14} className="animate-spin" /> Loading ambience packs…
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {packs.map((pack) => {
                        const isActive = activeId === pack.id;
                        const previewUrl = pack.preview ? pack.baseUrl + pack.preview : null;
                        return (
                            <div
                                key={pack.id}
                                className={`relative rounded-xl border text-left transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-secondary'}`}
                            >
                                <button
                                    type="button"
                                    aria-label={`Activate ambience ${pack.name}`}
                                    aria-pressed={isActive}
                                    onClick={() => handleActivate(pack)}
                                    className="w-full px-3 py-2 text-left"
                                >
                                    <div className="mb-2 h-14 rounded-md border border-border/50 bg-secondary/40 overflow-hidden flex items-center justify-center">
                                        {previewUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full bg-background" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isActive && <Check size={12} className="text-primary shrink-0" />}
                                        <span className="text-xs font-semibold text-foreground truncate">{pack.name}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground line-clamp-2">
                                        {pack.description || 'Ambience pack.'}
                                    </div>
                                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                        {pack.source === 'builtin' ? 'Built-in' : `Installed${pack.version ? ` · v${pack.version}` : ''}`}
                                    </div>
                                </button>
                                {pack.source === 'installed' && (
                                    <button
                                        type="button"
                                        aria-label={`Remove ambience ${pack.name}`}
                                        onClick={() => void handleRemove(pack)}
                                        disabled={removingId === pack.id}
                                        className="absolute right-1.5 top-1.5 h-6 w-6 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors"
                                    >
                                        {removingId === pack.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
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
                    {installing ? 'Installing…' : 'Install ambience from .zip…'}
                </button>
                <a
                    href="https://geekatplay.gumroad.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1.5"
                >
                    ♥ Get more animations &amp; support Vlad
                </a>
                <p className="text-[11px] text-muted-foreground">
                    Optional — purchases support development. Effects stay muted and pause in background tabs.
                </p>
            </div>
        </section>
    );
}

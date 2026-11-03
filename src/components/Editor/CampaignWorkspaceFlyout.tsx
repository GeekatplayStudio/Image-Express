'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Layers, Package, Pencil, Trash2, X } from 'lucide-react';

import { useI18n } from '@/providers/I18nProvider';
import type { CampaignVariant } from '@/components/Editor/mediaOverlayTypes';
import type { CampaignWorkspaceApi } from '@/components/Editor/useMediaOverlayCampaignVariants';

type CampaignWorkspaceFlyoutProps = {
    open: boolean;
    onClose: () => void;
    workspace: CampaignWorkspaceApi;
    /** Whether the active media-overlay frame can be snapshotted right now. */
    canSnapshot: boolean;
};

/**
 * The campaign workspace: every variant snapshot of this page, as a flyout
 * on the right edge. It is workspace chrome (opened from the Export menu),
 * so it sits in the panel tier, above the toolbar rails and below popups.
 */
export default function CampaignWorkspaceFlyout({ open, onClose, workspace, canSnapshot }: CampaignWorkspaceFlyoutProps) {
    const { t } = useI18n();
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, open]);

    if (!open || typeof document === 'undefined') return null;

    const startRename = (variant: CampaignVariant) => {
        setRenamingId(variant.id);
        setDraftName(variant.name);
    };
    const commitRename = () => {
        if (renamingId) workspace.handleRenameCampaignVariant(renamingId, draftName);
        setRenamingId(null);
    };

    const variants = workspace.campaignVariants;

    return createPortal(
        <aside
            data-testid="campaign-workspace-flyout"
            role="dialog"
            aria-label={t('campaignWorkspace.title')}
            className="fixed right-0 top-16 bottom-0 z-[150] flex w-[340px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right-4 duration-200"
        >
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers size={14} className="text-primary" />{t('campaignWorkspace.title')}</h3>
                <button type="button" onClick={onClose} aria-label={t('campaignWorkspace.close')} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={16} /></button>
            </header>

            <div className="flex shrink-0 gap-2 border-b border-border p-3">
                <button
                    type="button"
                    onClick={() => workspace.handleConvertActiveMediaOverlayFrameToVariant()}
                    disabled={!canSnapshot}
                    className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-40"
                    title={canSnapshot ? undefined : t('campaignWorkspace.snapshotHint')}
                >
                    {t('campaignWorkspace.snapshotActiveFrame')}
                </button>
                <button
                    type="button"
                    onClick={() => { void workspace.handleExportAllCampaignVariants(); }}
                    disabled={variants.length === 0 || workspace.isExportingCampaign}
                    className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                    <Package size={14} />{t('campaignWorkspace.exportAll')}
                </button>
            </div>

            <ul className="flex-1 overflow-y-auto p-2 space-y-1">
                {variants.length === 0 && (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">{t('campaignWorkspace.empty')}</li>
                )}
                {variants.map((variant) => {
                    const active = variant.id === workspace.activeCampaignVariantId;
                    return (
                        <li
                            key={variant.id}
                            data-testid="campaign-variant-row"
                            data-active={active ? 'true' : 'false'}
                            className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 ${active ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:bg-secondary/50'}`}
                        >
                            <button type="button" onClick={() => workspace.handleSelectCampaignVariant(variant.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                {variant.thumbnail
                                    // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail, no optimisation possible
                                    ? <img src={variant.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover bg-secondary" />
                                    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground"><Layers size={14} /></div>}
                                <div className="min-w-0 flex-1">
                                    {renamingId === variant.id ? (
                                        <input
                                            autoFocus
                                            value={draftName}
                                            aria-label={t('campaignWorkspace.rename')}
                                            onChange={(event) => setDraftName(event.target.value)}
                                            onBlur={commitRename}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
                                                if (event.key === 'Escape') { event.preventDefault(); setRenamingId(null); }
                                            }}
                                            onClick={(event) => event.stopPropagation()}
                                            className="h-6 w-full rounded border border-primary/40 bg-background px-1 text-xs"
                                        />
                                    ) : (
                                        <div className="truncate text-xs font-medium">{variant.name}</div>
                                    )}
                                    <div className="truncate text-[10px] text-muted-foreground">
                                        {variant.framePreset} · {Math.round(variant.bounds.width)}×{Math.round(variant.bounds.height)} · {variant.exportProfile.format.toUpperCase()}
                                    </div>
                                </div>
                            </button>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                                <button type="button" onClick={() => startRename(variant)} title={t('campaignWorkspace.rename')} aria-label={t('campaignWorkspace.rename')} className="rounded p-1 hover:bg-secondary"><Pencil size={13} /></button>
                                <button type="button" onClick={() => workspace.handleDuplicateCampaignVariant(variant.id)} title={t('campaignWorkspace.duplicate')} aria-label={t('campaignWorkspace.duplicate')} className="rounded p-1 hover:bg-secondary"><Copy size={13} /></button>
                                <button type="button" onClick={() => { void workspace.handleExportCampaignVariant(variant.id); }} disabled={workspace.isExportingCampaign} title={t('campaignWorkspace.exportOne')} aria-label={t('campaignWorkspace.exportOne')} className="rounded p-1 hover:bg-secondary disabled:opacity-40"><Download size={13} /></button>
                                <button type="button" onClick={() => workspace.handleRemoveCampaignVariant(variant.id)} title={t('campaignWorkspace.delete')} aria-label={t('campaignWorkspace.delete')} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 size={13} /></button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <footer className="shrink-0 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                {t('campaignWorkspace.footerHint')}
            </footer>
        </aside>,
        document.body,
    );
}

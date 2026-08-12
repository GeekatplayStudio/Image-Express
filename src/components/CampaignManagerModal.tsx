'use client';

import React, { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import {
    CheckCircle2,
    Eye,
    Loader2,
    Megaphone,
    Plus,
    Trash2,
    Wand2,
    X,
} from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import { useI18n } from '@/providers/I18nProvider';
import {
    extractCanvasMetadata,
    type BrandAuditReport,
    type BrandViolation,
} from '@/lib/brand/brandAuditEngine';
import {
    autoFixAllCampaignViolationsOnCanvas,
    autoFixCampaignViolationOnCanvas,
    buildCampaignAuditInstructions,
    campaignToBrandProfile,
    runHeuristicCampaignAudit,
} from '@/lib/campaign/campaignAuditEngine';
import {
    createEmptyCampaign,
    deleteCampaign,
    loadCampaigns,
    pushCampaignDeleteToServer,
    pushCampaignToServer,
    saveCampaign,
    setActiveCampaignId,
    syncCampaignsFromServer,
    type CampaignAsset,
    type CampaignProfile,
    type CampaignReferenceImage,
} from '@/lib/campaign/campaignProfile';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
import { loadGenerativePreferences } from '@/lib/generative-preferences';

interface CampaignManagerModalProps {
    canvas?: fabric.Canvas | null;
    onClose: () => void;
}

const SEVERITY_COLORS: Record<BrandViolation['severity'], string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#38bdf8',
};

const OVERLAY_ID_PREFIX = '__campaign_audit_overlay__';

// Campaigns are plain JSON, so a JSON round-trip is a full deep clone
// (structuredClone is missing from the jsdom test environment).
const cloneCampaign = (campaign: CampaignProfile): CampaignProfile => (
    JSON.parse(JSON.stringify(campaign)) as CampaignProfile
);

const readFileAsDataUrl = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed')));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
    })
);

/**
 * The Campaign Manager: create and store multiple campaigns (fonts, palette,
 * assets, reference images, plain-language requirements), then verify the
 * canvas against a selected campaign — report-only, or auto-fix what the
 * engine can fix mechanically.
 */
export default function CampaignManagerModal({ canvas, onClose }: CampaignManagerModalProps) {
    const { t } = useI18n();
    useEscapeKey(onClose);

    const [campaigns, setCampaigns] = useState<CampaignProfile[]>(loadCampaigns);
    const [selectedId, setSelectedId] = useState<string | null>(() => loadCampaigns()[0]?.id ?? null);
    const [draft, setDraft] = useState<CampaignProfile | null>(() => {
        const first = loadCampaigns()[0];
        return first ? cloneCampaign(first) : null;
    });
    const [activeTab, setActiveTab] = useState<'setup' | 'verify'>('setup');

    const [newFont, setNewFont] = useState('');
    const [newColor, setNewColor] = useState('#2563eb');

    const [autoFixMode, setAutoFixMode] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditReport, setAuditReport] = useState<BrandAuditReport | null>(null);
    const [fixedCount, setFixedCount] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const selectCampaign = useCallback((campaign: CampaignProfile) => {
        setSelectedId(campaign.id);
        setDraft(cloneCampaign(campaign));
        setActiveCampaignId(campaign.id);
        setAuditReport(null);
        setFixedCount(null);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void syncCampaignsFromServer().then((synced) => {
            if (cancelled || !synced) return;
            setCampaigns(synced.campaigns);
            if (synced.activeCampaign) {
                setSelectedId(synced.activeCampaign.id);
                setDraft(cloneCampaign(synced.activeCampaign));
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleCreate = () => {
        const campaign = createEmptyCampaign(t('campaign.newCampaignName'));
        const next = saveCampaign(campaign);
        setCampaigns(next);
        pushCampaignToServer({ campaign });
        selectCampaign(campaign);
        setActiveTab('setup');
    };

    const handleDelete = (id: string) => {
        const next = deleteCampaign(id);
        setCampaigns(next);
        pushCampaignDeleteToServer(id);
        if (selectedId === id) {
            if (next.length > 0) {
                selectCampaign(next[0]);
            } else {
                setSelectedId(null);
                setDraft(null);
            }
        }
    };

    const handleSaveDraft = () => {
        if (!draft || !draft.name.trim()) {
            setErrorMessage(t('campaign.error.nameRequired'));
            return;
        }
        setErrorMessage('');
        const next = saveCampaign(draft);
        setCampaigns(next);
        pushCampaignToServer({ campaign: draft });
        setStatusMessage(t('campaign.saved'));
        setTimeout(() => setStatusMessage(''), 2500);
    };

    const updateDraft = (updates: Partial<CampaignProfile>) => {
        setDraft((current) => (current ? { ...current, ...updates } : current));
    };

    const handleAddUpload = async (
        file: File | undefined,
        kind: 'asset' | 'reference',
    ) => {
        if (!file || !draft) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const name = file.name.replace(/\.[^.]+$/, '');
            if (kind === 'asset') {
                const asset: CampaignAsset = { id: `casset-${Date.now()}`, name, type: 'image', dataUrl };
                updateDraft({ assets: [...draft.assets, asset] });
            } else {
                const ref: CampaignReferenceImage = { id: `cref-${Date.now()}`, name, dataUrl };
                updateDraft({ referenceImages: [...draft.referenceImages, ref] });
            }
        } catch {
            setErrorMessage(t('campaign.error.uploadFailed'));
        }
    };

    // --- Canvas overlays ---

    const removeOverlays = useCallback(() => {
        if (!canvas) return;
        canvas.getObjects()
            .filter((o) => String(o.get('id') || '').startsWith(OVERLAY_ID_PREFIX))
            .forEach((o) => canvas.remove(o));
        canvas.requestRenderAll();
    }, [canvas]);

    const highlightViolations = useCallback((violations: BrandViolation[]) => {
        if (!canvas) return;
        removeOverlays();
        for (const violation of violations) {
            if (!violation.boundingBox) continue;
            const color = SEVERITY_COLORS[violation.severity] || '#ef4444';
            const rect = new fabric.Rect({
                ...violation.boundingBox,
                fill: `${color}26`,
                stroke: color,
                strokeWidth: 2,
                strokeDashArray: [6, 4],
                selectable: false,
                evented: false,
            });
            rect.set('id', `${OVERLAY_ID_PREFIX}${violation.id}`);
            canvas.add(rect);
        }
        canvas.requestRenderAll();
    }, [canvas, removeOverlays]);

    useEffect(() => () => {
        removeOverlays();
    }, [removeOverlays]);

    // --- Verify ---

    const handleVerify = async () => {
        if (!canvas || !draft) return;
        setIsAuditing(true);
        setErrorMessage('');
        setAuditReport(null);
        setFixedCount(null);
        removeOverlays();

        const metadata = extractCanvasMetadata(canvas);
        let report: BrandAuditReport;
        try {
            let dataUrl = '';
            try {
                dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
            } catch {
                // metadata-only audit when export fails
            }
            const prefs = loadLocalAiPreferences();
            const generative = loadGenerativePreferences();
            const externalProvider = generative.defaultProvider === 'openai' || generative.defaultProvider === 'google'
                ? generative.defaultProvider
                : null;
            const externalKey = externalProvider ? localStorage.getItem(`${externalProvider}_api_key`) || '' : '';

            const response = await fetch('/api/ai/brand-manager/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    metadata,
                    brandProfile: campaignToBrandProfile(draft),
                    baseUrl: prefs.ollamaBaseUrl,
                    model: externalProvider && externalKey ? undefined : prefs.ollamaModel,
                    imageDataUrl: dataUrl,
                    extraInstructions: buildCampaignAuditInstructions(draft),
                    ...(externalProvider && externalKey
                        ? { provider: externalProvider, apiKey: externalKey }
                        : {}),
                }),
            });
            const data = await response.json() as { success?: boolean; report?: BrandAuditReport };
            report = (response.ok && data.success && data.report)
                ? { ...data.report, profileName: draft.name }
                : runHeuristicCampaignAudit(metadata, draft);
        } catch {
            report = runHeuristicCampaignAudit(metadata, draft);
        }

        if (autoFixMode && report.violations.length > 0) {
            const fixed = autoFixAllCampaignViolationsOnCanvas(report, canvas, draft);
            setFixedCount(fixed);
            report = runHeuristicCampaignAudit(extractCanvasMetadata(canvas), draft);
        }

        setAuditReport(report);
        highlightViolations(report.violations);
        setIsAuditing(false);
    };

    const handleFixOne = (violation: BrandViolation) => {
        if (!canvas || !draft) return;
        if (!autoFixCampaignViolationOnCanvas(violation, canvas, draft)) {
            setErrorMessage(t('campaign.error.noAutoFix'));
            return;
        }
        const report = runHeuristicCampaignAudit(extractCanvasMetadata(canvas), draft);
        setAuditReport(report);
        highlightViolations(report.violations);
    };

    const inputClass = 'w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="font-semibold text-sm flex items-center gap-2">
                        <Megaphone size={16} className="text-primary" />
                        {t('campaign.title')}
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1 text-xs bg-secondary rounded p-0.5">
                            <button
                                type="button"
                                onClick={() => setActiveTab('setup')}
                                className={`px-3 py-1 rounded transition-colors ${activeTab === 'setup' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                            >
                                {t('campaign.tab.setup')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('verify')}
                                className={`px-3 py-1 rounded transition-colors ${activeTab === 'verify' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                            >
                                {t('campaign.tab.verify')}
                            </button>
                        </div>
                        <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1 rounded hover:bg-secondary transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Campaign list */}
                    <aside className="w-52 shrink-0 border-r border-border p-3 space-y-1 overflow-y-auto">
                        <button
                            type="button"
                            onClick={handleCreate}
                            className="w-full h-8 flex items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs font-semibold hover:bg-secondary transition-colors"
                        >
                            <Plus size={13} /> {t('campaign.newCampaign')}
                        </button>
                        {campaigns.map((campaign) => (
                            <div
                                key={campaign.id}
                                className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-xs cursor-pointer ${selectedId === campaign.id ? 'bg-primary/10 text-primary border border-primary/40' : 'hover:bg-secondary'}`}
                                onClick={() => selectCampaign(campaign)}
                            >
                                <span className="truncate">{campaign.name}</span>
                                <button
                                    type="button"
                                    aria-label={t('campaign.deleteCampaign')}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleDelete(campaign.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-secondary transition-opacity"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        {campaigns.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground px-1 pt-2">{t('campaign.emptyList')}</p>
                        ) : null}
                    </aside>

                    {/* Main pane */}
                    <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
                        {!draft ? (
                            <p className="text-xs text-muted-foreground">{t('campaign.selectOrCreate')}</p>
                        ) : activeTab === 'setup' ? (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.name')}</label>
                                        <input className={inputClass} value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.description')}</label>
                                        <input className={inputClass} value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} placeholder={t('campaign.descriptionPlaceholder')} />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold mb-1.5 block">{t('campaign.parameters')}</label>
                                    <textarea
                                        className="w-full min-h-24 px-3 py-2 rounded-md bg-background border border-border focus:border-primary outline-none text-xs resize-y"
                                        value={draft.parameters}
                                        onChange={(e) => updateDraft({ parameters: e.target.value })}
                                        placeholder={t('campaign.parametersPlaceholder')}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.fonts')}</label>
                                        <div className="flex gap-1">
                                            <input className={inputClass} value={newFont} onChange={(e) => setNewFont(e.target.value)} placeholder="Inter" />
                                            <button
                                                type="button"
                                                aria-label={t('campaign.addFont')}
                                                onClick={() => {
                                                    const font = newFont.trim();
                                                    if (font && !draft.fonts.includes(font)) updateDraft({ fonts: [...draft.fonts, font] });
                                                    setNewFont('');
                                                }}
                                                className="h-9 px-2 rounded-md border border-border text-xs hover:bg-secondary"
                                            >
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {draft.fonts.map((font) => (
                                                <span key={font} className="inline-flex items-center gap-1 text-[11px] bg-secondary rounded px-1.5 py-0.5">
                                                    {font}
                                                    <button type="button" aria-label={`${t('common.delete')} ${font}`} onClick={() => updateDraft({ fonts: draft.fonts.filter((f) => f !== font) })}><X size={10} /></button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.colors')}</label>
                                        <div className="flex gap-1 items-center">
                                            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-12 rounded-md border border-border bg-background cursor-pointer" aria-label={t('campaign.pickColor')} />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!draft.colors.includes(newColor)) updateDraft({ colors: [...draft.colors, newColor] });
                                                }}
                                                className="h-9 px-2 rounded-md border border-border text-xs hover:bg-secondary"
                                            >
                                                {t('campaign.addColor')}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {draft.colors.map((color) => (
                                                <span key={color} className="inline-flex items-center gap-1 text-[11px] bg-secondary rounded px-1.5 py-0.5">
                                                    <span className="inline-block w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: color }} />
                                                    {color}
                                                    <button type="button" aria-label={`${t('common.delete')} ${color}`} onClick={() => updateDraft({ colors: draft.colors.filter((c) => c !== color) })}><X size={10} /></button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.assets')}</label>
                                        <input type="file" accept="image/*" className="text-[11px]" onChange={(e) => void handleAddUpload(e.target.files?.[0], 'asset')} />
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {draft.assets.map((asset) => (
                                                <div key={asset.id} className="relative group">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={asset.dataUrl} alt={asset.name} title={asset.name} className="w-14 h-14 object-cover rounded border border-border" />
                                                    <button type="button" aria-label={`${t('common.delete')} ${asset.name}`} onClick={() => updateDraft({ assets: draft.assets.filter((a) => a.id !== asset.id) })} className="absolute -top-1 -right-1 bg-card border border-border rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X size={10} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1.5 block">{t('campaign.referenceImages')}</label>
                                        <input type="file" accept="image/*" className="text-[11px]" onChange={(e) => void handleAddUpload(e.target.files?.[0], 'reference')} />
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {draft.referenceImages.map((ref) => (
                                                <div key={ref.id} className="relative group">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={ref.dataUrl} alt={ref.name} title={ref.name} className="w-14 h-14 object-cover rounded border border-border" />
                                                    <button type="button" aria-label={`${t('common.delete')} ${ref.name}`} onClick={() => updateDraft({ referenceImages: draft.referenceImages.filter((r) => r.id !== ref.id) })} className="absolute -top-1 -right-1 bg-card border border-border rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X size={10} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-muted-foreground">
                                        {t('campaign.verifyAgainst', { name: draft.name })}
                                    </p>
                                    <label className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" checked={autoFixMode} onChange={(e) => setAutoFixMode(e.target.checked)} className="accent-primary" />
                                        {t('campaign.autoFixMode')}
                                    </label>
                                </div>

                                {auditReport ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className={`font-semibold ${auditReport.status === 'pass' ? 'text-green-500' : auditReport.status === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>
                                                {auditReport.overallScore}% — {auditReport.status.toUpperCase()}
                                            </span>
                                            {fixedCount !== null ? (
                                                <span className="text-green-500 flex items-center gap-1"><Wand2 size={12} /> {t('campaign.fixedCount', { count: String(fixedCount) })}</span>
                                            ) : null}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">{auditReport.summary}</p>
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                            {auditReport.violations.map((violation) => (
                                                <div key={violation.id} className="border border-border rounded-md p-2 text-[11px] flex items-start justify-between gap-2">
                                                    <div>
                                                        <span className="font-semibold" style={{ color: SEVERITY_COLORS[violation.severity] }}>
                                                            [{violation.severity}]
                                                        </span>{' '}
                                                        {violation.message}
                                                        <div className="text-muted-foreground mt-0.5">{violation.suggestion}</div>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <button type="button" title={t('campaign.highlight')} onClick={() => highlightViolations([violation])} className="p-1 rounded border border-border hover:bg-secondary"><Eye size={12} /></button>
                                                        <button type="button" title={t('campaign.fixThis')} onClick={() => handleFixOne(violation)} className="p-1 rounded border border-border hover:bg-secondary"><Wand2 size={12} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                            {auditReport.violations.length === 0 ? (
                                                <p className="text-green-500 text-xs flex items-center gap-1"><CheckCircle2 size={13} /> {t('campaign.allCompliant')}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">{t('campaign.verifyHint')}</p>
                                )}
                            </>
                        )}

                        {statusMessage ? <p className="text-[11px] text-green-500">{statusMessage}</p> : null}
                        {errorMessage ? <p className="text-[11px] text-red-500">{errorMessage}</p> : null}
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
                    <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border text-xs font-semibold hover:bg-secondary transition-colors">
                        {t('common.close')}
                    </button>
                    {draft && activeTab === 'setup' ? (
                        <button type="button" onClick={handleSaveDraft} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                            {t('campaign.save')}
                        </button>
                    ) : null}
                    {draft && activeTab === 'verify' ? (
                        <button
                            type="button"
                            onClick={() => void handleVerify()}
                            disabled={isAuditing || !canvas}
                            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {isAuditing ? (
                                <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {t('campaign.verifying')}</span>
                            ) : autoFixMode ? t('campaign.verifyAndFix') : t('campaign.verifyReport')}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

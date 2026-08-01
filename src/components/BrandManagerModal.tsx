import React, { useCallback, useEffect, useState } from 'react';
import * as fabric from 'fabric';
import {
    AlertTriangle,
    CheckCircle2,
    Eye,
    FolderKanban,
    Loader2,
    Palette,
    Plus,
    ShieldCheck,
    Type,
    X,
} from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    autoFixAllViolationsOnCanvas,
    autoFixViolationOnCanvas,
    BrandAuditReport,
    BrandViolation,
    extractCanvasMetadata,
    runHeuristicBrandAudit,
} from '@/lib/brand/brandAuditEngine';
import {
    ApprovedAsset,
    BrandProfile,
    DEFAULT_BRAND_PROFILE,
    getActiveBrandProfile,
    loadBrandProfiles,
    pushBrandProfileToServer,
    saveBrandProfile,
    setActiveBrandProfileId,
    syncBrandProfilesFromServer,
} from '@/lib/brand/brandProfile';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
import { loadGenerativePreferences } from '@/lib/generative-preferences';
import { useI18n } from '@/providers/I18nProvider';

interface BrandManagerModalProps {
    isOpen?: boolean;
    canvas?: fabric.Canvas | null;
    onClose: () => void;
}

export default function BrandManagerModal({
    isOpen = true,
    canvas,
    onClose,
}: BrandManagerModalProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'audit' | 'setup'>('audit');
    const [profiles, setProfiles] = useState<BrandProfile[]>([DEFAULT_BRAND_PROFILE]);
    const [activeProfile, setActiveProfile] = useState<BrandProfile>(DEFAULT_BRAND_PROFILE);

    const [isAuditing, setIsAuditing] = useState(false);
    const [auditReport, setAuditReport] = useState<BrandAuditReport | null>(null);
    const [selectedViolation, setSelectedViolation] = useState<BrandViolation | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Setup tab form state
    const [formName, setFormName] = useState('');
    const [formPrimaryColor, setFormPrimaryColor] = useState('');
    const [formSecondaryColor, setFormSecondaryColor] = useState('');
    const [formAccentColor, setFormAccentColor] = useState('');
    const [formPrimaryFont, setFormPrimaryFont] = useState('');
    const [formAllowedFonts, setFormAllowedFonts] = useState('');
    const [formAllowedColors, setFormAllowedColors] = useState('');
    const [formMargin, setFormMargin] = useState(20);
    const [formLogoPosition, setFormLogoPosition] = useState<BrandProfile['logo']['requiredPosition']>('top-left');
    const [formLogoDataUrl, setFormLogoDataUrl] = useState('');
    const [formAssets, setFormAssets] = useState<ApprovedAsset[]>([]);
    const [newAssetType, setNewAssetType] = useState<ApprovedAsset['type']>('shape');

    useEscapeKey(onClose, { enabled: isOpen });

    const applyProfileToForm = useCallback((active: BrandProfile) => {
        setFormName(active.name);
        setFormPrimaryColor(active.palette.primary);
        setFormSecondaryColor(active.palette.secondary);
        setFormAccentColor(active.palette.accent);
        setFormPrimaryFont(active.typography.primaryFont);
        setFormAllowedFonts(active.typography.allowedFonts.join(', '));
        setFormAllowedColors(active.palette.allowedColors.join(', '));
        setFormMargin(active.layout.minMargin);
        setFormLogoPosition(active.logo.requiredPosition);
        setFormLogoDataUrl(active.logo.logoAssetUrl || '');
        setFormAssets(active.assets || []);
    }, []);

    // Refresh profiles on open: local cache first, then the server store
    // (shared with MCP clients) as source of truth once reachable.
    useEffect(() => {
        if (!isOpen) return;
        const loaded = loadBrandProfiles();
        setProfiles(loaded);
        const active = getActiveBrandProfile();
        setActiveProfile(active);
        applyProfileToForm(active);

        let cancelled = false;
        void syncBrandProfilesFromServer().then((synced) => {
            if (!synced || cancelled) return;
            setProfiles(synced.profiles);
            setActiveProfile(synced.activeProfile);
            applyProfileToForm(synced.activeProfile);
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen, applyProfileToForm]);

    const SEVERITY_COLORS: Record<BrandViolation['severity'], string> = {
        high: '#ef4444',
        medium: '#f59e0b',
        low: '#38bdf8',
    };

    const removeOverlayObjects = useCallback(() => {
        if (!canvas) return;
        const overlays = canvas.getObjects().filter((o) =>
            String(o.get('id') || '').startsWith('__brand_audit_overlay')
        );
        overlays.forEach((o) => canvas.remove(o));
    }, [canvas]);

    const addOverlayRect = useCallback((violation: BrandViolation, suffix: string) => {
        if (!canvas || !violation.boundingBox) return;
        const { left, top, width, height } = violation.boundingBox;
        const color = SEVERITY_COLORS[violation.severity] || '#ef4444';
        const highlightRect = new fabric.Rect({
            left,
            top,
            width,
            height,
            fill: `${color}26`,
            stroke: color,
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            selectable: false,
            evented: false,
        });
        highlightRect.set('id', `__brand_audit_overlay__${suffix}`);
        canvas.add(highlightRect);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas]);

    // Canvas overlay highlight helpers
    const highlightViolationOnCanvas = useCallback((violation: BrandViolation) => {
        if (!canvas || !violation.boundingBox) return;
        setSelectedViolation(violation);
        removeOverlayObjects();
        addOverlayRect(violation, violation.id);
        canvas.requestRenderAll();
    }, [canvas, removeOverlayObjects, addOverlayRect]);

    const highlightAllViolationsOnCanvas = useCallback((violations: BrandViolation[]) => {
        if (!canvas) return;
        removeOverlayObjects();
        violations.filter((v) => v.boundingBox).forEach((v) => addOverlayRect(v, v.id));
        canvas.requestRenderAll();
    }, [canvas, removeOverlayObjects, addOverlayRect]);

    const clearCanvasHighlight = useCallback(() => {
        if (!canvas) return;
        removeOverlayObjects();
        canvas.requestRenderAll();
        setSelectedViolation(null);
    }, [canvas, removeOverlayObjects]);

    const handleRunAudit = async () => {
        if (!canvas) {
            setErrorMessage('Canvas is not initialized.');
            return;
        }

        setIsAuditing(true);
        setErrorMessage('');
        setAuditReport(null);
        clearCanvasHighlight();

        try {
            const metadata = extractCanvasMetadata(canvas);
            const prefs = loadLocalAiPreferences();

            let dataUrl = '';
            try {
                dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
            } catch {
                // ignore image export errors for local metadata audit
            }

            // Use the configured external VLM (OpenAI/Gemini) when it is the
            // default generative provider and a key is saved; otherwise Ollama.
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
                    brandProfile: activeProfile,
                    baseUrl: prefs.ollamaBaseUrl,
                    model: externalProvider && externalKey ? undefined : prefs.ollamaModel,
                    imageDataUrl: dataUrl,
                    ...(externalProvider && externalKey
                        ? { provider: externalProvider, apiKey: externalKey }
                        : {}),
                }),
            });

            const data = await response.json() as { success?: boolean; report?: BrandAuditReport; message?: string };
            if (!response.ok || !data.success || !data.report) {
                // Fallback to local heuristic engine directly
                const heuristicReport = runHeuristicBrandAudit(metadata, activeProfile);
                setAuditReport(heuristicReport);
            } else {
                setAuditReport(data.report);
            }
        } catch (err) {
            // Local fallback
            const metadata = extractCanvasMetadata(canvas);
            const heuristicReport = runHeuristicBrandAudit(metadata, activeProfile);
            setAuditReport(heuristicReport);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleAutoFix = (violation: BrandViolation) => {
        if (!canvas) return;
        const fixed = autoFixViolationOnCanvas(violation, canvas, activeProfile);
        if (!fixed) {
            setErrorMessage(`"${violation.message}" has no automatic fix — adjust the layer manually.`);
            return;
        }
        clearCanvasHighlight();
        // Re-audit locally so the report reflects the corrected canvas
        const metadata = extractCanvasMetadata(canvas);
        setAuditReport(runHeuristicBrandAudit(metadata, activeProfile));
    };

    const handleAutoFixAll = () => {
        if (!canvas || !auditReport) return;
        autoFixAllViolationsOnCanvas(auditReport, canvas, activeProfile);
        clearCanvasHighlight();
        const metadata = extractCanvasMetadata(canvas);
        setAuditReport(runHeuristicBrandAudit(metadata, activeProfile));
    };

    const handleLogoUpload = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') setFormLogoDataUrl(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleAssetUpload = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') return;
            const asset: ApprovedAsset = {
                id: `asset-${Date.now()}`,
                name: file.name.replace(/\.[^.]+$/, ''),
                type: newAssetType,
                url: reader.result,
            };
            setFormAssets((prev) => [...prev, asset]);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveAsset = (assetId: string) => {
        setFormAssets((prev) => prev.filter((a) => a.id !== assetId));
    };

    const handleSaveSetup = () => {
        const updated: BrandProfile = {
            ...activeProfile,
            name: formName || 'Custom Brand Kit',
            palette: {
                ...activeProfile.palette,
                primary: formPrimaryColor || '#2563eb',
                secondary: formSecondaryColor || '#0f172a',
                accent: formAccentColor || '#f59e0b',
                allowedColors: formAllowedColors
                    ? formAllowedColors.split(',').map((c) => c.trim()).filter(Boolean)
                    : [formPrimaryColor, formSecondaryColor, formAccentColor, '#ffffff', '#000000'].filter(Boolean),
            },
            typography: {
                ...activeProfile.typography,
                primaryFont: formPrimaryFont || 'Inter',
                allowedFonts: formAllowedFonts
                    ? formAllowedFonts.split(',').map((f) => f.trim()).filter(Boolean)
                    : [formPrimaryFont, 'Inter', 'Roboto', 'Arial'].filter(Boolean),
            },
            logo: {
                ...activeProfile.logo,
                requiredPosition: formLogoPosition,
                logoAssetUrl: formLogoDataUrl || activeProfile.logo.logoAssetUrl,
            },
            layout: {
                ...activeProfile.layout,
                minMargin: Number(formMargin) || 20,
            },
            assets: formAssets,
            updatedAt: new Date().toISOString(),
        };

        const nextProfiles = saveBrandProfile(updated);
        pushBrandProfileToServer({ profile: updated });
        setProfiles(nextProfiles);
        setActiveProfile(updated);
        setActiveTab('audit');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-foreground">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-muted/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">AI Brand Manager</h2>
                            <p className="text-xs text-muted-foreground">
                                Brand Kit setup & VLM compliance audit with visual canvas highlights
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            clearCanvasHighlight();
                            onClose();
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title={t('common.close') || 'Close'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Profile Selector & Tabs */}
                <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/50 bg-secondary/20">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Active Kit:</span>
                        <select
                            value={activeProfile.id}
                            onChange={(e) => {
                                const selected = profiles.find((p) => p.id === e.target.value);
                                if (selected) {
                                    setActiveProfile(selected);
                                    setActiveBrandProfileId(selected.id);
                                    pushBrandProfileToServer({ activeProfileId: selected.id });
                                    applyProfileToForm(selected);
                                }
                            }}
                            className="text-xs font-medium bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} {p.isDefault ? '(Default)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                activeTab === 'audit'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Compliance Auditor
                        </button>
                        <button
                            onClick={() => setActiveTab('setup')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                activeTab === 'setup'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Brand Kit Setup
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {errorMessage && (
                        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
                            <AlertTriangle size={14} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {activeTab === 'audit' && (
                        <div className="space-y-6">
                            {/* Run Audit Trigger Card */}
                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/60">
                                <div>
                                    <h3 className="text-sm font-semibold">Inspect Active Canvas</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Audits fonts, palette adherence, contrast, and layout safety against "{activeProfile.name}".
                                    </p>
                                </div>
                                <button
                                    onClick={handleRunAudit}
                                    disabled={isAuditing}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
                                >
                                    {isAuditing ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Auditing Canvas...</span>
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck size={14} />
                                            <span>Run Compliance Check</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Audit Results */}
                            {auditReport && (
                                <div className="space-y-4 animate-in fade-in duration-300">
                                    {/* Score Header */}
                                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg border-2 ${
                                                    auditReport.status === 'pass'
                                                        ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                                                        : auditReport.status === 'warning'
                                                        ? 'border-amber-500 text-amber-500 bg-amber-500/10'
                                                        : 'border-rose-500 text-rose-500 bg-rose-500/10'
                                                }`}
                                            >
                                                {auditReport.overallScore}%
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold">Compliance Rating</span>
                                                    <span
                                                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                                            auditReport.status === 'pass'
                                                                ? 'bg-emerald-500/20 text-emerald-500'
                                                                : auditReport.status === 'warning'
                                                                ? 'bg-amber-500/20 text-amber-500'
                                                                : 'bg-rose-500/20 text-rose-500'
                                                        }`}
                                                    >
                                                        {auditReport.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {auditReport.summary}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Violations List */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                Detected Issues ({auditReport.violations.length})
                                            </h4>
                                            {auditReport.violations.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => highlightAllViolationsOnCanvas(auditReport.violations)}
                                                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-secondary hover:bg-accent transition-colors"
                                                        title="Show every violation bounding box on the canvas, color-coded by severity"
                                                    >
                                                        <Eye size={12} />
                                                        <span>Highlight All</span>
                                                    </button>
                                                    <button
                                                        onClick={handleAutoFixAll}
                                                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                                                        title="Automatically correct all mechanically fixable violations"
                                                    >
                                                        <ShieldCheck size={12} />
                                                        <span>Auto-Fix All</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {auditReport.violations.length === 0 ? (
                                            <div className="p-6 text-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                                                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
                                                No brand compliance violations detected!
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {auditReport.violations.map((v) => (
                                                    <div
                                                        key={v.id}
                                                        className={`p-3 rounded-lg border text-xs transition-colors flex items-start justify-between gap-3 ${
                                                            selectedViolation?.id === v.id
                                                                ? 'border-primary bg-primary/5'
                                                                : 'border-border/80 bg-card hover:bg-accent/40'
                                                        }`}
                                                    >
                                                        <div className="space-y-1 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold">{v.message}</span>
                                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                                                    {v.category}
                                                                </span>
                                                            </div>
                                                            <p className="text-muted-foreground text-[11px]">
                                                                💡 {v.suggestion}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-col gap-1 shrink-0">
                                                            {v.boundingBox && (
                                                                <button
                                                                    onClick={() => highlightViolationOnCanvas(v)}
                                                                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
                                                                    title="Highlight issue bounding area on canvas"
                                                                >
                                                                    <Eye size={12} />
                                                                    <span>Highlight</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleAutoFix(v)}
                                                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-600/90 text-white hover:bg-emerald-500 transition-colors"
                                                                title="Automatically correct this violation"
                                                            >
                                                                <ShieldCheck size={12} />
                                                                <span>Auto-Fix</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'setup' && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold">Configure Brand Kit Guidelines</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Brand Kit Name</label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="e.g. Acme Corp Guidelines"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Primary Font</label>
                                    <input
                                        type="text"
                                        value={formPrimaryFont}
                                        onChange={(e) => setFormPrimaryFont(e.target.value)}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="e.g. Inter, Roboto"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Primary Color (Hex)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={formPrimaryColor}
                                            onChange={(e) => setFormPrimaryColor(e.target.value)}
                                            className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={formPrimaryColor}
                                            onChange={(e) => setFormPrimaryColor(e.target.value)}
                                            className="flex-1 text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Secondary Color (Hex)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={formSecondaryColor}
                                            onChange={(e) => setFormSecondaryColor(e.target.value)}
                                            className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={formSecondaryColor}
                                            onChange={(e) => setFormSecondaryColor(e.target.value)}
                                            className="flex-1 text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Accent Color (Hex)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={formAccentColor}
                                            onChange={(e) => setFormAccentColor(e.target.value)}
                                            className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={formAccentColor}
                                            onChange={(e) => setFormAccentColor(e.target.value)}
                                            className="flex-1 text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Minimum Safety Margin (px)</label>
                                    <input
                                        type="number"
                                        value={formMargin}
                                        onChange={(e) => setFormMargin(Number(e.target.value))}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-medium text-muted-foreground">Allowed Fonts (comma-separated)</label>
                                    <input
                                        type="text"
                                        value={formAllowedFonts}
                                        onChange={(e) => setFormAllowedFonts(e.target.value)}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="e.g. Inter, Roboto, Outfit, Arial"
                                    />
                                </div>

                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-medium text-muted-foreground">Allowed Colors (comma-separated hex)</label>
                                    <input
                                        type="text"
                                        value={formAllowedColors}
                                        onChange={(e) => setFormAllowedColors(e.target.value)}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="e.g. #2563eb, #0f172a, #f59e0b, #ffffff"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Required Logo Position</label>
                                    <select
                                        value={formLogoPosition}
                                        onChange={(e) => setFormLogoPosition(e.target.value as BrandProfile['logo']['requiredPosition'])}
                                        className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                    >
                                        <option value="top-left">Top Left</option>
                                        <option value="top-right">Top Right</option>
                                        <option value="bottom-left">Bottom Left</option>
                                        <option value="bottom-right">Bottom Right</option>
                                        <option value="any">Any Position</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Brand Logo</label>
                                    <div className="flex items-center gap-2">
                                        {formLogoDataUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={formLogoDataUrl}
                                                alt="Brand logo preview"
                                                className="w-8 h-8 object-contain rounded border border-border bg-background"
                                            />
                                        )}
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                            aria-label="Upload brand logo"
                                            onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                                            className="flex-1 text-xs text-muted-foreground file:mr-2 file:px-2 file:py-1 file:text-xs file:rounded file:border-0 file:bg-secondary file:text-foreground hover:file:bg-accent"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Approved Assets Library */}
                            <div className="space-y-2 pt-2">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Approved Assets ({formAssets.length})
                                </h4>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={newAssetType}
                                        onChange={(e) => setNewAssetType(e.target.value as ApprovedAsset['type'])}
                                        aria-label="New asset type"
                                        className="text-xs bg-background border border-border rounded-md px-2 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                                    >
                                        <option value="shape">Shape</option>
                                        <option value="icon">Icon</option>
                                        <option value="logo">Logo</option>
                                        <option value="template">Template</option>
                                    </select>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                        aria-label="Upload approved asset"
                                        onChange={(e) => {
                                            handleAssetUpload(e.target.files?.[0]);
                                            e.target.value = '';
                                        }}
                                        className="flex-1 text-xs text-muted-foreground file:mr-2 file:px-2 file:py-1 file:text-xs file:rounded file:border-0 file:bg-secondary file:text-foreground hover:file:bg-accent"
                                    />
                                </div>

                                {formAssets.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {formAssets.map((asset) => (
                                            <div
                                                key={asset.id}
                                                className="flex items-center gap-2 p-2 rounded-lg border border-border/70 bg-card/50 text-xs"
                                            >
                                                {asset.url && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={asset.url}
                                                        alt={asset.name}
                                                        className="w-8 h-8 object-contain rounded bg-background border border-border/60"
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{asset.name}</p>
                                                    <p className="text-[10px] uppercase text-muted-foreground">{asset.type}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveAsset(asset.id)}
                                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    title={`Remove ${asset.name}`}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button
                                    onClick={handleSaveSetup}
                                    className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
                                >
                                    Save Brand Kit Profile
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

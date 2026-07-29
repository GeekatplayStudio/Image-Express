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
    BrandAuditReport,
    BrandViolation,
    extractCanvasMetadata,
    runHeuristicBrandAudit,
} from '@/lib/brand/brandAuditEngine';
import {
    BrandProfile,
    DEFAULT_BRAND_PROFILE,
    getActiveBrandProfile,
    loadBrandProfiles,
    saveBrandProfile,
    setActiveBrandProfileId,
} from '@/lib/brand/brandProfile';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
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
    const [formMargin, setFormMargin] = useState(20);

    useEscapeKey(onClose, { enabled: isOpen });

    // Refresh profiles on open
    useEffect(() => {
        if (!isOpen) return;
        const loaded = loadBrandProfiles();
        setProfiles(loaded);
        const active = getActiveBrandProfile();
        setActiveProfile(active);

        setFormName(active.name);
        setFormPrimaryColor(active.palette.primary);
        setFormSecondaryColor(active.palette.secondary);
        setFormAccentColor(active.palette.accent);
        setFormPrimaryFont(active.typography.primaryFont);
        setFormMargin(active.layout.minMargin);
    }, [isOpen]);

    // Canvas overlay highlight helper
    const highlightViolationOnCanvas = useCallback((violation: BrandViolation) => {
        if (!canvas || !violation.boundingBox) return;
        setSelectedViolation(violation);

        // Find existing highlight rect or add temporary overlay box
        const existingHighlight = canvas.getObjects().find((o) => o.get('id') === '__brand_audit_overlay__');
        if (existingHighlight) {
            canvas.remove(existingHighlight);
        }

        const { left, top, width, height } = violation.boundingBox;
        const highlightRect = new fabric.Rect({
            left,
            top,
            width,
            height,
            fill: 'rgba(239, 68, 68, 0.15)',
            stroke: '#ef4444',
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            selectable: false,
            evented: false,
        });
        highlightRect.set('id', '__brand_audit_overlay__');
        canvas.add(highlightRect);
        canvas.requestRenderAll();
    }, [canvas]);

    const clearCanvasHighlight = useCallback(() => {
        if (!canvas) return;
        const existingHighlight = canvas.getObjects().find((o) => o.get('id') === '__brand_audit_overlay__');
        if (existingHighlight) {
            canvas.remove(existingHighlight);
            canvas.requestRenderAll();
        }
        setSelectedViolation(null);
    }, [canvas]);

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

            const response = await fetch('/api/ai/brand-manager/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    metadata,
                    brandProfile: activeProfile,
                    baseUrl: prefs.ollamaBaseUrl,
                    model: prefs.ollamaModel,
                    imageDataUrl: dataUrl,
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

    const handleSaveSetup = () => {
        const updated: BrandProfile = {
            ...activeProfile,
            name: formName || 'Custom Brand Kit',
            palette: {
                ...activeProfile.palette,
                primary: formPrimaryColor || '#2563eb',
                secondary: formSecondaryColor || '#0f172a',
                accent: formAccentColor || '#f59e0b',
                allowedColors: [
                    formPrimaryColor,
                    formSecondaryColor,
                    formAccentColor,
                    '#ffffff',
                    '#000000',
                ].filter(Boolean),
            },
            typography: {
                ...activeProfile.typography,
                primaryFont: formPrimaryFont || 'Inter',
                allowedFonts: [formPrimaryFont, 'Inter', 'Roboto', 'Arial'].filter(Boolean),
            },
            layout: {
                ...activeProfile.layout,
                minMargin: Number(formMargin) || 20,
            },
            updatedAt: new Date().toISOString(),
        };

        const nextProfiles = saveBrandProfile(updated);
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
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Detected Issues ({auditReport.violations.length})
                                        </h4>

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

                                                        {v.boundingBox && (
                                                            <button
                                                                onClick={() => highlightViolationOnCanvas(v)}
                                                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
                                                                title="Highlight issue bounding area on canvas"
                                                            >
                                                                <Eye size={12} />
                                                                <span>Highlight</span>
                                                            </button>
                                                        )}
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

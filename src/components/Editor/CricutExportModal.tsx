'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    Check,
    Download,
    Layers3,
    Loader2,
    Scissors,
    Sparkles,
    X,
} from 'lucide-react';

import { buildCricutPlan, downloadCricutPlan } from '@/lib/cricut/cricutExport';
import { cricutSvgDataUrl } from '@/lib/cricut/cricutSvg';
import type { CricutExportOptions, CricutPlan } from '@/lib/cricut/cricutTypes';
import { useI18n } from '@/providers/I18nProvider';

type CricutExportModalProps = {
    sourceDataUrl: string;
    designName: string;
    onClose: () => void;
};

const numeric = (value: string, fallback: number) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

function NumberField({
    label,
    value,
    min,
    max,
    step = 1,
    unit,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (value: number) => void;
}) {
    return (
        <label className="space-y-1 text-xs text-muted-foreground">
            <span>{label}</span>
            <span className="flex items-center rounded-lg border border-border/70 bg-background/70 focus-within:border-primary/60">
                <input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(event) => onChange(numeric(event.target.value, value))}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-foreground outline-none"
                />
                {unit && <span className="pr-2.5 text-[10px] uppercase tracking-wide">{unit}</span>}
            </span>
        </label>
    );
}

function Toggle({
    checked,
    label,
    description,
    onChange,
}: {
    checked: boolean;
    label: string;
    description?: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/45 px-3 py-2">
            <span>
                <span className="block text-xs font-medium text-foreground">{label}</span>
                {description && <span className="block text-[10px] text-muted-foreground">{description}</span>}
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="h-4 w-4 accent-primary"
            />
        </label>
    );
}

export default function CricutExportModal({ sourceDataUrl, designName, onClose }: CricutExportModalProps) {
    const { t } = useI18n();
    const [threshold, setThreshold] = useState(150);
    const [invert, setInvert] = useState(false);
    const [simplifyToleranceMm, setSimplifyToleranceMm] = useState(0.35);
    const [minimumFeatureAreaMm2, setMinimumFeatureAreaMm2] = useState(1);
    const [designWidthMm, setDesignWidthMm] = useState(150);
    const [scalePercent, setScalePercent] = useState(100);
    const [sheetWidthMm, setSheetWidthMm] = useState(304.8);
    const [sheetHeightMm, setSheetHeightMm] = useState(304.8);
    const [marginMm, setMarginMm] = useState(6);
    const [gapMm, setGapMm] = useState(3);
    const [allowRotation, setAllowRotation] = useState(true);
    const [layered, setLayered] = useState(false);
    const [targetDepthMm, setTargetDepthMm] = useState(12);
    const [materialThicknessMm, setMaterialThicknessMm] = useState(3);
    const [registrationMarks, setRegistrationMarks] = useState(true);
    const [registrationDiameterMm, setRegistrationDiameterMm] = useState(2);
    const [plan, setPlan] = useState<CricutPlan | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [building, setBuilding] = useState(true);
    const [activeSheet, setActiveSheet] = useState(0);
    const [exporting, setExporting] = useState(false);

    const options = useMemo<CricutExportOptions>(() => ({
        threshold,
        invert,
        simplifyToleranceMm: Math.max(0, simplifyToleranceMm),
        minimumFeatureAreaMm2: Math.max(0, minimumFeatureAreaMm2),
        designWidthMm: Math.max(1, designWidthMm),
        scalePercent: Math.max(1, scalePercent),
        widthMm: Math.max(20, sheetWidthMm),
        heightMm: Math.max(20, sheetHeightMm),
        marginMm: Math.max(0, marginMm),
        gapMm: Math.max(0, gapMm),
        allowRotation,
        enabled: layered,
        targetDepthMm: Math.max(0.1, targetDepthMm),
        materialThicknessMm: Math.max(0.1, materialThicknessMm),
        registrationMarks,
        registrationDiameterMm: Math.max(0.5, registrationDiameterMm),
    }), [
        allowRotation, designWidthMm, gapMm, invert, layered, marginMm, materialThicknessMm,
        minimumFeatureAreaMm2, registrationDiameterMm, registrationMarks, scalePercent,
        sheetHeightMm, sheetWidthMm, simplifyToleranceMm, targetDepthMm, threshold,
    ]);

    useEffect(() => {
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setBuilding(true);
            setError(null);
            buildCricutPlan(sourceDataUrl, options, designName)
                .then((result) => {
                    if (cancelled) return;
                    setPlan(result);
                    setActiveSheet((current) => Math.min(current, result.sheets.length - 1));
                })
                .catch((reason) => {
                    if (cancelled) return;
                    setPlan(null);
                    setError(reason instanceof Error ? reason.message : t('cricut.error.build'));
                })
                .finally(() => {
                    if (!cancelled) setBuilding(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [designName, options, sourceDataUrl, t]);

    const applyPreset = useCallback((width: number, height: number) => {
        setSheetWidthMm(width);
        setSheetHeightMm(height);
    }, []);

    const handleDownload = useCallback(async () => {
        if (!plan) return;
        setExporting(true);
        try {
            await downloadCricutPlan(plan, options, designName);
        } finally {
            setExporting(false);
        }
    }, [designName, options, plan]);

    const selectedSheet = plan?.sheets[activeSheet] ?? null;
    const layerCount = layered ? Math.max(1, Math.ceil(options.targetDepthMm / options.materialThicknessMm)) : 1;

    return (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cricut-export-title">
            <div className="flex h-[min(900px,96vh)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Scissors size={22} /></span>
                        <div>
                            <h2 id="cricut-export-title" className="font-semibold">{t('cricut.title')}</h2>
                            <p className="text-xs text-muted-foreground">{t('cricut.subtitle')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t('cricut.close')}><X size={20} /></button>
                </header>

                <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[390px_minmax(0,1fr)] lg:overflow-hidden">
                    <div className="border-b border-border/70 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-primary" /> {t('cricut.traceScale')}</div>
                            <label className="block space-y-1 text-xs text-muted-foreground">
                                <span className="flex justify-between"><span>{t('cricut.threshold')}</span><span>{threshold}</span></span>
                                <input type="range" min={0} max={255} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full accent-primary" />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <NumberField label={t('cricut.finishedWidth')} value={designWidthMm} min={1} max={1000} step={0.1} unit="mm" onChange={setDesignWidthMm} />
                                <NumberField label={t('cricut.scale')} value={scalePercent} min={1} max={1000} step={1} unit="%" onChange={setScalePercent} />
                                <NumberField label={t('cricut.nodeTolerance')} value={simplifyToleranceMm} min={0} max={5} step={0.05} unit="mm" onChange={setSimplifyToleranceMm} />
                                <NumberField label={t('cricut.minimumFeature')} value={minimumFeatureAreaMm2} min={0} max={100} step={0.25} unit="mm²" onChange={setMinimumFeatureAreaMm2} />
                            </div>
                            <Toggle checked={invert} label={t('cricut.invert')} description={t('cricut.invertDesc')} onChange={setInvert} />
                        </section>

                        <section className="mt-5 space-y-3 border-t border-border/60 pt-4">
                            <div className="flex items-center gap-2 text-sm font-semibold"><Box size={15} className="text-primary" /> {t('cricut.cuttingSheet')}</div>
                            <div className="grid grid-cols-3 gap-1.5">
                                <button type="button" onClick={() => applyPreset(304.8, 304.8)} className="rounded-md border border-border/60 py-1.5 text-[10px] hover:bg-secondary">{t('cricut.preset12Square')}</button>
                                <button type="button" onClick={() => applyPreset(304.8, 609.6)} className="rounded-md border border-border/60 py-1.5 text-[10px] hover:bg-secondary">{t('cricut.preset12Long')}</button>
                                <button type="button" onClick={() => applyPreset(210, 297)} className="rounded-md border border-border/60 py-1.5 text-[10px] hover:bg-secondary">A4</button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <NumberField label={t('cricut.sheetWidth')} value={sheetWidthMm} min={20} max={2000} step={0.1} unit="mm" onChange={setSheetWidthMm} />
                                <NumberField label={t('cricut.sheetHeight')} value={sheetHeightMm} min={20} max={2000} step={0.1} unit="mm" onChange={setSheetHeightMm} />
                                <NumberField label={t('cricut.safeMargin')} value={marginMm} min={0} max={100} step={0.5} unit="mm" onChange={setMarginMm} />
                                <NumberField label={t('cricut.partSpacing')} value={gapMm} min={0} max={100} step={0.5} unit="mm" onChange={setGapMm} />
                            </div>
                            <Toggle checked={allowRotation} label={t('cricut.smartRotation')} description={t('cricut.smartRotationDesc')} onChange={setAllowRotation} />
                        </section>

                        <section className="mt-5 space-y-3 border-t border-border/60 pt-4">
                            <div className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={15} className="text-primary" /> {t('cricut.stackedProfile')}</div>
                            <Toggle checked={layered} label={t('cricut.sliceSilhouette')} description={t('cricut.sliceSilhouetteDesc')} onChange={setLayered} />
                            <div className={`grid grid-cols-2 gap-2 ${layered ? '' : 'opacity-45'}`}>
                                <NumberField label={t('cricut.targetDepth')} value={targetDepthMm} min={0.1} max={1000} step={0.1} unit="mm" onChange={setTargetDepthMm} />
                                <NumberField label={t('cricut.stockThickness')} value={materialThicknessMm} min={0.1} max={100} step={0.1} unit="mm" onChange={setMaterialThicknessMm} />
                            </div>
                            <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2 text-xs">
                                <span className="font-medium">{layerCount} {t(layerCount === 1 ? 'cricut.layer' : 'cricut.layers')}</span>
                                <span className="text-muted-foreground"> · {layered ? targetDepthMm : materialThicknessMm} mm {t('cricut.assembledDepth')}</span>
                            </div>
                            <Toggle checked={registrationMarks} label={t('cricut.registrationMarks')} description={t('cricut.registrationMarksDesc')} onChange={setRegistrationMarks} />
                            {registrationMarks && <NumberField label={t('cricut.registrationDiameter')} value={registrationDiameterMm} min={0.5} max={20} step={0.1} unit="mm" onChange={setRegistrationDiameterMm} />}
                        </section>
                    </div>

                    <div className="flex min-h-[650px] flex-col bg-secondary/10 lg:min-h-0">
                        <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                            <div className="flex min-h-0 flex-col gap-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cricut.monochromeSource')}</div>
                                <div role="img" aria-label={t('cricut.monochromeAlt')} className="min-h-40 flex-1 rounded-xl border border-border/70 bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: plan ? `url(${plan.monochromeDataUrl})` : undefined }} />
                            </div>
                            <div className="flex min-h-0 flex-col gap-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cricut.nestedSheet')}</div>
                                    {plan && plan.sheets.length > 1 && (
                                        <div className="flex gap-1">
                                            {plan.sheets.map((sheet) => (
                                                <button type="button" key={sheet.index} onClick={() => setActiveSheet(sheet.index)} className={`rounded-md px-2 py-1 text-[10px] ${activeSheet === sheet.index ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}>{t('cricut.sheet')} {sheet.index + 1}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative min-h-64 flex-1 overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] p-3">
                                    {selectedSheet && <div role="img" aria-label={`${t('cricut.cuttingSheet')} ${activeSheet + 1}`} className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${cricutSvgDataUrl(selectedSheet.svg)}")` }} />}
                                    {building && <div className="absolute inset-0 flex items-center justify-center bg-card/75 backdrop-blur-sm"><Loader2 className="animate-spin text-primary" size={30} /></div>}
                                    {!building && error && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-destructive">{error}</div>}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-border/70 bg-card/80 px-4 py-3">
                            {plan && (
                                <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                                    <div><span className="block text-muted-foreground">{t('cricut.cutSize')}</span><span className="font-medium">{plan.outputWidthMm.toFixed(1)} × {plan.outputHeightMm.toFixed(1)} mm</span></div>
                                    <div><span className="block text-muted-foreground">{t('cricut.elements')}</span><span className="font-medium">{plan.parts.length}</span></div>
                                    <div><span className="block text-muted-foreground">{t('cricut.sheets')}</span><span className="font-medium">{plan.sheets.length}</span></div>
                                    <div><span className="block text-muted-foreground">{t('cricut.pathNodes')}</span><span className="font-medium">{plan.nodeCount} <span className="text-muted-foreground">/ {plan.originalNodeCount}</span></span></div>
                                    <div><span className="block text-muted-foreground">{t('cricut.materialYield')}</span><span className="font-medium">{plan.utilizationPercent.toFixed(1)}%</span></div>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                                <p className="max-w-2xl text-[10px] text-muted-foreground">{t('cricut.importHint')}</p>
                                <button type="button" onClick={() => void handleDownload()} disabled={!plan || building || exporting} className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow disabled:cursor-not-allowed disabled:opacity-50">
                                    {exporting ? <Loader2 size={16} className="animate-spin" /> : plan && plan.sheets.length > 1 ? <Layers3 size={16} /> : <Download size={16} />}
                                    {t(plan && plan.sheets.length > 1 ? 'cricut.downloadZip' : 'cricut.downloadSvg')}
                                    {!exporting && <Check size={14} />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

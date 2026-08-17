'use client';

import { useMemo, useState } from 'react';
import {
    AlertTriangle,
    Box,
    Boxes,
    CheckCircle2,
    Circle,
    Cog,
    Download,
    Library,
    PackageCheck,
    RotateCcw,
    Scissors,
    Search,
    type LucideIcon,
} from 'lucide-react';

import ModalShell from '@/components/ui/ModalShell';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/I18nProvider';
import { FABRICATION_MATERIALS, FABRICATION_WORKFLOWS, type FabricationWorkflowId } from '@/features/fabrication/domain/fabricationCatalog';
import { CNC_CATEGORY_KEYS, CNC_FOAM_CUTTER_INVENTORY, type CncInventoryCategory } from '@/features/fabrication/domain/cncFoamCutterInventory';
import {
    buildInventoryCsv,
    inventoryCompletion,
    loadInventoryQuantities,
    saveInventoryQuantities,
    type InventoryQuantities,
} from '@/features/fabrication/application/inventoryState';

export type FabricationLibraryTab = 'workflows' | 'materials' | 'hardware';

type FabricationLibraryModalProps = {
    initialTab?: FabricationLibraryTab;
    onLaunch: (tool: FabricationWorkflowId) => void;
    onClose: () => void;
};

const WORKFLOW_ICONS: Record<FabricationWorkflowId, LucideIcon> = {
    '3d-gen': Box,
    '3d-library': Library,
    'cricut-studio': Scissors,
    'cnc-planner': Cog,
};

function downloadText(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FabricationLibraryModal({ initialTab = 'workflows', onLaunch, onClose }: FabricationLibraryModalProps) {
    const { t } = useI18n();
    const [tab, setTab] = useState<FabricationLibraryTab>(initialTab);
    const [quantities, setQuantities] = useState<InventoryQuantities>(() => loadInventoryQuantities());
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<CncInventoryCategory | 'all'>('all');
    const [axis, setAxis] = useState<'all' | 'X' | 'Y' | 'Z' | 'A/C'>('all');
    const [materialProcess, setMaterialProcess] = useState<'all' | 'cricut' | 'cnc-knife'>('all');

    const filteredInventory = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return CNC_FOAM_CUTTER_INVENTORY.filter((item) => {
            if (category !== 'all' && item.category !== category) return false;
            if (axis !== 'all' && item.axis !== axis && item.axis !== 'all') return false;
            if (!normalizedQuery) return true;
            return `${item.component} ${item.specification}`.toLowerCase().includes(normalizedQuery);
        });
    }, [axis, category, query]);

    const filteredMaterials = useMemo(() => FABRICATION_MATERIALS.filter((material) => (
        materialProcess === 'all' || material.process === materialProcess || material.process === 'both'
    )), [materialProcess]);

    const completion = inventoryCompletion(CNC_FOAM_CUTTER_INVENTORY, quantities);
    const updateQuantity = (id: string, value: number) => {
        const next = { ...quantities, [id]: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 };
        setQuantities(next);
        saveInventoryQuantities(next);
    };

    const resetInventory = () => {
        setQuantities({});
        saveInventoryQuantities({});
    };

    const tabs: Array<{ id: FabricationLibraryTab; key: string }> = [
        { id: 'workflows', key: 'fabrication.tab.workflows' },
        { id: 'materials', key: 'fabrication.tab.materials' },
        { id: 'hardware', key: 'fabrication.tab.hardware' },
    ];

    return (
        <ModalShell
            isOpen
            onClose={onClose}
            title={t('fabrication.title')}
            icon={<Boxes size={17} className="text-primary" />}
            initialWidth={980}
            initialHeight={720}
            minWidth={520}
            minHeight={420}
            zIndex={180}
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
        >
            <div className="shrink-0 border-b border-border/70 bg-secondary/10 px-4 pt-3">
                <p className="mb-3 text-xs text-muted-foreground">{t('fabrication.subtitle')}</p>
                <nav className="flex gap-1" aria-label={t('fabrication.title')}>
                    {tabs.map((item) => (
                        <button
                            type="button"
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            aria-pressed={tab === item.id}
                            className={cn('rounded-t-lg border border-b-0 px-4 py-2 text-xs font-medium', tab === item.id ? 'border-border bg-card text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary/50')}
                        >
                            {t(item.key)}
                        </button>
                    ))}
                </nav>
            </div>

            {tab === 'workflows' && (
                <div className="grid flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
                    {FABRICATION_WORKFLOWS.map((workflow) => {
                        const Icon = WORKFLOW_ICONS[workflow.id];
                        return (
                            <button
                                type="button"
                                key={workflow.id}
                                onClick={() => onLaunch(workflow.id)}
                                className="group flex min-h-40 flex-col items-start rounded-xl border border-border/70 bg-background/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                            >
                                <span className="mb-4 rounded-xl bg-primary/10 p-3 text-primary"><Icon size={24} /></span>
                                <span className="text-sm font-semibold">{t(workflow.titleKey)}</span>
                                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(workflow.descriptionKey)}</span>
                                <span className="mt-auto pt-4 text-[10px] font-semibold uppercase tracking-wider text-primary">{t(`fabrication.stage.${workflow.stage}`)}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {tab === 'materials' && (
                <div className="flex min-h-0 flex-1 flex-col p-4">
                    <div className="mb-3 flex flex-wrap gap-2">
                        {(['all', 'cricut', 'cnc-knife'] as const).map((process) => (
                            <button type="button" key={process} onClick={() => setMaterialProcess(process)} className={cn('rounded-full border px-3 py-1.5 text-xs', materialProcess === process ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary')}>
                                {t(`fabrication.material.${process}`)}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-3 overflow-y-auto sm:grid-cols-2">
                        {filteredMaterials.map((material) => (
                            <article key={material.id} className="rounded-xl border border-border/70 bg-background/60 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div><h3 className="text-sm font-semibold">{material.material}</h3><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{material.process.replace('-', ' · ')}</p></div>
                                    <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{material.thicknessMm} mm</span>
                                </div>
                                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{material.guidance}</p>
                            </article>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'hardware' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 border-b border-border/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-56 flex-1">
                                <div className="mb-1 flex justify-between text-xs"><span>{t('fabrication.inventory.progress')}</span><span>{completion.percent.toFixed(0)}%</span></div>
                                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${completion.percent}%` }} /></div>
                            </div>
                            <button type="button" onClick={() => downloadText(buildInventoryCsv(CNC_FOAM_CUTTER_INVENTORY, quantities), '5-axis-cnc-foam-cutter-bom.csv')} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary"><Download size={14} />{t('fabrication.inventory.export')}</button>
                            <button type="button" onClick={resetInventory} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary"><RotateCcw size={14} />{t('fabrication.inventory.reset')}</button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(180px,1fr)_170px_130px]">
                            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3"><Search size={14} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('fabrication.inventory.search')} className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" /></label>
                            <select value={category} onChange={(event) => setCategory(event.target.value as CncInventoryCategory | 'all')} aria-label={t('fabrication.inventory.category')} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
                                <option value="all">{t('fabrication.inventory.allCategories')}</option>
                                {Object.entries(CNC_CATEGORY_KEYS).map(([id, key]) => <option key={id} value={id}>{t(key)}</option>)}
                            </select>
                            <select value={axis} onChange={(event) => setAxis(event.target.value as typeof axis)} aria-label={t('fabrication.inventory.axis')} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
                                <option value="all">{t('fabrication.inventory.allAxes')}</option>
                                {['X', 'Y', 'Z', 'A/C'].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                        </div>
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{t('fabrication.inventory.safety')}</span></div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="space-y-2">
                            {filteredInventory.map((item) => {
                                const acquired = Math.min(item.quantity, quantities[item.id] || 0);
                                const complete = acquired >= item.quantity;
                                return (
                                    <article key={item.id} className={cn('grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[28px_minmax(0,1fr)_90px_100px]', complete ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : item.safetyCritical ? 'border-amber-500/30 bg-background' : 'border-border/70 bg-background')}>
                                        {complete ? <CheckCircle2 size={18} className="text-emerald-500" /> : item.safetyCritical ? <AlertTriangle size={18} className="text-amber-500" /> : <Circle size={18} className="text-muted-foreground/40" />}
                                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{item.component}</h3>{item.axis && <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold">{item.axis}</span>}</div><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{item.specification}</p></div>
                                        <label className="text-[10px] text-muted-foreground"><span className="block">{t('fabrication.inventory.acquired')}</span><input type="number" min={0} max={item.quantity} value={acquired} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground" /></label>
                                        <div className="text-right text-xs"><span className="font-semibold">/ {item.quantity}</span><span className="ml-1 text-[10px] text-muted-foreground">{item.unit}</span></div>
                                    </article>
                                );
                            })}
                            {filteredInventory.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">{t('fabrication.inventory.noResults')}</div>}
                        </div>
                    </div>
                    <footer className="flex shrink-0 items-center justify-between border-t border-border/70 bg-secondary/10 px-4 py-2 text-xs"><span>{completion.acquired} / {completion.required}</span><span className="inline-flex items-center gap-1.5 text-muted-foreground"><PackageCheck size={14} />{t('fabrication.inventory.saved')}</span></footer>
                </div>
            )}
        </ModalShell>
    );
}

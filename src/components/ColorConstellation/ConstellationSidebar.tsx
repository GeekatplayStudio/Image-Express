'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/providers/I18nProvider';
import type { ConstellationNode, HarmonyKind } from '@/features/color-constellation/contracts/types';
import { tryParseHex } from '@/features/color-constellation/domain/oklch';
import { cn } from '@/lib/utils';
import {
    constellationRoleLabel,
    harmonyKindLabel,
} from '@/components/ColorConstellation/constellationLabels';

const HARMONY_OPTIONS: HarmonyKind[] = [
    'complementary',
    'analogous',
    'split-complementary',
    'triadic',
    'tetradic',
    'pentadic',
    'hexadic',
];

type ConstellationSidebarProps = {
    activeHex: string;
    activeNode: ConstellationNode | null;
    nodes: ConstellationNode[];
    harmonyKind: HarmonyKind;
    harmonyName: string;
    swatchFlash?: string | null;
    onHarmonyNameChange: (value: string) => void;
    onRebuildHarmony: (kind: HarmonyKind) => void;
    onSelectNode: (nodeId: string) => void;
    onOklchChange: (partial: { l?: number; c?: number; h?: number }) => void;
    onApplyHex: (hex: string) => void;
    onNudge: (delta: { l?: number; c?: number; h?: number }) => void;
    onSaveHarmony: () => void;
    onAddSwatch: () => void;
};

export default function ConstellationSidebar({
    activeHex,
    activeNode,
    nodes,
    harmonyKind,
    harmonyName,
    swatchFlash,
    onHarmonyNameChange,
    onRebuildHarmony,
    onSelectNode,
    onOklchChange,
    onApplyHex,
    onNudge,
    onSaveHarmony,
    onAddSwatch,
}: ConstellationSidebarProps) {
    const { t } = useI18n();
    const oklch = activeNode?.oklch;

    // Decision: keep a local draft so typing "#33…" does not instantly become #000000
    // via normalizeHex (incomplete length → black). Commit only on valid 3/6 digit hex.
    const [hexDraft, setHexDraft] = useState(activeHex);
    useEffect(() => {
        setHexDraft(activeHex);
    }, [activeHex]);

    const commitHexDraft = (raw: string) => {
        setHexDraft(raw);
        const parsed = tryParseHex(raw);
        if (parsed) onApplyHex(parsed);
    };

    return (
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin">
            <div className="flex items-center gap-2">
                <div
                    className="h-11 w-11 rounded-lg border-2 border-white/25 shrink-0"
                    style={{ backgroundColor: activeHex }}
                    aria-hidden
                />
                <input
                    value={hexDraft}
                    onChange={(event) => commitHexDraft(event.target.value)}
                    onBlur={() => {
                        const parsed = tryParseHex(hexDraft);
                        if (parsed) onApplyHex(parsed);
                        else setHexDraft(activeHex);
                    }}
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px]"
                    aria-label={t('constellation.hexAria')}
                />
                <button
                    type="button"
                    onClick={onAddSwatch}
                    className="h-8 px-2 rounded-md border border-border text-[10px] hover:bg-secondary"
                    title={t('wheel.addSwatch')}
                >
                    {t('constellation.addSwatch')}
                </button>
            </div>
            {swatchFlash && (
                <p className="text-[10px] text-muted-foreground" role="status">{swatchFlash}</p>
            )}

            {/* Decision: suggested harmony colors live in HTML (not only WebGL) so picking always works. */}
            <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t('picker.harmony')}</p>
                <div className="flex flex-wrap gap-1.5">
                    {nodes.map((node) => (
                        <button
                            key={node.id}
                            type="button"
                            onClick={() => onSelectNode(node.id)}
                            className={cn(
                                'h-9 px-2 rounded-md border text-[10px] inline-flex items-center gap-1.5',
                                node.id === activeNode?.id
                                    ? 'border-primary bg-primary/15'
                                    : 'border-border hover:bg-secondary',
                            )}
                            title={constellationRoleLabel(node.role, t)}
                        >
                            <span
                                className="h-5 w-5 rounded-full border border-white/30 shrink-0"
                                style={{ backgroundColor: node.hex }}
                            />
                            <span className="truncate max-w-[4.5rem]">{constellationRoleLabel(node.role, t)}</span>
                            <span className="font-mono text-[9px] text-muted-foreground">{node.hex}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-[10px] text-muted-foreground">{t('wheel.harmonyMode')}</label>
                <select
                    value={harmonyKind}
                    onChange={(event) => onRebuildHarmony(event.target.value as HarmonyKind)}
                    className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[11px]"
                    aria-label={t('wheel.harmonyMode')}
                >
                    {HARMONY_OPTIONS.map((kind) => (
                        <option key={kind} value={kind}>{harmonyKindLabel(kind, t)}</option>
                    ))}
                </select>
            </div>

            {oklch && (
                <div className="space-y-1.5 rounded-md border border-border/60 bg-secondary/10 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('constellation.oklchAxes')}
                    </p>
                    <label className="block text-[10px] text-muted-foreground">
                        {t('constellation.lightness')}
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={oklch.l}
                            onChange={(event) => onOklchChange({ l: Number(event.target.value) })}
                            className="w-full"
                            aria-label={t('constellation.lightness')}
                        />
                    </label>
                    <label className="block text-[10px] text-muted-foreground">
                        {t('constellation.chroma')}
                        <input
                            type="range"
                            min={0}
                            max={0.4}
                            step={0.005}
                            value={oklch.c}
                            onChange={(event) => onOklchChange({ c: Number(event.target.value) })}
                            className="w-full"
                            aria-label={t('constellation.chroma')}
                        />
                    </label>
                    <label className="block text-[10px] text-muted-foreground">
                        {t('constellation.hue')}
                        <input
                            type="range"
                            min={0}
                            max={360}
                            step={1}
                            value={oklch.h}
                            onChange={(event) => onOklchChange({ h: Number(event.target.value) })}
                            className="w-full"
                            aria-label={t('constellation.hue')}
                        />
                    </label>
                    <p className="font-mono text-[10px] text-muted-foreground">
                        L {oklch.l.toFixed(3)} · C {oklch.c.toFixed(3)} · H {oklch.h.toFixed(1)}°
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-1">
                <button type="button" className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary" onClick={() => onNudge({ l: 0.05 })}>
                    {t('constellation.nudgeBrighter')}
                </button>
                <button type="button" className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary" onClick={() => onNudge({ l: -0.05 })}>
                    {t('constellation.nudgeDarker')}
                </button>
                <button type="button" className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary" onClick={() => onNudge({ h: 15 })}>
                    {t('constellation.nudgeRotate')}
                </button>
                <button type="button" className="h-7 px-2 rounded border border-border text-[10px] hover:bg-secondary" onClick={() => onNudge({ c: 0.02 })}>
                    {t('constellation.nudgeChroma')}
                </button>
            </div>

            <div className="flex gap-1">
                <input
                    value={harmonyName}
                    onChange={(event) => onHarmonyNameChange(event.target.value)}
                    placeholder={t('wheel.harmonyPaletteName')}
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-[11px]"
                    aria-label={t('wheel.harmonyPaletteName')}
                />
                <button
                    type="button"
                    onClick={onSaveHarmony}
                    className="h-8 px-2 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold"
                >
                    {t('wheel.saveHarmonySet')}
                </button>
            </div>
        </div>
    );
}

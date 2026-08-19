'use client';

import React, { useEffect, useRef } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Blend,
    Boxes,
    Brush,
    ChevronsDown,
    ChevronsUp,
    Copy,
    Image as ImageIcon,
    LassoSelect,
    LayoutTemplate,
    Move,
    Loader2,
    Origami,
    PaintBucket,
    PenTool,
    Shapes,
    ShieldCheck,
    Sparkles,
    Square,
    Sun,
    Type,
    SquareMousePointer,
    type LucideIcon,
} from 'lucide-react';
import useAppTheme from '@/hooks/useAppTheme';
import { useI18n } from '@/providers/I18nProvider';
import { FABRICATION_TOOL_GROUP } from '@/components/toolbar/toolRegistry';

interface CircularContextMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    activeTool?: string;
    activePanelMode?: string;
    onClose: () => void;
    onSelectTool: (tool: string) => void;
    onLayerOrderAction?: (action: LayerOrderAction) => void;
    layerOrderState?: LayerOrderState;
    /** One-click Foldcraft workflow: low-poly unfold to cutter-ready files. */
    modelContext?: {
        name: string;
        isCutting: boolean;
        onFoamCut: () => void;
    };
}

export type LayerOrderAction = 'move-up' | 'move-down' | 'to-front' | 'to-back';

export type LayerOrderState = {
    enabled: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    canBringToFront: boolean;
    canSendToBack: boolean;
};

type CircularMenuItem = {
    id: string;
    icon: LucideIcon;
    labelKey: string;
    color: string;
    group: 'select' | 'retouch' | 'create' | 'library';
};

const GROUP_ORDER: Array<CircularMenuItem['group']> = ['select', 'retouch', 'create', 'library'];

const LAYER_ORDER_ITEMS: Array<{
    id: LayerOrderAction;
    icon: LucideIcon;
    labelKey: string;
    canUse: (state: LayerOrderState | undefined) => boolean;
}> = [
        { id: 'to-front', icon: ChevronsUp, labelKey: 'circular.bringToFront', canUse: (state) => Boolean(state?.enabled && state?.canBringToFront) },
        { id: 'move-up', icon: ArrowUp, labelKey: 'circular.moveUp', canUse: (state) => Boolean(state?.enabled && state?.canMoveUp) },
        { id: 'move-down', icon: ArrowDown, labelKey: 'circular.moveDown', canUse: (state) => Boolean(state?.enabled && state?.canMoveDown) },
        { id: 'to-back', icon: ChevronsDown, labelKey: 'circular.sendToBack', canUse: (state) => Boolean(state?.enabled && state?.canSendToBack) },
    ];

export default function CircularContextMenu({
    x,
    y,
    isOpen,
    activeTool,
    activePanelMode,
    onClose,
    onSelectTool,
    onLayerOrderAction,
    layerOrderState,
    modelContext,
}: CircularContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const appTheme = useAppTheme();
    const { t } = useI18n();

    // One entry per tool family — the tool-group buttons in the left toolbar
    // (and single-key shortcuts) cover the variants. The previous 24-item ring
    // was unreadable.
    const menuItems: CircularMenuItem[] = [
        { id: 'select', icon: Move, labelKey: 'toolbar.move', color: appTheme.circularMenuColors.select, group: 'select' },
        { id: 'marquee', icon: Square, labelKey: 'toolbar.marquee', color: appTheme.circularMenuColors.marquee, group: 'select' },
        { id: 'lasso', icon: LassoSelect, labelKey: 'toolbar.lasso', color: appTheme.circularMenuColors.lasso, group: 'select' },
        { id: 'quick-select', icon: SquareMousePointer, labelKey: 'toolbar.quickSelect', color: appTheme.circularMenuColors.wand, group: 'select' },
        { id: 'healing', icon: ShieldCheck, labelKey: 'toolbar.healingBrush', color: appTheme.circularMenuColors.healing, group: 'retouch' },
        { id: 'clone-stamp', icon: Copy, labelKey: 'toolbar.cloneStamp', color: appTheme.circularMenuColors.cloneStamp, group: 'retouch' },
        { id: 'blur', icon: Blend, labelKey: 'toolbar.blurTool', color: appTheme.circularMenuColors.blur, group: 'retouch' },
        { id: 'dodge', icon: Sun, labelKey: 'toolbar.dodgeTool', color: appTheme.circularMenuColors.dodge, group: 'retouch' },
        { id: 'text', icon: Type, labelKey: 'toolbar.text', color: appTheme.circularMenuColors.text, group: 'create' },
        { id: 'shapes', icon: Shapes, labelKey: 'toolbar.shapes', color: appTheme.circularMenuColors.shapes, group: 'create' },
        { id: 'paint', icon: Brush, labelKey: 'toolbar.paint', color: appTheme.circularMenuColors.paint, group: 'create' },
        { id: 'pen', icon: PenTool, labelKey: 'toolbar.pen', color: appTheme.circularMenuColors.pen, group: 'create' },
        { id: 'gradient', icon: PaintBucket, labelKey: 'toolbar.fillGradient', color: appTheme.circularMenuColors.gradient, group: 'create' },
        { id: 'assets', icon: ImageIcon, labelKey: 'toolbar.gallery', color: appTheme.circularMenuColors.assets, group: 'library' },
        { id: 'templates', icon: LayoutTemplate, labelKey: 'toolbar.library', color: appTheme.circularMenuColors.templates, group: 'library' },
        { id: 'ai-zone', icon: Sparkles, labelKey: 'toolbar.aiZone', color: appTheme.circularMenuColors.aiZone, group: 'library' },
        { id: 'fabrication-library', icon: Boxes, labelKey: 'toolbar.fabrication', color: appTheme.circularMenuColors.threeD, group: 'library' },
    ];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleContextMenu = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('contextmenu', handleContextMenu);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    if (modelContext) {
        const menuX = typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - 240);
        const menuY = typeof window === 'undefined' ? y : Math.min(y, window.innerHeight - 132);
        return (
            <div
                ref={menuRef}
                role="menu"
                aria-label={t('foamcut.modelActions')}
                className="fixed z-[100] w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
                style={{ left: Math.max(8, menuX), top: Math.max(8, menuY) }}
            >
                <div className="truncate px-2 pb-2 pt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {modelContext.name}
                </div>
                <button
                    type="button"
                    role="menuitem"
                    disabled={modelContext.isCutting}
                    onClick={modelContext.onFoamCut}
                    className="flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-left text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
                >
                    {modelContext.isCutting
                        ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                        : <Origami aria-hidden="true" className="h-5 w-5" />}
                    <span>{t(modelContext.isCutting ? 'foamcut.cutting' : 'foamcut.button')}</span>
                </button>
                <p className="px-2 pt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                    {t('foamcut.hint')}
                </p>
            </div>
        );
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const itemCount = menuItems.length;
    const minArcSpacing = 48;
    const idealRadius = Math.max(72, Math.ceil((itemCount * minArcSpacing) / (2 * Math.PI)));
    const maxViewportRadius = viewportWidth > 0 && viewportHeight > 0
        ? Math.max(56, Math.floor(Math.min(viewportWidth, viewportHeight) / 2) - 28)
        : idealRadius;
    const radius = Math.min(idealRadius, maxViewportRadius);
    const startAngle = -90; // Top
    const safeMargin = radius + 28;
    const menuX = viewportWidth > 0 ? Math.min(Math.max(x, safeMargin), viewportWidth - safeMargin) : x;
    const menuY = viewportHeight > 0 ? Math.min(Math.max(y, safeMargin), viewportHeight - safeMargin) : y;
    const groupedItems = GROUP_ORDER.map((groupId) => ({
        groupId,
        items: menuItems.filter((item) => item.group === groupId),
    }));
    const groupGapAngle = 11;
    const totalGapAngle = groupGapAngle * groupedItems.length;
    const angleStep = (360 - totalGapAngle) / itemCount;
    const toolButtons: Array<{ item: CircularMenuItem; angle: number }> = [];
    let angleCursor = startAngle;
    groupedItems.forEach((group) => {
        group.items.forEach((item) => {
            toolButtons.push({ item, angle: angleCursor });
            angleCursor += angleStep;
        });
        angleCursor += groupGapAngle;
    });
    const layerActionRadius = Math.max(34, Math.round(radius * 0.56));
    const layerActionStep = 360 / LAYER_ORDER_ITEMS.length;
    const layerActionStart = -90;

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] w-0 h-0"
            style={{ left: menuX, top: menuY }}
        >
            <div className="relative animate-in zoom-in-50 duration-200">
                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-300/60 dark:border-zinc-700/70"
                    style={{
                        width: `${(layerActionRadius * 2) + 14}px`,
                        height: `${(layerActionRadius * 2) + 14}px`,
                    }}
                />
                {/* Center Button (Close/Cancel) */}
                <button
                    onClick={onClose}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors z-20"
                >
                    <div className="w-2 h-2 rounded-full bg-zinc-400" />
                </button>

                {/* Layer Order Inner Ring */}
                {LAYER_ORDER_ITEMS.map((item, index) => {
                    const angle = layerActionStart + (index * layerActionStep);
                    const radian = (angle * Math.PI) / 180;
                    const bx = Math.cos(radian) * layerActionRadius;
                    const by = Math.sin(radian) * layerActionRadius;
                    const isEnabled = item.canUse(layerOrderState);

                    return (
                        <button
                            key={`layer-action-${item.id}`}
                            type="button"
                            disabled={!isEnabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (!isEnabled || !onLayerOrderAction) return;
                                onLayerOrderAction(item.id);
                                onClose();
                            }}
                            className={`absolute w-7 h-7 rounded-full border flex items-center justify-center transition-colors z-20 ${isEnabled
                                    ? 'bg-white/95 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-100 hover:bg-primary hover:text-white hover:border-primary'
                                    : 'bg-zinc-100/90 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                                }`}
                            style={{
                                left: bx,
                                top: by,
                                transform: 'translate(-50%, -50%)',
                            }}
                            title={isEnabled ? t(item.labelKey) : t('circular.selectLayerHint')}
                        >
                            <item.icon size={13} />
                        </button>
                    );
                })}

                {/* Satellite Buttons */}
                {toolButtons.map(({ item, angle }) => {
                    const radian = (angle * Math.PI) / 180;
                    const bx = Math.cos(radian) * radius;
                    const by = Math.sin(radian) * radius;
                    const isActive = activeTool === item.id
                        || (item.id === 'fabrication-library' && FABRICATION_TOOL_GROUP.tools.some((tool) => tool.name === activeTool))
                        || (item.id === 'channels' && activePanelMode === 'channels');

                    return (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectTool(item.id);
                                onClose();
                            }}
                            className={`absolute w-10 h-10 rounded-full shadow-md border flex items-center justify-center transition-colors duration-200 z-10 group ${isActive
                                ? 'bg-primary text-white border-primary scale-110'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-primary hover:text-white hover:border-primary hover:scale-110'}`}
                            style={{
                                left: bx,
                                top: by,
                                transform: 'translate(-50%, -50%)'
                            }}
                            title={t(item.labelKey)}
                        >
                            <item.icon
                                size={18}
                                style={isActive ? undefined : { color: item.color }}
                                className={`transition-colors ${isActive ? 'text-white' : 'group-hover:!text-white'}`}
                            />
                            {/* Tooltip */}
                            <span className="absolute opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-2 py-1 rounded -bottom-8 pointer-events-none whitespace-nowrap transition-opacity">
                                {t(item.labelKey)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

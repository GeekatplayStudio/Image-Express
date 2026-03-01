'use client';

import React, { useEffect, useRef } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Bandage,
    Blend,
    Box,
    Brush,
    ChevronsDown,
    ChevronsUp,
    Copy,
    Droplets,
    Eraser,
    Flame,
    History,
    Image as ImageIcon,
    LassoSelect,
    LayoutTemplate,
    Move,
    Pointer,
    PaintBucket,
    PaintbrushVertical,
    PenTool,
    Scan,
    Shapes,
    ShieldCheck,
    Sparkles,
    Square,
    Sun,
    Type,
    Wand2,
    SquareMousePointer,
    type LucideIcon,
} from 'lucide-react';
import { APP_THEME } from '@/lib/theme-tokens';

interface CircularContextMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    onSelectTool: (tool: string) => void;
    onLayerOrderAction?: (action: LayerOrderAction) => void;
    layerOrderState?: LayerOrderState;
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
    label: string;
    color: string;
    group: 'select' | 'retouch' | 'create' | 'library';
};

const MENU_ITEMS: CircularMenuItem[] = [
    { id: 'select', icon: Move, label: 'Move', color: APP_THEME.circularMenuColors.select, group: 'select' },
    { id: 'marquee', icon: Square, label: 'Marquee', color: APP_THEME.circularMenuColors.marquee, group: 'select' },
    { id: 'lasso', icon: LassoSelect, label: 'Lasso', color: APP_THEME.circularMenuColors.lasso, group: 'select' },
    { id: 'wand', icon: Wand2, label: 'Magic Wand', color: APP_THEME.circularMenuColors.wand, group: 'select' },
    { id: 'quick-select', icon: SquareMousePointer, label: 'Quick Selection', color: APP_THEME.circularMenuColors.wand, group: 'select' },
    { id: 'selection-brush', icon: PaintbrushVertical, label: 'Selection Brush', color: APP_THEME.circularMenuColors.paint, group: 'select' },
    { id: 'path-select', icon: Pointer, label: 'Path Select', color: APP_THEME.circularMenuColors.pathSelect, group: 'select' },

    { id: 'spot-healing', icon: Bandage, label: 'Spot Healing', color: APP_THEME.circularMenuColors.healing, group: 'retouch' },
    { id: 'remove', icon: Eraser, label: 'Remove Tool', color: APP_THEME.circularMenuColors.healing, group: 'retouch' },
    { id: 'healing', icon: ShieldCheck, label: 'Healing Brush', color: APP_THEME.circularMenuColors.healing, group: 'retouch' },
    { id: 'clone-stamp', icon: Copy, label: 'Clone Stamp', color: APP_THEME.circularMenuColors.cloneStamp, group: 'retouch' },
    { id: 'history-brush', icon: History, label: 'History Brush', color: APP_THEME.circularMenuColors.historyBrush, group: 'retouch' },
    { id: 'blur', icon: Blend, label: 'Blur Tool', color: APP_THEME.circularMenuColors.blur, group: 'retouch' },
    { id: 'sharpen', icon: Scan, label: 'Sharpen Tool', color: APP_THEME.circularMenuColors.sharpen, group: 'retouch' },
    { id: 'dodge', icon: Sun, label: 'Dodge Tool', color: APP_THEME.circularMenuColors.dodge, group: 'retouch' },
    { id: 'burn', icon: Flame, label: 'Burn Tool', color: APP_THEME.circularMenuColors.dodge, group: 'retouch' },
    { id: 'sponge', icon: Droplets, label: 'Sponge Tool', color: APP_THEME.circularMenuColors.dodge, group: 'retouch' },

    { id: 'text', icon: Type, label: 'Text', color: APP_THEME.circularMenuColors.text, group: 'create' },
    { id: 'shapes', icon: Shapes, label: 'Shapes', color: APP_THEME.circularMenuColors.shapes, group: 'create' },
    { id: 'paint', icon: Brush, label: 'Paint', color: APP_THEME.circularMenuColors.paint, group: 'create' },
    { id: 'pen', icon: PenTool, label: 'Pen', color: APP_THEME.circularMenuColors.pen, group: 'create' },
    { id: 'gradient', icon: PaintBucket, label: 'Fill / Gradient', color: APP_THEME.circularMenuColors.gradient, group: 'create' },

    { id: 'assets', icon: ImageIcon, label: 'Gallery', color: APP_THEME.circularMenuColors.assets, group: 'library' },
    { id: 'templates', icon: LayoutTemplate, label: 'Library', color: APP_THEME.circularMenuColors.templates, group: 'library' },
    { id: 'ai-zone', icon: Sparkles, label: 'AI Zone', color: APP_THEME.circularMenuColors.aiZone, group: 'library' },
    { id: '3d-gen', icon: Box, label: 'AI 3D', color: APP_THEME.circularMenuColors.threeD, group: 'library' },
];

const GROUP_ORDER: Array<CircularMenuItem['group']> = ['select', 'retouch', 'create', 'library'];

const LAYER_ORDER_ITEMS: Array<{
    id: LayerOrderAction;
    icon: LucideIcon;
    label: string;
    canUse: (state: LayerOrderState | undefined) => boolean;
}> = [
        { id: 'to-front', icon: ChevronsUp, label: 'Bring layer to front', canUse: (state) => Boolean(state?.enabled && state?.canBringToFront) },
        { id: 'move-up', icon: ArrowUp, label: 'Move layer up', canUse: (state) => Boolean(state?.enabled && state?.canMoveUp) },
        { id: 'move-down', icon: ArrowDown, label: 'Move layer down', canUse: (state) => Boolean(state?.enabled && state?.canMoveDown) },
        { id: 'to-back', icon: ChevronsDown, label: 'Send layer to back', canUse: (state) => Boolean(state?.enabled && state?.canSendToBack) },
    ];

export default function CircularContextMenu({
    x,
    y,
    isOpen,
    onClose,
    onSelectTool,
    onLayerOrderAction,
    layerOrderState
}: CircularContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

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

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const itemCount = MENU_ITEMS.length;
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
        items: MENU_ITEMS.filter((item) => item.group === groupId),
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
                            title={isEnabled ? item.label : 'Select a layer to reorder'}
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

                    return (
                        <button
                            key={item.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectTool(item.id);
                                onClose();
                            }}
                            className="absolute w-10 h-10 bg-white dark:bg-zinc-800 rounded-full shadow-md border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors hover:scale-110 duration-200 z-10 group"
                            style={{
                                left: bx,
                                top: by,
                                transform: 'translate(-50%, -50%)'
                            }}
                            title={item.label}
                        >
                            <item.icon
                                size={18}
                                style={{ color: item.color }}
                                className="transition-colors group-hover:!text-white"
                            />
                            {/* Tooltip */}
                            <span className="absolute opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-2 py-1 rounded -bottom-8 pointer-events-none whitespace-nowrap transition-opacity">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

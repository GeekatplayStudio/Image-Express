'use client';

import React, { useEffect, useRef } from 'react';
import {
    Archive,
    Box,
    Calendar,
    Cloud,
    Image as ImageIcon,
    Library,
    Music,
    Search,
    Sparkles,
    Video,
    type LucideIcon,
} from 'lucide-react';
import useAppTheme from '@/hooks/useAppTheme';
import { useI18n } from '@/providers/I18nProvider';
import type { BookcaseFilter } from '@/features/asset-vault/contracts/bookcase';

export type VaultCircularAction =
    | 'vault-open'
    | 'vault-search'
    | 'vault-photos'
    | 'vault-videos'
    | 'vault-audio'
    | 'vault-3d'
    | 'vault-generated'
    | 'vault-drive'
    | 'vault-timeline'
    | 'vault-classic';

interface VaultCircularMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: VaultCircularAction, filter?: BookcaseFilter) => void;
}

type VaultMenuItem = {
    id: VaultCircularAction;
    icon: LucideIcon;
    labelKey: string;
    color: string;
    filter?: BookcaseFilter;
};

export default function VaultCircularMenu({
    x,
    y,
    isOpen,
    onClose,
    onAction,
}: VaultCircularMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const appTheme = useAppTheme();
    const { t } = useI18n();

    const menuItems: VaultMenuItem[] = [
        { id: 'vault-open', icon: Archive, labelKey: 'vault.circular.open', color: appTheme.circularMenuColors.assets },
        { id: 'vault-search', icon: Search, labelKey: 'vault.circular.search', color: '#8BA8AD' },
        { id: 'vault-photos', icon: ImageIcon, labelKey: 'vault.circular.photos', color: appTheme.circularMenuColors.assets, filter: { type: 'images', category: 'uploads' } },
        { id: 'vault-videos', icon: Video, labelKey: 'vault.circular.videos', color: '#9AC0C4', filter: { type: 'videos' } },
        { id: 'vault-audio', icon: Music, labelKey: 'vault.circular.audio', color: '#AD8BB0', filter: { type: 'audio' } },
        { id: 'vault-3d', icon: Box, labelKey: 'vault.circular.models', color: appTheme.circularMenuColors.threeD, filter: { type: 'models' } },
        { id: 'vault-generated', icon: Sparkles, labelKey: 'vault.circular.generated', color: appTheme.circularMenuColors.aiZone, filter: { type: 'images', category: 'generated' } },
        { id: 'vault-drive', icon: Cloud, labelKey: 'vault.circular.drive', color: '#7FAAB0', filter: { connector: 'google-drive' } },
        { id: 'vault-timeline', icon: Calendar, labelKey: 'vault.circular.timeline', color: '#C4B08B' },
        { id: 'vault-classic', icon: Library, labelKey: 'vault.circular.classic', color: '#AC9BC4' },
    ];

    useEffect(() => {
        const handlePointer = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handlePointer);
            document.addEventListener('contextmenu', handlePointer);
        }
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('contextmenu', handlePointer);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const itemCount = menuItems.length;
    const minArcSpacing = 44;
    const idealRadius = Math.max(68, Math.ceil((itemCount * minArcSpacing) / (2 * Math.PI)));
    const maxViewportRadius = viewportWidth > 0 && viewportHeight > 0
        ? Math.max(56, Math.floor(Math.min(viewportWidth, viewportHeight) / 2) - 28)
        : idealRadius;
    const radius = Math.min(idealRadius, maxViewportRadius);
    const angleStep = 360 / itemCount;
    const startAngle = -90;
    const safeMargin = radius + 28;
    const menuX = viewportWidth > 0 ? Math.min(Math.max(x, safeMargin), viewportWidth - safeMargin) : x;
    const menuY = viewportHeight > 0 ? Math.min(Math.max(y, safeMargin), viewportHeight - safeMargin) : y;

    return (
        <div
            ref={menuRef}
            className="fixed z-[110] w-0 h-0"
            style={{ left: menuX, top: menuY }}
            data-testid="vault-circular-menu"
        >
            <div className="relative animate-in zoom-in-50 duration-200">
                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/30 bg-primary/5"
                    style={{ width: `${radius * 2 + 20}px`, height: `${radius * 2 + 20}px` }}
                />
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 bg-card rounded-full shadow-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors z-20"
                    aria-label={t('common.close')}
                >
                    <Archive size={18} className="text-primary" />
                </button>
                {menuItems.map((item, index) => {
                    const angle = startAngle + index * angleStep;
                    const radian = (angle * Math.PI) / 180;
                    const bx = Math.cos(radian) * radius;
                    const by = Math.sin(radian) * radius;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onAction(item.id, item.filter);
                                onClose();
                            }}
                            className="absolute w-10 h-10 rounded-full shadow-md border bg-card border-border flex items-center justify-center transition-all duration-200 z-10 group hover:bg-primary hover:text-white hover:border-primary hover:scale-110"
                            style={{ left: bx, top: by, transform: 'translate(-50%, -50%)' }}
                            title={t(item.labelKey)}
                        >
                            <item.icon size={18} style={{ color: item.color }} className="transition-colors group-hover:!text-white" />
                            <span className="absolute opacity-0 group-hover:opacity-100 bg-black/85 text-white text-[10px] px-2 py-1 rounded -bottom-8 pointer-events-none whitespace-nowrap transition-opacity">
                                {t(item.labelKey)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export type { BookcaseFilter };

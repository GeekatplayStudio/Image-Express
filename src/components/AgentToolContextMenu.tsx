'use client';

import React, { useEffect, useRef } from 'react';
import { Bot, Megaphone } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

interface AgentToolContextMenuProps {
    position: { x: number; y: number };
    onSelect: (tool: 'super-agent' | 'campaign-manager') => void;
    onClose: () => void;
}

/**
 * The compact picker that opens on right-clicking the AI agent toolbar
 * button: Super Agent or Campaign Manager.
 */
export default function AgentToolContextMenu({ position, onSelect, onClose }: AgentToolContextMenuProps) {
    const { t } = useI18n();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const itemClass = 'w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2 transition-colors';

    return (
        <div
            ref={menuRef}
            role="menu"
            className="fixed z-[120] min-w-44 bg-card border border-border rounded-md shadow-xl py-1 animate-in fade-in duration-100"
            style={{ left: position.x, top: position.y }}
        >
            <button type="button" role="menuitem" className={itemClass} onClick={() => onSelect('super-agent')}>
                <Bot size={14} className="text-primary" /> {t('toolbar.superAgent')}
            </button>
            <button type="button" role="menuitem" className={itemClass} onClick={() => onSelect('campaign-manager')}>
                <Megaphone size={14} className="text-primary" /> {t('toolbar.campaignManager')}
            </button>
        </div>
    );
}

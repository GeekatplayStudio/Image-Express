'use client';

import React, { useEffect, useRef } from 'react';
import { Brush, PenTool, Type, Move, Image as ImageIcon, Shapes, Layers, PaintBucket } from 'lucide-react';

interface CircularContextMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    onSelectTool: (tool: string) => void;
}

const MENU_ITEMS = [
    { id: 'select', icon: Move, label: 'Move', color: '#60a5fa' }, // Blue
    { id: 'path-select', icon: PenTool, label: 'Path Select', color: '#8b5cf6' }, // Violet
    { id: 'layers', icon: Layers, label: 'Layers', color: '#4f46e5' }, // Indigo
    { id: 'text', icon: Type, label: 'Text', color: '#10b981' }, // Emerald
    { id: 'shapes', icon: Shapes, label: 'Shapes', color: '#0ea5e9' }, // Sky
    { id: 'paint', icon: Brush, label: 'Paint', color: '#f59e0b' }, // Amber
    { id: 'pen', icon: PenTool, label: 'Pen', color: '#a855f7' }, // Purple
    { id: 'gradient', icon: PaintBucket, label: 'Fill / Gradient', color: '#f97316' }, // Orange
    { id: 'assets', icon: ImageIcon, label: 'Assets', color: '#ec4899' }, // Pink
];

export default function CircularContextMenu({ x, y, isOpen, onClose, onSelectTool }: CircularContextMenuProps) {
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

    const radius = 68;
    const startAngle = -90; // Top
    
    // Position adjustments to keep inside viewport
    // but usually right click is fine.

    return (
        <div 
            ref={menuRef}
            className="fixed z-[100] w-0 h-0"
            style={{ left: x, top: y }}
        >
            <div className="relative animate-in zoom-in-50 duration-200">
                {/* Center Button (Close/Cancel) */}
                 <button 
                    onClick={onClose}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors z-20"
                 >
                     <div className="w-2 h-2 rounded-full bg-zinc-400" />
                 </button>

                {/* Satellite Buttons */}
                {MENU_ITEMS.map((item, index) => {
                    const total = MENU_ITEMS.length;
                    const angle = startAngle + (index * (360 / total));
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

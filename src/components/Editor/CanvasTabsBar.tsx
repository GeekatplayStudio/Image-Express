'use client';
// Canvas switcher for the multi-canvas project: a dropdown listing all
// canvases (newest on top), plus add-canvas, 3D stack view and layer-share
// controls.
import { useEffect, useRef, useState } from 'react';
import { Plus, Boxes, Link2, Globe2, ChevronDown, Check } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { Project } from '@/lib/multicanvas/projectStore';

type CanvasTabsBarProps = {
    project: Project;
    onOpenCanvas: (canvasId: string) => void;
    onAddCanvas: () => void;
    onOpenStackView: () => void;
    onToggleShareLayer: () => void;
    onShareWithProjects: () => void;
    hasOtherProjects: boolean;
};

export default function CanvasTabsBar({
    project, onOpenCanvas, onAddCanvas, onOpenStackView, onToggleShareLayer, onShareWithProjects, hasOtherProjects,
}: CanvasTabsBarProps) {
    const { t } = useI18n();
    const [isListOpen, setIsListOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeCanvas = project.canvases.find((c) => c.id === project.activeCanvasId);
    // Newest canvases appear at the top of the dropdown.
    const listedCanvases = [...project.canvases].reverse();
    // Navigation only appears once there is somewhere to navigate: the page
    // switcher needs a second page, the album/stack entries need either more
    // pages or other albums. The "+" stays — creating is always possible.
    const hasMultiplePages = project.canvases.length > 1;
    const hasAnywhereToGo = hasMultiplePages || hasOtherProjects;

    useEffect(() => {
        if (!isListOpen) return undefined;
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsListOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isListOpen]);

    return (
        <div className="relative z-30 flex items-center gap-1 px-2 py-1 border-b bg-card/60 backdrop-blur-sm text-xs" data-testid="canvas-tabs-bar">
            {hasMultiplePages && (
            <div ref={containerRef} className="relative">
                <button
                    onClick={() => setIsListOpen((open) => !open)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary/15 text-primary font-semibold border border-primary/30 transition-colors"
                    aria-expanded={isListOpen}
                    title={t('stack.switchCanvas')}
                    data-testid="canvas-dropdown-toggle"
                >
                    <span className="max-w-[160px] truncate">{activeCanvas?.name ?? ''}</span>
                    <ChevronDown size={12} className={`transition-transform ${isListOpen ? 'rotate-180' : ''}`} />
                </button>
                {isListOpen && (
                    <div
                        className="absolute left-0 top-full mt-1 w-56 max-h-72 overflow-y-auto bg-card border border-border/60 rounded-lg shadow-xl py-1 z-50"
                        data-testid="canvas-dropdown-list"
                    >
                        {listedCanvases.map((canvasEntry) => {
                            const active = canvasEntry.id === project.activeCanvasId;
                            return (
                                <button
                                    key={canvasEntry.id}
                                    onClick={() => {
                                        setIsListOpen(false);
                                        if (!active) onOpenCanvas(canvasEntry.id);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 transition-colors ${
                                        active ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                                    }`}
                                    data-testid={`canvas-tab-${canvasEntry.id}`}
                                >
                                    <span className="truncate">{canvasEntry.name}</span>
                                    {active && <Check size={12} className="shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            )}
            <button
                onClick={onAddCanvas}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={t('stack.newCanvas')}
                data-testid="canvas-tab-add"
            >
                <Plus size={14} />
            </button>
            {hasAnywhereToGo && (
            <>
            <div className="w-px h-4 bg-border mx-1" />
            <button
                onClick={onOpenStackView}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors font-medium"
                title={t('stack.openStack')}
                data-testid="canvas-stack-open"
            >
                <Boxes size={14} />
                <span>{t('stack.stack')}</span>
            </button>
            <button
                onClick={onToggleShareLayer}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors font-medium"
                title={t('stack.shareLayer')}
                data-testid="canvas-share-layer"
            >
                <Link2 size={14} />
                <span>{t('stack.share')}</span>
            </button>
            {hasOtherProjects && (
                <button
                    onClick={onShareWithProjects}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary transition-colors font-medium"
                    title={t('stack.shareWithProjects')}
                    data-testid="canvas-share-with-projects"
                >
                    <Globe2 size={14} />
                </button>
            )}
            </>
            )}
        </div>
    );
}

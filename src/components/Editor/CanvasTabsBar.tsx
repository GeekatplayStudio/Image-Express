'use client';
// Canvas tabs for the multi-canvas project: switch canvases, add a new one,
// open the 3D stack view, and toggle layer sharing across the project.
import { Plus, Boxes, Link2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import type { Project } from '@/lib/multicanvas/projectStore';

type CanvasTabsBarProps = {
    project: Project;
    onOpenCanvas: (canvasId: string) => void;
    onAddCanvas: () => void;
    onOpenStackView: () => void;
    onToggleShareLayer: () => void;
};

export default function CanvasTabsBar({
    project, onOpenCanvas, onAddCanvas, onOpenStackView, onToggleShareLayer,
}: CanvasTabsBarProps) {
    const { t } = useI18n();
    return (
        <div className="flex items-center gap-1 px-2 py-1 border-b bg-card/60 backdrop-blur-sm text-xs" data-testid="canvas-tabs-bar">
            <div className="flex items-center gap-1 overflow-x-auto">
                {project.canvases.map((canvasEntry) => {
                    const active = canvasEntry.id === project.activeCanvasId;
                    return (
                        <button
                            key={canvasEntry.id}
                            onClick={() => onOpenCanvas(canvasEntry.id)}
                            className={`px-3 py-1 rounded-md whitespace-nowrap transition-colors ${
                                active
                                    ? 'bg-primary/15 text-primary font-semibold border border-primary/30'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent'
                            }`}
                            data-testid={`canvas-tab-${canvasEntry.id}`}
                        >
                            {canvasEntry.name}
                        </button>
                    );
                })}
            </div>
            <button
                onClick={onAddCanvas}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={t('stack.newCanvas')}
                data-testid="canvas-tab-add"
            >
                <Plus size={14} />
            </button>
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
        </div>
    );
}

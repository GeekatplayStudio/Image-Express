'use client';

import type {
    CSSProperties,
    ComponentProps,
    Dispatch,
    DragEventHandler,
    SetStateAction,
} from 'react';
import { Lock, Unlock } from 'lucide-react';

import DesignCanvas from '@/components/DesignCanvas';
import ThreeDGenerator from '@/components/ThreeDGenerator';
import ThreeDLayerEditor from '@/components/ThreeDLayerEditor';
import TextQuickBar from '@/components/Editor/TextQuickBar';
import type { ExtendedFabricObject } from '@/types';
import type {
    CanvasLockControl,
    LockedLayerOverlayEntry,
} from '@/components/Editor/editorView.types';

type DesignCanvasProps = ComponentProps<typeof DesignCanvas>;
type ThreeDGeneratorProps = ComponentProps<typeof ThreeDGenerator>;
type ThreeDLayerEditorProps = ComponentProps<typeof ThreeDLayerEditor>;
type TextQuickBarProps = ComponentProps<typeof TextQuickBar>;
type CursorPreviewState = {
    kind: 'brush' | 'eyedropper';
    clientX: number;
    clientY: number;
    diameter: number;
};
type CanvasWorkspaceLockTarget = NonNullable<CanvasLockControl>['object'];

type CanvasControls = {
    onFileDrop: DragEventHandler<HTMLElement>;
    onOpenWorkspaceContextMenu: (x: number, y: number) => void;
    onCanvasReady: DesignCanvasProps['onCanvasReady'];
    onModified?: DesignCanvasProps['onModified'];
    initialWidth?: number;
    initialHeight?: number;
    onRightClick?: DesignCanvasProps['onRightClick'];
};

type ThreeDControls = {
    editingModelUrl: string | null;
    editingModelObject: ThreeDLayerEditorProps['existingObject'] | null;
    onCloseThreeDEditor: ThreeDLayerEditorProps['onClose'];
    onSaveThreeDEditor: ThreeDLayerEditorProps['onSave'];
    showThreeDGenerator: boolean;
    initialImage: ThreeDGeneratorProps['initialImage'];
    layerImageOptions: ThreeDGeneratorProps['layerImageOptions'];
    currentUser: ThreeDGeneratorProps['currentUser'];
    onOpenSettings: ThreeDGeneratorProps['onOpenSettings'];
    activeJob: ThreeDGeneratorProps['activeJob'];
    activeJobs: ThreeDGeneratorProps['activeJobs'];
    onStartBackgroundJob: ThreeDGeneratorProps['onStartBackgroundJob'];
    onRecoverBackgroundJob: ThreeDGeneratorProps['onRecoverBackgroundJob'];
    onAddToCanvas: ThreeDGeneratorProps['onAddToCanvas'];
    onCloseThreeDGenerator: ThreeDGeneratorProps['onClose'];
};

type TextControls = Pick<
    TextQuickBarProps,
    | 'visible'
    | 'left'
    | 'top'
    | 'textOptions'
    | 'onTextFontFamilyChange'
    | 'onTextFontStyleChange'
    | 'onTextFontSizeChange'
    | 'onTextColorChange'
    | 'onTextBoldChange'
    | 'onTextItalicChange'
    | 'onTextUnderlineChange'
    | 'onTextAlignChange'
    | 'onTextSpellcheckChange'
>;

type LockOverlayControls = {
    lockedLayerOverlayEntries: LockedLayerOverlayEntry[];
    canvasLockControl: CanvasLockControl | null;
    hoveredLockedLayerId: string | null;
    setHoveredLockedLayerId: Dispatch<SetStateAction<string | null>>;
    onSetObjectLocked: (object: CanvasWorkspaceLockTarget, locked: boolean) => void;
};

type UtilityControls = {
    bottomRightUtilityStyle: CSSProperties;
    zoom: number;
    utilityCanvasSize: { width: number; height: number };
    gridStatusLabel: string;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onFitToScreen: () => void;
    onResetZoom: () => void;
};

interface EditorCanvasWorkspaceProps {
    isDraggingPanel: boolean;
    canvasControls: CanvasControls;
    threeDControls: ThreeDControls;
    textControls: TextControls;
    lockOverlayControls: LockOverlayControls;
    cursorPreview: CursorPreviewState | null;
    utilityControls: UtilityControls;
}

export default function EditorCanvasWorkspace({
    isDraggingPanel,
    canvasControls,
    threeDControls,
    textControls,
    lockOverlayControls,
    cursorPreview,
    utilityControls,
}: EditorCanvasWorkspaceProps) {
    const {
        onFileDrop,
        onOpenWorkspaceContextMenu,
        onCanvasReady,
        onModified,
        initialWidth,
        initialHeight,
        onRightClick,
    } = canvasControls;
    const {
        editingModelUrl,
        editingModelObject,
        onCloseThreeDEditor,
        onSaveThreeDEditor,
        showThreeDGenerator,
        initialImage,
        layerImageOptions,
        currentUser,
        onOpenSettings,
        activeJob,
        activeJobs,
        onStartBackgroundJob,
        onRecoverBackgroundJob,
        onAddToCanvas,
        onCloseThreeDGenerator,
    } = threeDControls;
    const {
        lockedLayerOverlayEntries,
        canvasLockControl,
        hoveredLockedLayerId,
        setHoveredLockedLayerId,
        onSetObjectLocked,
    } = lockOverlayControls;
    const {
        bottomRightUtilityStyle,
        zoom,
        utilityCanvasSize,
        gridStatusLabel,
        onZoomOut,
        onZoomIn,
        onFitToScreen,
        onResetZoom,
    } = utilityControls;

    return (
        <main
            className="flex-1 bg-secondary/30 relative flex items-center justify-center overflow-hidden"
            onDrop={onFileDrop}
            onDragOver={(event) => {
                event.preventDefault();
            }}
        >
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />

            {isDraggingPanel && (
                <>
                    <div className="absolute left-0 top-0 bottom-0 w-32 bg-primary/10 border-r-2 border-primary z-50 flex items-center justify-center animate-in fade-in">
                        <span className="bg-background/80 px-2 py-1 rounded text-xs font-semibold">Drop to Dock Left</span>
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-primary/10 border-l-2 border-primary z-50 flex items-center justify-center animate-in fade-in">
                        <span className="bg-background/80 px-2 py-1 rounded text-xs font-semibold">Drop to Dock Right</span>
                    </div>
                </>
            )}

            <div
                className="absolute inset-0 z-0 overflow-hidden"
                onContextMenu={(event) => {
                    if ((event.target as HTMLElement).closest('.canvas-container')) return;
                    event.preventDefault();
                    onOpenWorkspaceContextMenu(event.clientX, event.clientY);
                }}
            >
                {editingModelUrl && (
                    <ThreeDLayerEditor
                        key={`${editingModelUrl}:${(editingModelObject as ExtendedFabricObject | null)?.id ?? 'active'}`}
                        modelUrl={editingModelUrl}
                        existingObject={editingModelObject ?? undefined}
                        onClose={onCloseThreeDEditor}
                        onSave={onSaveThreeDEditor}
                    />
                )}
                {showThreeDGenerator && (
                    <ThreeDGenerator
                        initialImage={initialImage}
                        layerImageOptions={layerImageOptions}
                        currentUser={currentUser}
                        onOpenSettings={onOpenSettings}
                        activeJob={activeJob}
                        activeJobs={activeJobs}
                        onStartBackgroundJob={onStartBackgroundJob}
                        onRecoverBackgroundJob={onRecoverBackgroundJob}
                        onAddToCanvas={onAddToCanvas}
                        onClose={onCloseThreeDGenerator}
                    />
                )}
                <DesignCanvas
                    onCanvasReady={onCanvasReady}
                    onModified={onModified}
                    initialWidth={initialWidth}
                    initialHeight={initialHeight}
                    onRightClick={onRightClick}
                />
                <TextQuickBar {...textControls} />
                {(lockedLayerOverlayEntries.length > 0 || canvasLockControl) && (
                    <div className="absolute inset-0 z-20 pointer-events-none">
                        {lockedLayerOverlayEntries.map((entry) => {
                            const isHovered = hoveredLockedLayerId === entry.id;
                            const isActiveLockTarget = canvasLockControl?.id === entry.id;
                            if (isActiveLockTarget) {
                                return null;
                            }

                            return (
                                <button
                                    type="button"
                                    key={`locked-layer-overlay-${entry.id}`}
                                    data-testid={`locked-layer-hover-unlock-${entry.id}`}
                                    aria-label={`Unlock layer ${entry.object.name || entry.id}`}
                                    className={`absolute pointer-events-auto flex items-center justify-center cursor-pointer transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.78)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70 rounded-[2px] ${isHovered ? 'text-white' : 'text-slate-200/90 hover:text-white'}`}
                                    style={{
                                        left: `${entry.iconBounds.left}px`,
                                        top: `${entry.iconBounds.top}px`,
                                        width: `${entry.iconBounds.width}px`,
                                        height: `${entry.iconBounds.height}px`,
                                    }}
                                    onMouseEnter={() => setHoveredLockedLayerId(entry.id)}
                                    onMouseLeave={() => setHoveredLockedLayerId((current) => (current === entry.id ? null : current))}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onSetObjectLocked(entry.object, false);
                                        setHoveredLockedLayerId(null);
                                    }}
                                >
                                    <Lock size={Math.max(8, Math.round(entry.iconBounds.width * 0.82))} />
                                </button>
                            );
                        })}
                        {canvasLockControl && (
                            <button
                                type="button"
                                data-testid={`transform-lock-toggle-${canvasLockControl.id}`}
                                aria-label={canvasLockControl.label}
                                className={`absolute pointer-events-auto flex items-center justify-center cursor-pointer transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.78)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70 rounded-[2px] ${canvasLockControl.locked
                                    ? 'text-slate-100/95 hover:text-white'
                                    : 'text-slate-400/95 hover:text-slate-200'}`}
                                style={{
                                    left: `${canvasLockControl.buttonBounds.left}px`,
                                    top: `${canvasLockControl.buttonBounds.top}px`,
                                    width: `${canvasLockControl.buttonBounds.width}px`,
                                    height: `${canvasLockControl.buttonBounds.height}px`,
                                }}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onSetObjectLocked(canvasLockControl.object, !canvasLockControl.locked);
                                    setHoveredLockedLayerId(null);
                                }}
                            >
                                {canvasLockControl.locked
                                    ? <Lock size={Math.max(9, Math.round(canvasLockControl.buttonBounds.width * 0.82))} />
                                    : <Unlock size={Math.max(9, Math.round(canvasLockControl.buttonBounds.width * 0.82))} />}
                            </button>
                        )}
                    </div>
                )}
                {cursorPreview && (
                    <div
                        data-testid="canvas-cursor-preview"
                        className="fixed z-30 pointer-events-none"
                        style={{
                            left: `${cursorPreview.clientX}px`,
                            top: `${cursorPreview.clientY}px`,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        {cursorPreview.kind === 'brush' ? (
                            <div
                                data-testid="canvas-cursor-preview-brush"
                                className="relative rounded-full border border-sky-300/95 shadow-[0_0_0_1px_rgba(15,23,42,0.55)]"
                                style={{
                                    width: `${cursorPreview.diameter}px`,
                                    height: `${cursorPreview.diameter}px`,
                                }}
                            >
                                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/95 shadow-[0_0_0_1px_rgba(15,23,42,0.6)]" />
                            </div>
                        ) : (
                            <div data-testid="canvas-cursor-preview-eyedropper" className="relative h-6 w-6">
                                <div className="absolute inset-0 rounded-full border border-sky-200/95 bg-slate-950/20 shadow-[0_0_0_1px_rgba(15,23,42,0.65)]" />
                                <div className="absolute left-1/2 top-[2px] h-[calc(100%-4px)] w-px -translate-x-1/2 bg-sky-100/95" />
                                <div className="absolute top-1/2 left-[2px] w-[calc(100%-4px)] h-px -translate-y-1/2 bg-sky-100/95" />
                                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100/95 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div
                data-testid="bottom-right-utilities"
                className="absolute z-30 flex flex-col items-end gap-2 pointer-events-none"
                style={bottomRightUtilityStyle}
            >
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                        Zoom {Math.round(zoom * 100)}%
                    </span>
                    <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                        Canvas {utilityCanvasSize.width}x{utilityCanvasSize.height}
                    </span>
                    <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border border-border/60 bg-popover/90 backdrop-blur text-muted-foreground">
                        Grid {gridStatusLabel}
                    </span>
                </div>
                <div className="flex items-center gap-1 bg-popover/90 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-border/50 pointer-events-auto">
                    <button
                        onClick={onZoomOut}
                        className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        title="Zoom Out"
                    >
                        -
                    </button>
                    <span className="text-xs font-mono text-muted-foreground w-12 text-center">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        onClick={onZoomIn}
                        className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        title="Zoom In"
                    >
                        +
                    </button>
                    <button
                        onClick={onFitToScreen}
                        className="px-2.5 py-1.5 text-xs rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Fit to Screen"
                    >
                        Fit
                    </button>
                    <button
                        onClick={onResetZoom}
                        className="px-2.5 py-1.5 text-xs rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Reset Zoom"
                    >
                        100
                    </button>
                </div>
            </div>
        </main>
    );
}

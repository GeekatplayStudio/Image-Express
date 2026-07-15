import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Layers, Folder, FolderPlus, Copy, Lock, Unlock, Link2, Link2Off, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Square, Brush, CornerLeftDown, CornerRightUp, Eye, EyeOff } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { LayerNode } from '@/types';
import { ensureObjectId } from '@/lib/fabric-utils';
import { SortableLayerItem } from './SortableLayerItem'; // Fix Import Path if needed
import { useI18n } from '@/providers/I18nProvider';

interface LayersViewProps {
    objects: fabric.Object[];
    selectedIds: Set<string>;
    selectedObject: fabric.Object | null;
    onSelect: (obj: fabric.Object, event?: React.MouseEvent) => void;
    onToggleVisibility: (obj: fabric.Object) => void;
    onToggleLock: (obj: fabric.Object) => void;
    onDelete: (obj: fabric.Object) => void;
    onReorder: (activeId: string, overId: string) => void; // Parent handles logic
    onRemoveFromFolder?: (itemId: string) => void;
    onAddToFolder?: (activeId: string, folderId: string) => void;
    onGroup: () => void;
    onUngroup: () => void;
    onCreateFolder: () => void;
    onLayerOpacityChange: (value: number) => void;
    onLayerBlendChange: (value: string) => void;
    onLayerNumericPropChange?: (prop: 'left' | 'top' | 'width' | 'height', value: number) => void;
    onDblClick?: (obj: fabric.Object) => void;
    /** Open the layer's full properties view (arrow button / double-click). */
    onOpenProperties?: (obj: fabric.Object) => void;
    onDuplicate?: () => void;
    onToggleClip?: (obj: fabric.Object) => void;
    /** Photoshop "Add layer mask" (reveal-all vector mask). */
    onAddMask?: (obj: fabric.Object) => void;
    /** Paint a raster mask over the layer. */
    onPaintMask?: (obj: fabric.Object) => void;
    /** Clip the given layer to the layer below it. */
    onClipToBelow?: (obj: fabric.Object) => void;
    /** Clip the layer above the given layer to it. */
    onClipLayerAbove?: (obj: fabric.Object) => void;
    /** Release the given layer's clipping mask. */
    onReleaseClip?: (obj: fabric.Object) => void;
    /** Edit the layer's mask (vector masks detach; raster masks reopen the painter). */
    onEditMask?: (obj: fabric.Object) => void;
    onMoveLayerUp?: () => void;
    onMoveLayerDown?: () => void;
    onBringLayerToFront?: () => void;
    onSendLayerToBack?: () => void;
    canMoveLayerUp?: boolean;
    canMoveLayerDown?: boolean;
    canBringLayerToFront?: boolean;
    canSendLayerToBack?: boolean;
    
    // Optional props for expanded state if managed by parent, otherwise local
    expandedFolders?: Set<string>;
    onToggleFolder?: (obj: fabric.Object) => void;
}

export function LayersView({
    objects,
    selectedIds,
    selectedObject,
    onSelect,
    onToggleVisibility,
    onToggleLock,
    onDelete,
    onReorder,
    onRemoveFromFolder,
    onAddToFolder,
    onGroup,
    onUngroup,
    onCreateFolder,
    onLayerOpacityChange,
    onLayerBlendChange,
    onLayerNumericPropChange,
    onDblClick,
    onOpenProperties,
    onDuplicate,
    onToggleClip,
    onAddMask,
    onPaintMask,
    onClipToBelow,
    onClipLayerAbove,
    onReleaseClip,
    onEditMask,
    onMoveLayerUp,
    onMoveLayerDown,
    onBringLayerToFront,
    onSendLayerToBack,
    canMoveLayerUp = false,
    canMoveLayerDown = false,
    canBringLayerToFront = false,
    canSendLayerToBack = false,
    expandedFolders: externalExpanded,
    onToggleFolder: externalToggleFolder
}: LayersViewProps) {
    
    const { t } = useI18n();
    const [localExpanded, setLocalExpanded] = useState<Set<string>>(new Set());
    const [inspectorLayerId, setInspectorLayerId] = useState<string | null>(null);
    const expanded = externalExpanded ?? localExpanded;

    // Right-click context menu for layer rows.
    const [contextMenu, setContextMenu] = useState<{ obj: fabric.Object; x: number; y: number } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!contextMenu) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu(null);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setContextMenu(null);
        };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [contextMenu]);

    const runContextAction = (action: (obj: fabric.Object) => void) => {
        if (!contextMenu) return;
        const target = contextMenu.obj;
        setContextMenu(null);
        action(target);
    };

    const selectedLayerId = selectedObject ? ensureObjectId(selectedObject) : null;
    const isInspectorOpen = !!selectedLayerId && selectedLayerId === inspectorLayerId;
    
    const handleToggleExpand = (obj: fabric.Object) => {
        if (externalToggleFolder) {
            externalToggleFolder(obj);
        } else {
             const id = ensureObjectId(obj);
             setLocalExpanded(prev => {
                 const next = new Set(prev);
                 if (next.has(id)) next.delete(id);
                 else next.add(id);
                 return next;
             });
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // Add distance to prevent drag on click
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Build Tree
    const layerTree = useMemo(() => {
        const build = (list: fabric.Object[], parentId: string | null, depth: number): LayerNode[] => {
            // Objects are usually in DOM order (Bottom to Top).
            // Layer list displays Top to Bottom.
            // So we reverse for display, but be careful with indexing.
            // The 'objects' prop passed here should probably be Top-to-Bottom for easier UI mapping
            // OR we handle reversing here.
            // Usually 'objects' from canvas.getObjects() is Bottom-to-Bottom.
            // We want [Top, ..., Bottom].
            
            // Let's assume input 'objects' is already consistently ordered by parent or we standardise.
            // Standard: Array of objects.
            
            return list.map(obj => {
                const id = ensureObjectId(obj);
                const children = obj.type === 'group' 
                    ? build([...(obj as fabric.Group).getObjects()].reverse(), id, depth + 1)
                    : [];
                
                return {
                    id,
                    obj,
                    parentId,
                    depth,
                    children
                };
            });
        };
        // Expect 'objects' to be passed in [Top...Bottom] order or handle it.
        // If parent passes canvas.getObjects().reverse(), we are good.
        return build(objects, null, 0);
    }, [objects]);

    const flatItems = useMemo(() => {
        const flatten = (nodes: LayerNode[]): LayerNode[] => {
            return nodes.flatMap(node => [node, ...flatten(node.children)]);
        };
        return flatten(layerTree);
    }, [layerTree]);

    // A layer is a clipping-mask base when the sibling row directly above it
    // (panel order = top-to-bottom) is clipped to it. Photoshop underlines these.
    const clipBaseIds = useMemo(() => {
        const bases = new Set<string>();
        const walk = (nodes: LayerNode[]) => {
            nodes.forEach((node, index) => {
                const ext = node.obj as fabric.Object & { isClippedToBelow?: boolean };
                if (ext.isClippedToBelow && index + 1 < nodes.length) {
                    bases.add(nodes[index + 1].id);
                }
                walk(node.children);
            });
        };
        walk(layerTree);
        return bases;
    }, [layerTree]);

    const itemIds = useMemo(() => flatItems.map(i => i.id), [flatItems]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Dropping ON a folder row nests into it only when the pointer sits near the
        // row's vertical center; drops near the edges reorder next to the folder,
        // matching how Photoshop distinguishes "into" from "between".
        const overNode = flatItems.find(n => n.id === over.id);
        const isGroup = overNode?.obj.type === 'group';
        if (isGroup && onAddToFolder) {
            const translated = active.rect.current.translated;
            const overRect = over.rect;
            const activeCenterY = translated ? translated.top + (translated.height / 2) : null;
            const overCenterY = overRect.top + (overRect.height / 2);
            const nearCenter = activeCenterY === null
                || Math.abs(activeCenterY - overCenterY) < overRect.height * 0.3;
            if (nearCenter) {
                onAddToFolder(String(active.id), String(over.id));
                return;
            }
        }

        onReorder(String(active.id), String(over.id));
    };

    const handleToggleInspector = (obj: fabric.Object) => {
        const id = ensureObjectId(obj);
        setInspectorLayerId((prev) => (prev === id ? null : id));
    };

    const applyNumericProp = (prop: 'left' | 'top' | 'width' | 'height', value: number) => {
        if (!onLayerNumericPropChange || Number.isNaN(value)) return;
        onLayerNumericPropChange(prop, value);
    };

    return (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex justify-between items-center">
                <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                    <Layers size={14} /> {t('layers.title')}
                </h2>
                <span className="text-[10px] text-muted-foreground">{objects.length} {t('layers.elements')}</span>
            </div>

            {/* Toolbar */}
             <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-secondary/5">
                 <div className="flex items-center gap-1">
                    <button onClick={onCreateFolder} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title={t('layers.newFolder')}>
                     <FolderPlus size={14} />
                    </button>
                    <button onClick={onGroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title={t('common.group')}>
                     <Folder size={14} />
                    </button>
                    <button onClick={onUngroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title={t('common.ungroup')}>
                     <Layers size={14} />
                    </button>
                    <button onClick={onDuplicate} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title={t('common.duplicate')}>
                     <Copy size={14} />
                    </button>
                    <div className="w-px h-5 bg-border/60 mx-1" />
                    <button
                        onClick={onMoveLayerUp}
                        disabled={!selectedObject || !canMoveLayerUp || !onMoveLayerUp}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('layers.moveUp')}
                    >
                        <ArrowUp size={14} />
                    </button>
                    <button
                        onClick={onMoveLayerDown}
                        disabled={!selectedObject || !canMoveLayerDown || !onMoveLayerDown}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('layers.moveDown')}
                    >
                        <ArrowDown size={14} />
                    </button>
                    <button
                        onClick={onBringLayerToFront}
                        disabled={!selectedObject || !canBringLayerToFront || !onBringLayerToFront}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('layers.toFront')}
                    >
                        <ChevronsUp size={14} />
                    </button>
                    <button
                        onClick={onSendLayerToBack}
                        disabled={!selectedObject || !canSendLayerToBack || !onSendLayerToBack}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('layers.toBack')}
                    >
                        <ChevronsDown size={14} />
                    </button>
                 </div>

                 <div className="flex items-center gap-1">
                    {(() => {
                        const ext = selectedObject as { clipped?: boolean; isClippedToBelow?: boolean; isAdjustmentLayer?: boolean } | null;
                        const isClipActive = !!(ext?.clipped || ext?.isClippedToBelow);
                        const clipTitle = ext?.isAdjustmentLayer
                            ? (ext.clipped ? 'Adjustment affects all layers below' : 'Clip adjustment to the layer below')
                            : (ext?.isClippedToBelow ? 'Release clipping mask' : 'Clip to layer below (clipping mask)');
                        return (
                            <button
                                onClick={() => selectedObject && onToggleClip?.(selectedObject)}
                                disabled={!selectedObject || !onToggleClip}
                                className={`p-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${isClipActive
                                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                                    : 'hover:bg-secondary text-muted-foreground'}`}
                                title={clipTitle}
                                aria-pressed={isClipActive}
                            >
                                {isClipActive ? <Link2Off size={14} /> : <Link2 size={14} />}
                            </button>
                        );
                    })()}
                    <button
                        onClick={() => selectedObject && onAddMask?.(selectedObject)}
                        disabled={!selectedObject || !onAddMask || !!selectedObject.clipPath}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedObject?.clipPath ? 'Layer already has a mask' : 'Add layer mask (reveal all)'}
                    >
                        <Square size={14} />
                    </button>
                    <button
                        onClick={() => selectedObject && onPaintMask?.(selectedObject)}
                        disabled={!selectedObject || !onPaintMask}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Paint raster mask (white reveals, black hides)"
                    >
                        <Brush size={14} />
                    </button>
                    <div className="w-px h-5 bg-border/60 mx-1" />
                    <button
                        onClick={() => selectedObject && onToggleLock(selectedObject)}
                        disabled={!selectedObject}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedObject && (selectedObject as { locked?: boolean }).locked ? 'Unlock selected layer' : 'Lock selected layer'}
                    >
                        {selectedObject && (selectedObject as { locked?: boolean }).locked ? <Unlock size={14} /> : <Lock size={14} />}
                    </button>
                    <button
                        onClick={() => selectedObject && onDelete(selectedObject)}
                        disabled={!selectedObject}
                        className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('layers.deleteSelected')}
                    >
                        <Trash2 size={14} />
                    </button>
                 </div>
             </div>

             {/* Layer Controls */}
             <div className="px-3 py-2 border-b border-border/30 bg-secondary/5 space-y-2">
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] text-muted-foreground w-14">{t('layers.opacity')}</span>
                     <input
                         type="range"
                         min={0}
                         max={1}
                         step={0.01}
                         value={selectedObject?.opacity ?? 1}
                         onChange={(e) => onLayerOpacityChange(parseFloat(e.target.value))}
                         disabled={!selectedObject}
                         className="flex-1 h-1.5 bg-secondary rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                     />
                     <span className="text-[10px] text-muted-foreground w-8 text-right">
                         {Math.round((selectedObject?.opacity ?? 1) * 100)}%
                     </span>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] text-muted-foreground w-14">{t('layers.blend')}</span>
                     <select
                         value={selectedObject?.globalCompositeOperation || 'source-over'}
                         onChange={(e) => onLayerBlendChange(e.target.value)}
                         disabled={!selectedObject}
                         className="flex-1 h-7 bg-secondary rounded-md text-[10px] px-2 border border-border/50 focus:ring-1 focus:ring-ring disabled:opacity-50"
                     >
                         <option value="source-over">Normal</option>
                         <option value="multiply">Multiply</option>
                         <option value="screen">Screen</option>
                         <option value="overlay">Overlay</option>
                         <option value="darken">Darken</option>
                         <option value="lighten">Lighten</option>
                         <option value="color-dodge">Color Dodge</option>
                         <option value="color-burn">Color Burn</option>
                         <option value="hard-light">Hard Light</option>
                         <option value="soft-light">Soft Light</option>
                         <option value="difference">Difference</option>
                         <option value="exclusion">Exclusion</option>
                         <option value="hue">Hue</option>
                         <option value="saturation">Saturation</option>
                         <option value="color">Color</option>
                         <option value="luminosity">Luminosity</option>
                     </select>
                 </div>
             </div>

             {isInspectorOpen && selectedObject && (
                <div className="px-3 py-2 border-b border-border/30 bg-secondary/5 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{t('layers.selectedLayerProps')}</div>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                            X
                            <input
                                type="number"
                                value={Math.round(selectedObject.left || 0)}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    applyNumericProp('left', next);
                                }}
                                className="h-7 bg-secondary rounded-md text-[11px] px-2 border border-border/50 focus:ring-1 focus:ring-ring"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                            Y
                            <input
                                type="number"
                                value={Math.round(selectedObject.top || 0)}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    applyNumericProp('top', next);
                                }}
                                className="h-7 bg-secondary rounded-md text-[11px] px-2 border border-border/50 focus:ring-1 focus:ring-ring"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                            W
                            <input
                                type="number"
                                value={Math.round((selectedObject.width || 0) * (selectedObject.scaleX || 1))}
                                min={1}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    applyNumericProp('width', next);
                                }}
                                className="h-7 bg-secondary rounded-md text-[11px] px-2 border border-border/50 focus:ring-1 focus:ring-ring"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                            H
                            <input
                                type="number"
                                value={Math.round((selectedObject.height || 0) * (selectedObject.scaleY || 1))}
                                min={1}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    applyNumericProp('height', next);
                                }}
                                className="h-7 bg-secondary rounded-md text-[11px] px-2 border border-border/50 focus:ring-1 focus:ring-ring"
                            />
                        </label>
                    </div>
                </div>
             )}

             {/* List */}
             <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                 <DndContext 
                     sensors={sensors} 
                     collisionDetection={closestCenter} 
                     onDragEnd={handleDragEnd}
                 >
                     <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                         {layerTree.map((node, index) => (
                             <SortableLayerItem
                                 key={node.id}
                                 id={node.id}
                                 obj={node.obj}
                                 index={index}
                                 total={objects.length}
                                 selectedIds={selectedIds}
                                 selectLayer={onSelect}
                                 toggleVisibility={onToggleVisibility}
                                 toggleLock={onToggleLock}
                                 deleteLayer={onDelete}
                                 removeFromFolder={onRemoveFromFolder}
                                 expanded={expanded.has(node.id)}
                                 expandedIds={expanded}
                                 onToggleExpand={handleToggleExpand}
                                 onDblClick={() => onDblClick && onDblClick(node.obj)}
                                 onOpenProperties={onOpenProperties}
                                 onToggleClip={onToggleClip}
                                 onToggleInspector={handleToggleInspector}
                                 inspectorLayerId={inspectorLayerId}
                                 sortableEnabled
                                 onRowContextMenu={(obj, x, y) => setContextMenu({ obj, x, y })}
                                 clipBaseIds={clipBaseIds}
                                 onEditMask={onEditMask}
                                 // We pass 'childrenNodes' separately from 'children' because 'children' in React is reserved
                                 childrenNodes={node.children}
                             />
                         ))}
                     </SortableContext>
                 </DndContext>
             </div>

             {/* Layer right-click context menu */}
             {contextMenu && (() => {
                 const ext = contextMenu.obj as fabric.Object & {
                     isClippedToBelow?: boolean;
                     isAdjustmentLayer?: boolean;
                     locked?: boolean;
                 };
                 const isVisible = contextMenu.obj.visible !== false;
                 const menuWidth = 220;
                 const menuLeft = Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - menuWidth - 8);
                 const menuTop = Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 280);
                 const itemClass = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

                 return (
                     <div
                         ref={contextMenuRef}
                         role="menu"
                         aria-label="Layer actions"
                         className="fixed z-[300] w-[220px] rounded-lg border border-border bg-card p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                         style={{ left: menuLeft, top: menuTop }}
                     >
                         {!ext.isAdjustmentLayer && (ext.isClippedToBelow ? (
                             <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onReleaseClip?.(obj))} disabled={!onReleaseClip}>
                                 <CornerLeftDown size={13} className="text-primary" /> {t('layers.releaseClippingMask')}
                             </button>
                         ) : (
                             <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onClipToBelow?.(obj))} disabled={!onClipToBelow}>
                                 <CornerLeftDown size={13} /> {t('layers.clipToLayerBelow')}
                             </button>
                         ))}
                         <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onClipLayerAbove?.(obj))} disabled={!onClipLayerAbove}>
                             <CornerRightUp size={13} /> {t('layers.clipLayerAbove')}
                         </button>
                         {!!contextMenu.obj.clipPath && !ext.isClippedToBelow && onEditMask && (
                             <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onEditMask(obj))}>
                                 <Brush size={13} /> {t('layers.editMask')}
                             </button>
                         )}
                         <div className="my-1 h-px bg-border/60" />
                         <button role="menuitem" className={itemClass} onClick={() => runContextAction(() => onDuplicate?.())} disabled={!onDuplicate}>
                             <Copy size={13} /> {t('common.duplicate')}
                             <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+J</span>
                         </button>
                         <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onToggleLock(obj))}>
                             {ext.locked ? <Unlock size={13} /> : <Lock size={13} />} {ext.locked ? t('common.unlock') : t('common.lock')}
                         </button>
                         <button role="menuitem" className={itemClass} onClick={() => runContextAction((obj) => onToggleVisibility(obj))}>
                             {isVisible ? <EyeOff size={13} /> : <Eye size={13} />} {isVisible ? t('common.hide') : t('common.show')}
                         </button>
                         <div className="my-1 h-px bg-border/60" />
                         <button
                             role="menuitem"
                             className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors"
                             onClick={() => runContextAction((obj) => onDelete(obj))}
                         >
                             <Trash2 size={13} /> {t('common.delete')}
                             <span className="ml-auto text-[10px] text-muted-foreground">Del</span>
                         </button>
                     </div>
                 );
             })()}
        </div>
    );
}

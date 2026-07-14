import React, { useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { Layers, Folder, FolderPlus, Copy, Lock, Unlock, Link2, Link2Off, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { LayerNode } from '@/types';
import { ensureObjectId } from '@/lib/fabric-utils';
import { SortableLayerItem } from './SortableLayerItem'; // Fix Import Path if needed

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
    onDuplicate?: () => void;
    onToggleClip?: (obj: fabric.Object) => void;
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
    onDuplicate,
    onToggleClip,
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
    
    const [localExpanded, setLocalExpanded] = useState<Set<string>>(new Set());
    const [inspectorLayerId, setInspectorLayerId] = useState<string | null>(null);
    // Defaults on so drag-to-reorder works immediately; the toggle still lets
    // users lock ordering off to avoid accidental drags.
    const [arrangeMode, setArrangeMode] = useState(true);
    const expanded = externalExpanded ?? localExpanded;

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

    const itemIds = useMemo(() => flatItems.map(i => i.id), [flatItems]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        // Check for dropping ON a group (Folder)
        // If sorting strategy shifts items, 'over' might be the item passing by.
        // However, if we drop, we check intent.
        // If 'over' is a group, and separate from active, allow dropping into.
        // Note: This relies on the 'over' ID reported by dnd-kit.
        const overNode = flatItems.find(n => n.id === over.id);
        const isGroup = overNode?.obj.type === 'group';
        
        // Basic heuristic: If we drop on a group, we prefer Adding to Folder over Reordering next to it
        // UNLESS we implement detailed drop zones.
        // Given the request "drag over folder layer and drop", we prioritize this if supported.
        if (isGroup && onAddToFolder && active.id !== over.id) {
             onAddToFolder(String(active.id), String(over.id));
             return; 
        }

        if (active.id !== over.id) {
            onReorder(String(active.id), String(over.id));
        }
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
                    <Layers size={14} /> Layers
                </h2>
                <span className="text-[10px] text-muted-foreground">{objects.length} elements</span>
            </div>

            {/* Toolbar */}
             <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-secondary/5">
                 <div className="flex items-center gap-1">
                    <button onClick={onCreateFolder} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="New Folder">
                     <FolderPlus size={14} />
                    </button>
                    <button onClick={onGroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="Group">
                     <Folder size={14} />
                    </button>
                    <button onClick={onUngroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="Ungroup">
                     <Layers size={14} />
                    </button>
                    <button onClick={onDuplicate} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="Duplicate">
                     <Copy size={14} />
                    </button>
                    <button
                        onClick={() => setArrangeMode((prev) => !prev)}
                        className={`p-1.5 rounded ${arrangeMode ? 'bg-secondary text-foreground' : 'hover:bg-secondary text-muted-foreground'}`}
                        title="Arrange layers"
                        aria-label="Arrange layers"
                        aria-pressed={arrangeMode}
                    >
                        <ArrowUpDown size={14} />
                    </button>
                    <div className="w-px h-5 bg-border/60 mx-1" />
                    <button
                        onClick={onMoveLayerUp}
                        disabled={!selectedObject || !canMoveLayerUp || !onMoveLayerUp}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Move selected layer up"
                    >
                        <ArrowUp size={14} />
                    </button>
                    <button
                        onClick={onMoveLayerDown}
                        disabled={!selectedObject || !canMoveLayerDown || !onMoveLayerDown}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Move selected layer down"
                    >
                        <ArrowDown size={14} />
                    </button>
                    <button
                        onClick={onBringLayerToFront}
                        disabled={!selectedObject || !canBringLayerToFront || !onBringLayerToFront}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Bring selected layer to front"
                    >
                        <ChevronsUp size={14} />
                    </button>
                    <button
                        onClick={onSendLayerToBack}
                        disabled={!selectedObject || !canSendLayerToBack || !onSendLayerToBack}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Send selected layer to back"
                    >
                        <ChevronsDown size={14} />
                    </button>
                 </div>

                 <div className="flex items-center gap-1">
                    <button
                        onClick={() => selectedObject && onToggleLock(selectedObject)}
                        disabled={!selectedObject}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedObject && (selectedObject as { locked?: boolean }).locked ? 'Unlock selected layer' : 'Lock selected layer'}
                    >
                        {selectedObject && (selectedObject as { locked?: boolean }).locked ? <Unlock size={14} /> : <Lock size={14} />}
                    </button>
                    <button
                        onClick={() => selectedObject && onToggleClip?.(selectedObject)}
                        disabled={!selectedObject || !onToggleClip}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedObject && (selectedObject as { clipped?: boolean }).clipped ? 'Unclip selected layer' : 'Clip selected layer'}
                    >
                        {selectedObject && (selectedObject as { clipped?: boolean }).clipped ? <Link2Off size={14} /> : <Link2 size={14} />}
                    </button>
                    <button
                        onClick={() => selectedObject && onDelete(selectedObject)}
                        disabled={!selectedObject}
                        className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Delete selected layer"
                    >
                        <Trash2 size={14} />
                    </button>
                 </div>
             </div>

             {/* Layer Controls */}
             <div className="px-3 py-2 border-b border-border/30 bg-secondary/5 space-y-2">
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
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
                     <span className="text-[10px] text-muted-foreground w-14">Blend</span>
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
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Selected Layer Properties</div>
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
                                 onToggleClip={onToggleClip}
                                 onToggleInspector={handleToggleInspector}
                                 inspectorLayerId={inspectorLayerId}
                                 sortableEnabled={arrangeMode}
                                 // We pass 'childrenNodes' separately from 'children' because 'children' in React is reserved
                                 childrenNodes={node.children}
                             />
                         ))}
                     </SortableContext>
                 </DndContext>
             </div>
        </div>
    );
}

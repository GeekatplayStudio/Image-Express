import React, { useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { Layers, Folder, FolderPlus, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ExtendedFabricObject, LayerNode } from '@/types';
import { ensureObjectId } from '@/lib/fabric-utils';
import { SortableLayerItem } from './SortableLayerItem'; // Fix Import Path if needed

interface LayersViewProps {
    objects: fabric.Object[];
    selectedIds: Set<string>;
    onSelect: (obj: fabric.Object, event?: React.MouseEvent) => void;
    onToggleVisibility: (obj: fabric.Object) => void;
    onToggleLock: (obj: fabric.Object) => void;
    onDelete: (obj: fabric.Object) => void;
    onReorder: (activeId: string, overId: string) => void; // Parent handles logic
    onGroup: () => void;
    onUngroup: () => void;
    onCreateFolder: () => void;
    onDblClick?: (obj: fabric.Object) => void;
    
    // Optional props for expanded state if managed by parent, otherwise local
    expandedFolders?: Set<string>;
    onToggleFolder?: (obj: fabric.Object) => void;
}

export function LayersView({
    objects,
    selectedIds,
    onSelect,
    onToggleVisibility,
    onToggleLock,
    onDelete,
    onReorder,
    onGroup,
    onUngroup,
    onCreateFolder,
    onDblClick,
    expandedFolders: externalExpanded,
    onToggleFolder: externalToggleFolder
}: LayersViewProps) {
    
    const [localExpanded, setLocalExpanded] = useState<Set<string>>(new Set());
    const expanded = externalExpanded ?? localExpanded;
    
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

    const flatten = (nodes: LayerNode[]): LayerNode[] => {
        return nodes.flatMap(node => [node, ...flatten(node.children)]);
    };
    
    const flatItems = useMemo(() => flatten(layerTree), [layerTree]);
    const itemIds = useMemo(() => flatItems.map(i => i.id), [flatItems]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            onReorder(String(active.id), String(over.id));
        }
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
             <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30 bg-secondary/5">
                 <button onClick={onCreateFolder} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="New Folder">
                     <FolderPlus size={14} />
                 </button>
                 <button onClick={onGroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="Group">
                     <Folder size={14} />
                 </button>
                 <button onClick={onUngroup} className="p-1.5 hover:bg-secondary rounded text-muted-foreground" title="Ungroup">
                     <Layers size={14} />
                 </button>
             </div>

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
                                 expanded={expanded.has(node.id)}
                                 expandedIds={expanded}
                                 onToggleExpand={handleToggleExpand}
                                 onDblClick={() => onDblClick && onDblClick(node.obj)}
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

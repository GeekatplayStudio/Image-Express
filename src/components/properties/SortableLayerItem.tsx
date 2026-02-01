import React, { useState, useRef } from 'react';
import * as fabric from 'fabric';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Folder, FolderOpen, ChevronRight, ChevronDown, Eye, EyeOff, Lock, Unlock, Trash2, Blend, Image as ImageIcon } from 'lucide-react';
import { ExtendedFabricObject, LayerNode } from '@/types';

interface SortableLayerItemProps {
    id: string;
    obj: fabric.Object;
    index: number;
    selectedIds: Set<string>;
    selectLayer: (obj: fabric.Object, event?: React.MouseEvent) => void;
    toggleVisibility: (obj: fabric.Object) => void;
    toggleLock: (obj: fabric.Object) => void;
    deleteLayer: (obj: fabric.Object) => void;
    total: number;
    onDblClick?: () => void;
    depth?: number;
    onToggleExpand?: (obj: fabric.Object) => void;
    expanded?: boolean;
    expandedIds: Set<string>;
    childrenNodes?: LayerNode[];
}

export function SortableLayerItem({ id, obj, index, selectedIds, selectLayer, toggleVisibility, toggleLock, deleteLayer, total, onDblClick, depth = 0, onToggleExpand, expanded = false, expandedIds, childrenNodes = [] }: SortableLayerItemProps) {
    const extendedObj = obj as ExtendedFabricObject;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver
    } = useSortable({ id });

    const isGroup = obj.type === 'group';
    const children = childrenNodes;
    const isSelected = selectedIds.has(id);

    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(extendedObj.name || (extendedObj.isAdjustmentLayer ? 'Adjustment' : (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type === 'group' ? 'Folder' : (obj.type || 'Object')))));
    // Use fill as color, defaulting to transparent or black if complex
    const [layerColor, setLayerColor] = useState(() => {
         if (typeof obj.fill === 'string') return obj.fill;
         return '#000000';
    });
    // Layer Tag Color (Grab Area)
    const [tagColor, setTagColor] = useState(extendedObj.layerTagColor || 'transparent');
    const tagColorInputRef = useRef<HTMLInputElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative' as const,
        marginLeft: `${depth * 20}px`
    };
    
    // Check internal visible state
    const isVisible = obj.visible !== false; 
    const isLocked = (obj as ExtendedFabricObject).locked === true; 


    const handleNameSave = () => {
        setIsEditing(false);
        obj.set('name', name);
    };

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setLayerColor(newColor);
        obj.set('fill', newColor);
        obj.canvas?.requestRenderAll();
    };

    const handleTagColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setTagColor(newColor);
        extendedObj.set('layerTagColor', newColor);
        // We don't need re-render canvas for this usually, but to be safe if we serialize later
    };

    return (
        <div ref={setNodeRef} style={style} className="mb-1">
        <div 
            onClick={(event) => selectLayer(obj, event)}
            onDoubleClick={() => {
                 // Propagate double click to switch view
                 // Don't stop propagation if we hit inner elements like name edit
                 // But wait, name edit has stopPropagation.
                 if (onDblClick) onDblClick();
            }}
            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all group ${
                isSelected 
                ? 'bg-primary/10 border-primary/30 shadow-sm' 
                : 'bg-card border-border/50 hover:bg-secondary/50'
            } ${isDragging ? 'opacity-50 shadow-xl ring-2 ring-primary/20' : ''} ${isOver && isGroup ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
        >
            <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="cursor-move text-muted-foreground/50 hover:text-foreground p-1 hover:bg-secondary rounded touch-none relative"
                    style={{ backgroundColor: tagColor !== 'transparent' ? tagColor : undefined, color: tagColor !== 'transparent' ? '#fff' : undefined }}
                    onMouseDown={(e) => isEditing && e.stopPropagation()}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        tagColorInputRef.current?.click();
                    }}
                    title="Double-click to set layer tag color"
                >
                    <GripVertical size={14} style={{ mixBlendMode: tagColor !== 'transparent' ? 'difference' : 'normal' }} />
                    <input 
                        ref={tagColorInputRef}
                        type="color"
                        className="sr-only"
                        value={tagColor === 'transparent' ? '#808080' : tagColor}
                        onChange={handleTagColorChange}
                    />
                </div>
                
                 {/* Expand / Collapse for Group */}
                 {isGroup && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleExpand) onToggleExpand(obj);
                        }} 
                        className="p-0.5 hover:bg-secondary rounded text-muted-foreground"
                    >
                         {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                 )}

                <div className="relative w-8 h-8 rounded bg-background border flex items-center justify-center text-muted-foreground shrink-0 select-none overflow-hidden group/color">
                    {/* Background Color Indicator */}
                    <div 
                        className="absolute inset-0 opacity-20" 
                        style={{ backgroundColor: typeof obj.fill === 'string' ? obj.fill : undefined }} 
                    />
                    
                    {/* Icon */}
                    {obj.type === 'rect' && <div className="w-4 h-4 bg-foreground rounded-sm opacity-50" />}
                    {obj.type === 'circle' && <div className="w-4 h-4 bg-foreground rounded-full opacity-50" />}
                    {obj.type === 'triangle' && <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-foreground opacity-50" />}
                    {(obj.type === 'text' || obj.type === 'i-text') && <span className="text-xs font-serif font-bold">T</span>}
                    {extendedObj.isAdjustmentLayer && <Blend size={14} />}
                    {!extendedObj.isAdjustmentLayer && obj.type === 'image' && <ImageIcon size={14} />}
                    {obj.type === 'group' && (expanded ? <FolderOpen size={14} /> : <Folder size={14} />)}
                    {'isStar' in obj && <div className="text-[8px]">★</div>}

                     {/* Color Input Overlay (Not for images) */}
                     {obj.type !== 'image' && obj.type !== 'group' && !extendedObj.isAdjustmentLayer && (
                        <input 
                            type="color" 
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            value={layerColor}
                            onChange={handleColorChange}
                            onClick={(e) => e.stopPropagation()}
                            title="Change Color"
                        />
                    )}
                </div>

                <div className="flex flex-col min-w-0 select-none flex-1">
                    {isEditing ? (
                        <input 
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={handleNameSave}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleNameSave();
                                if (e.key === 'Escape') {
                                    setIsEditing(false);
                                    setName((obj as ExtendedFabricObject).name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type === 'group' ? 'Folder' : (obj.type || 'Object'))));
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-medium bg-background border rounded px-1 h-5 min-w-0 outline-none focus:ring-1 focus:ring-primary"
                        />
                    ) : (
                        <span 
                            className="text-sm font-medium truncate"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            title="Double click to rename"
                        >
                            {(obj as ExtendedFabricObject).name || (extendedObj.isAdjustmentLayer ? 'Adjustment' : (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type === 'group' ? 'Folder' : (obj.type || 'Object'))))}
                        </span>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{isGroup ? `${children.length} items` : `Layer ${total - index}`}</span>
                        {/* <typeInfo.icon size={12} className={typeInfo.className} /> */}
                        {isVisible ? (
                            <Eye size={12} className="text-emerald-500" />
                        ) : (
                            <EyeOff size={12} className="text-rose-500" />
                        )}
                        {isLocked && <Lock size={12} className="text-amber-500" />}
                    </div>
                </div>
            </div>
            
            <div className={`flex items-center gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100'} transition-opacity ml-2`}>
                <button
                    onClick={(e) => { e.stopPropagation(); toggleLock(obj); }}
                    className={`p-1.5 hover:bg-secondary rounded-md ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-foreground'}`}
                    title={isLocked ? "Unlock" : "Lock"}
                >
                    {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(obj); }}
                    className={`p-1.5 hover:bg-secondary rounded-md ${isVisible ? 'text-emerald-500 hover:text-emerald-600' : 'text-rose-500 hover:text-rose-600'}`}
                    title={isVisible ? "Hide" : "Show"}
                >
                    {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); deleteLayer(obj); }}
                    className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive/20"
                    title="Delete"
                >
                    <Trash2 size={12} />
                </button>
            </div>
            </div>
            
            {/* Render Children if Group and Expanded */}
            {isGroup && expanded && children.length > 0 && (
                 <div className="border-l-2 border-border/50 ml-6 pl-2 mt-1 space-y-1">
                     {children.map((child, i) => (
                         <SortableLayerItem 
                            key={`child-${child.id}`} 
                            id={child.id}
                            obj={child.obj} 
                            index={i} 
                            total={children.length}
                            selectedIds={selectedIds}
                            selectLayer={selectLayer}
                            toggleVisibility={toggleVisibility}
                            toggleLock={toggleLock}
                            deleteLayer={deleteLayer}
                            depth={depth + 1}
                            // Recursive props
                            onDblClick={onDblClick}
                            onToggleExpand={onToggleExpand}
                                     expanded={expandedIds.has(child.id)}
                                     expandedIds={expandedIds}
                            childrenNodes={child.children}
                         />
                     ))}
                 </div>
            )}
        </div>
    );
}


'use client';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { StarPolygon, ExtendedFabricObject } from '@/types';
import { Trash2, Layers, GripVertical, Settings, Image as ImageIcon, Box, Eye, EyeOff, Lock, Unlock, ArrowLeftRight, Blend, Wand2, Play, ExternalLink, Folder, FolderOpen, ChevronRight, ChevronDown, FolderPlus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';

type CanvasWithArtboard = fabric.Canvas & {
    artboard?: { width: number; height: number; left: number; top: number };
    artboardRect?: fabric.Rect;
    centerArtboard?: () => void;
    hostContainer?: HTMLDivElement;
    workspaceBackground?: string;
    setWorkspaceBackground?: (color: string) => void;
    getWorkspaceBackground?: () => string;
};

const PRESET_SIZES = [
    { name: 'Square (IG)', w: 1080, h: 1080 },
    { name: 'Story (IG)', w: 1080, h: 1920 },
    { name: 'Landscape', w: 1920, h: 1080 },
    { name: 'Portrait', w: 1080, h: 1350 },
    { name: 'Thumbnail', w: 1280, h: 720 },
];

const channelToHex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');

const normalizeColorValue = (value?: string) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4) {
            const r = trimmed[1];
            const g = trimmed[2];
            const b = trimmed[3];
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }
        return trimmed.toLowerCase();
    }

    const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
    }

    return trimmed;
};

const parseColorWithAlpha = (value?: string) => {
    if (!value) return { color: '#000000', alpha: 1 };
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'transparent') return { color: '#000000', alpha: 0 };
    const rgbaMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
    if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1], 10);
        const g = parseInt(rgbaMatch[2], 10);
        const b = parseInt(rgbaMatch[3], 10);
        const alpha = rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1;
        return { color: `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`, alpha };
    }

    const normalized = normalizeColorValue(trimmed);
    return { color: normalized ?? trimmed, alpha: 1 };
};

const applyAlphaToColor = (color: string, alpha: number) => {
    const normalized = normalizeColorValue(color) ?? color;
    if (!normalized.startsWith('#')) return normalized;
    const hex = normalized.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
};
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * PropertiesPanel
 * Right sidebar for managing object properties, layers, and canvas settings.
 * Includes Layer Tagging (Double-click grip) and Gradient/Solid Fill controls.
 */
interface PropertiesPanelProps {
    canvas: fabric.Canvas | null;
    activeTool?: string;
    onMake3D?: (imageUrl: string) => void;
    onLayerDblClick?: () => void;
    onPreviewMedia?: (payload: { type: 'video' | 'audio'; url: string }) => void;
}

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

type LayerNode = {
    id: string;
    obj: fabric.Object;
    parentId: string | null;
    depth: number;
    children: LayerNode[];
};

// Sortable Layer Item Component
function SortableLayerItem({ id, obj, index, selectedIds, selectLayer, toggleVisibility, toggleLock, deleteLayer, total, onDblClick, depth = 0, onToggleExpand, expanded = false, expandedIds, childrenNodes = [] }: SortableLayerItemProps) {
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
    const [name, setName] = useState(extendedObj.name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type === 'group' ? 'Folder' : (obj.type || 'Object'))));
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
                    {obj.type === 'image' && <ImageIcon size={14} />}
                    {obj.type === 'group' && (expanded ? <FolderOpen size={14} /> : <Folder size={14} />)}
                    {'isStar' in obj && <div className="text-[8px]">★</div>}

                     {/* Color Input Overlay (Not for images) */}
                     {obj.type !== 'image' && obj.type !== 'group' && (
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
                            {(obj as ExtendedFabricObject).name || (obj.type === 'i-text' ? (obj as fabric.IText).text : (obj.type === 'group' ? 'Folder' : (obj.type || 'Object')))}
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

export default function PropertiesPanel({ canvas, activeTool, onMake3D, onLayerDblClick, onPreviewMedia }: PropertiesPanelProps) {
    const dialog = useDialog();
    const { toast } = useToast();
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
    const [objects, setObjects] = useState<fabric.Object[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const lastSelectedIdRef = useRef<string | null>(null);
    const layerOrderRef = useRef<string[]>([]);
    
    // Folder Expansion State
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    const ensureObjectId = useCallback((obj: fabric.Object) => {
        const extendedObj = obj as ExtendedFabricObject;
        if (!extendedObj.id) {
            const fallback = extendedObj.cacheKey ? `obj-${extendedObj.cacheKey}` : `obj-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
            extendedObj.id = fallback;
        }
        return extendedObj.id;
    }, []);

    const buildLayerTree = useCallback((items: fabric.Object[], parentId: string | null, depth: number): LayerNode[] => {
        const walk = (list: fabric.Object[], parent: string | null, level: number): LayerNode[] => {
            return list.map((obj) => {
                const id = ensureObjectId(obj);
                const children = obj.type === 'group'
                    ? walk([...(obj as fabric.Group).getObjects()].reverse(), id, level + 1)
                    : [];
                return {
                    id,
                    obj,
                    parentId: parent,
                    depth: level,
                    children
                };
            });
        };

        return walk(items, parentId, depth);
    }, [ensureObjectId]);

    const flattenLayerTree = useCallback((nodes: LayerNode[]): LayerNode[] => {
        const walk = (list: LayerNode[]): LayerNode[] => {
            return list.flatMap((node) => [node, ...walk(node.children)]);
        };
        return walk(nodes);
    }, []);

    const layerTree = useMemo(() => buildLayerTree(objects, null, 0), [buildLayerTree, objects]);
    const flatLayers = useMemo(() => flattenLayerTree(layerTree), [flattenLayerTree, layerTree]);
    const layerMap = useMemo(() => new Map(flatLayers.map((node) => [node.id, node])), [flatLayers]);

    useEffect(() => {
        layerOrderRef.current = flatLayers.map((node) => node.id);
    }, [flatLayers]);
    
    const toggleFolder = useCallback((obj: fabric.Object) => {
        const id = (obj as ExtendedFabricObject).id;
        if (!id) return;
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const getNextIndexedName = useCallback((base: string, names: string[]) => {
        const matcher = new RegExp(`^${base}\\s*(\\d+)?$`, 'i');
        let max = 0;
        names.forEach((name) => {
            const trimmed = name.trim();
            const match = trimmed.match(matcher);
            if (match) {
                const num = match[1] ? parseInt(match[1], 10) : 1;
                if (!Number.isNaN(num)) max = Math.max(max, num);
            }
        });
        return `${base} ${max + 1}`;
    }, []);

    const getGroupNames = useCallback(() => {
        if (!canvas) return [] as string[];
        return canvas.getObjects().filter((obj) => obj.type === 'group').map((obj) => {
            const name = (obj as ExtendedFabricObject).name;
            return name ?? 'Folder';
        });
    }, [canvas]);

    const addToGroup = useCallback((group: fabric.Group, obj: fabric.Object) => {
        const groupWithUpdate = group as fabric.Group & { addWithUpdate?: (obj: fabric.Object) => void };
        if (typeof groupWithUpdate.addWithUpdate === 'function') {
            groupWithUpdate.addWithUpdate(obj);
        } else {
            group.add(obj);
            group.setCoords();
        }
    }, []);

    const moveObjectToGroup = useCallback((obj: fabric.Object, group: fabric.Group, targetCanvas: fabric.Canvas) => {
        const objMatrix = obj.calcTransformMatrix();
        const parentGroup = obj.group as fabric.Group | undefined;
        if (parentGroup) {
            parentGroup.remove(obj);
            parentGroup.setCoords();
        } else {
            targetCanvas.remove(obj);
        }

        const groupMatrix = group.calcTransformMatrix();
        const inverseGroup = fabric.util.invertTransform(groupMatrix);
        const finalMatrix = fabric.util.multiplyTransformMatrices(inverseGroup, objMatrix);
        fabric.util.applyTransformToObject(obj, finalMatrix);
        obj.setCoords();

        addToGroup(group, obj);
    }, [addToGroup]);

    const moveObjectToCanvas = useCallback((obj: fabric.Object, parentGroup: fabric.Group, targetCanvas: fabric.Canvas) => {
        const objMatrix = obj.calcTransformMatrix();
        const groupMatrix = parentGroup.calcTransformMatrix();
        const finalMatrix = fabric.util.multiplyTransformMatrices(groupMatrix, objMatrix);
        fabric.util.applyTransformToObject(obj, finalMatrix);
        obj.setCoords();

        parentGroup.remove(obj);
        parentGroup.setCoords();
        targetCanvas.add(obj);
    }, []);

    const isDescendant = useCallback((ancestorId: string, nodeId: string) => {
        let current = layerMap.get(nodeId)?.parentId ?? null;
        while (current) {
            if (current === ancestorId) return true;
            current = layerMap.get(current)?.parentId ?? null;
        }
        return false;
    }, [layerMap]);

    // Grouping Functions
    const groupSelectedLayers = useCallback(() => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'activeSelection') {
             toast({ title: 'Select multiple layers', description: 'Hold Shift to select multiple items to group.', variant: 'default' });
             return;
        }
        
        // Fabric 6+ friendly grouping
        const objects = canvas.getActiveObjects();
        // Remove from canvas (active selection logic typically handles this during grouping, but manual approach is safer)
        canvas.discardActiveObject();
        objects.forEach(obj => canvas.remove(obj));
        
           const group = new fabric.Group(objects, {
               canvas: canvas,
               interactive: true
           });
           const folderName = getNextIndexedName('Folder', getGroupNames());
           group.set('name', folderName);
        (group as ExtendedFabricObject).id = `group-${Date.now()}`;
        
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.fire('selection:created', { selected: [group] });
        
        canvas.requestRenderAll();
        canvas.fire('object:modified');
        
        // Auto expand
        setExpandedFolders(prev => new Set(prev).add((group as ExtendedFabricObject).id!));
    }, [canvas, getGroupNames, getNextIndexedName, toast]);

    const ungroupSelectedLayer = useCallback(() => {
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'group') {
             toast({ title: 'Select a group', description: 'Select a Folder/Group to ungroup.', variant: 'default' });
             return;
        }
        
        const group = active as fabric.Group;
        const items = [...group.getObjects()];

        // Restore items to canvas with preserved coordinates
        items.forEach((item) => {
            moveObjectToCanvas(item, group, canvas);
        });

        // Remove group after extraction
        canvas.remove(group);
        
        // Select un-grouped items
        const selection = new fabric.ActiveSelection(items, { canvas: canvas });
        canvas.setActiveObject(selection);
        canvas.fire('selection:created', { selected: items });
        
        canvas.requestRenderAll();
        canvas.fire('object:modified');
    }, [canvas, moveObjectToCanvas, toast]);

    const createEmptyFolder = useCallback(() => {
        if (!canvas) return;
        const group = new fabric.Group([], {
            selectable: true,
            evented: true
        });
        const folderName = getNextIndexedName('Folder', getGroupNames());
        group.set('name', folderName);
        const extGroup = group as ExtendedFabricObject;
        if (!extGroup.id) extGroup.id = `group-${Date.now()}`;
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.fire('selection:created', { selected: [group] });
        canvas.requestRenderAll();
        setExpandedFolders(prev => new Set(prev).add(extGroup.id!));
    }, [canvas, getGroupNames, getNextIndexedName]);

    // Helpers to Move Items In/Out of active Group (if single group selected) OR Create Empty
    // Creating "Empty" folder in Fabric is tricky because Group usually needs width/height.
    // We can create a Group with invisible object?
    
    // Instead, let's focus on "Selection -> Group" and "Group -> Ungroup" which covers 90% use case.
    
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [color, setColor] = useState('#000000');
    // Gradient State
    const [isGradient, setIsGradient] = useState(false);
    const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
    const [gradientStart, setGradientStart] = useState('#000000');
    const [gradientEnd, setGradientEnd] = useState('#ffffff');
    const [gradientAngle, setGradientAngle] = useState(0);
    const [gradientTransition, setGradientTransition] = useState(1); // Default 1 (full spread)

    const [opacity, setOpacity] = useState(1);
    const [fontFamily, setFontFamily] = useState('Arial');
    const [fontWeight, setFontWeight] = useState('normal');
    
    // Canvas Sizing
    const [canvasWidth, setCanvasWidth] = useState(1080);
    const [canvasHeight, setCanvasHeight] = useState(1080);
    const [canvasColor, setCanvasColor] = useState('#ffffff');
    const [selectedPreset, setSelectedPreset] = useState<string>('Custom');
    const [workspaceBgColor, setWorkspaceBgColor] = useState('#1e1e1e');

    // Star specific properties
    const [starPoints, setStarPoints] = useState(5);
    const [starInnerRadius, setStarInnerRadius] = useState(0.5);

    // Painting Tool State
    const [paintColor, setPaintColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(10);
    const [brushType, setBrushType] = useState('Pencil');
    const [paintOpacity, setPaintOpacity] = useState(1);
    
    // Advanced Paint Settings
    const [brushBlur, setBrushBlur] = useState(0); // Softness
    const [sprayDensity, setSprayDensity] = useState(20);
    const [paintBlendMode, setPaintBlendMode] = useState('source-over');
    
    // Check if we have an active "Folder" (Group) for current session
    // This resets when tool changes away from 'paint'
    const currentPaintGroupRef = useRef<fabric.Group | null>(null);

    // Effect Helpers
    useEffect(() => {
        if (!canvas) return;
        
        // Reset Paint Group when activeTool changes
        if (activeTool !== 'paint') {
            currentPaintGroupRef.current = null;
        }

        const handlePathCreated = (e: { path: fabric.Object }) => {
            if (activeTool !== 'paint' || !e.path) return;
            
            const path = e.path;
            path.set({ globalCompositeOperation: paintBlendMode });
            
            // Should we add to a group?
            // If user explicitly stated "create folder and place new layers there"
            // We lazily create the group on the first stroke of a session
            
              let group = currentPaintGroupRef.current;
            
              // Check if group is still valid (on canvas)
              if (group && !canvas.getObjects().includes(group)) {
                  group = null;
              }

            if (!group) {
                // Create new Group
                group = new fabric.Group([], { 
                    selectable: true,
                    evented: true,
                    // Use a custom property to identify it as a "Layer Folder"
                    // In Fabric, Group is just a Group. 
                });
                const paintFolderName = getNextIndexedName('Paint Folder', getGroupNames());
                group.set('name', paintFolderName);
                
                // Ensure ID
                const extGroup = group as ExtendedFabricObject;
                if (!extGroup.id) extGroup.id = `group-${Date.now()}`;

                // Add group to canvas
                canvas.add(group);
                currentPaintGroupRef.current = group;
                
                // Auto Expand
                setExpandedFolders(prev => {
                    const next = new Set(prev);
                    if (extGroup.id) next.add(extGroup.id);
                    return next;
                });
            }
            
            // Move path from canvas to group with preserved coordinates
            moveObjectToGroup(path, group, canvas);
            
            canvas.requestRenderAll();
            // Update Objects List UI
            setObjects([...canvas.getObjects().reverse()]);
        };
        canvas.on('path:created', handlePathCreated);
        return () => { canvas.off('path:created', handlePathCreated); };
    }, [canvas, activeTool, paintBlendMode, getGroupNames, getNextIndexedName, moveObjectToGroup]);

    useEffect(() => {
        if (!canvas) return;
        const drawingCanvas = canvas as fabric.Canvas & {
            isDrawingMode: boolean;
            freeDrawingBrush?: fabric.BaseBrush;
            set: (key: string, value: unknown) => void;
        };

        if (activeTool === 'paint') {
            drawingCanvas.set('isDrawingMode', true);
            let brush: fabric.BaseBrush;

            if (brushType === 'Spray') {
                const sprayBrush = new fabric.SprayBrush(canvas);
                sprayBrush.density = sprayDensity;
                brush = sprayBrush;
            } else if (brushType === 'Oil') {
                // Simulate Oil: Dense SprayBrush to create random "bristle" texture without repeating pattern
                // Use SprayBrush logic but tuned for high density/coverage
                const oilBrush = new fabric.SprayBrush(canvas);
                
                // Allow user dominance of density via sprayDensity, but boost it for Oil effect
                // Oil needs to be dense. Range of slider is 5-100.
                const oilDensity = Math.max(20, sprayDensity); 
                
                oilBrush.density = oilDensity;
                oilBrush.width = brushSize;
                
                // Bristle size (dot width)
                // Small Variance to keep consistent stroke width but rough edges
                oilBrush.dotWidth = Math.max(1, brushSize / 8); 
                oilBrush.dotWidthVariance = Math.max(1, brushSize / 10);
                
                // Oil is opaque and thick
                oilBrush.randomOpacity = false; 
                oilBrush.optimizeOverlapping = false;
                
                brush = oilBrush;
            } else if (brushType === 'Watercolor') {
                // Simulate Watercolor: Pencil Brush (Smoother path) + Soft Shadow handled below
                // Opacity and Blend Mode are key here
                brush = new fabric.PencilBrush(canvas);
            } else {
                brush = new fabric.PencilBrush(canvas);
            }

            brush.color = applyAlphaToColor(paintColor, paintOpacity);
            brush.width = brushSize;
            
            if (brushType !== 'Spray' && brushType !== 'Oil') {
                // Softness logic
                if (brushBlur > 0) {
                     brush.shadow = new fabric.Shadow({
                        blur: brushBlur,
                        offsetX: 0,
                        offsetY: 0,
                        color: paintColor
                    });
                } else {
                    brush.shadow = null;
                }
            }
            
            // Apply blend mode to context if supported by brush type (Usually PencilBrush supports via manual render, but we used path:created)

            drawingCanvas.set('freeDrawingBrush', brush);
        } else {
            drawingCanvas.set('isDrawingMode', false);
        }
    }, [activeTool, paintColor, brushSize, brushType, paintOpacity, canvas, brushBlur, sprayDensity]);

    // Advanced Effects State
    const [curveStrength, setCurveStrength] = useState(0);
    const [curveCenter, setCurveCenter] = useState(0);
    const [skewX, setSkewX] = useState(0);
    const [skewY, setSkewY] = useState(0);
    const [skewZ, setSkewZ] = useState(0);
    const [taperDirection, setTaperDirection] = useState(0);
    const [isTaperDirectionDragging, setIsTaperDirectionDragging] = useState(false);
    const taperGuideRef = useRef<fabric.Circle | null>(null);
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [strokeWidth, setStrokeWidth] = useState(0);
    const [strokeOpacity, setStrokeOpacity] = useState(1);
    const [strokeInside, setStrokeInside] = useState(true);
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowColor, setShadowColor] = useState('#000000');
    const [shadowBlur, setShadowBlur] = useState(10);
    const [shadowOffsetX, setShadowOffsetX] = useState(5);
    const [shadowOffsetY, setShadowOffsetY] = useState(5);
    const [shadowOpacity, setShadowOpacity] = useState(1);

    // Blending & Filters State
    const [blendMode, setBlendMode] = useState<string>('source-over');
    const [blurValue, setBlurValue] = useState(0);
    const [brightnessValue, setBrightnessValue] = useState(0);
    const [contrastValue, setContrastValue] = useState(0);
    const [noiseValue, setNoiseValue] = useState(0);
    const [saturationValue, setSaturationValue] = useState(0);
    const [vibranceValue, setVibranceValue] = useState(0);
    const [pixelateValue, setPixelateValue] = useState(0);
    
    // Masking State
    const [maskInverted, setMaskInverted] = useState(false);
    
    // Mask Candidate (If 2 objects selected, this is the Top object)
    const [maskCandidate, setMaskCandidate] = useState<fabric.Object | null>(null);

    const syncCanvasMetrics = useCallback(() => {
        if (!canvas) return;
        const extendedCanvas = canvas as CanvasWithArtboard;

        const artboardInfo = extendedCanvas.artboard;
        if (artboardInfo) {
            setCanvasWidth(Math.round(artboardInfo.width));
            setCanvasHeight(Math.round(artboardInfo.height));
        } else {
            const zoom = canvas.getZoom() || 1;
            setCanvasWidth(Math.round((canvas.width || 1080) / zoom));
            setCanvasHeight(Math.round((canvas.height || 1080) / zoom));
        }

        const artboardRect = extendedCanvas.artboardRect;
        if (artboardRect && typeof artboardRect.fill === 'string') {
            const normalizedFill = normalizeColorValue(artboardRect.fill) || '#ffffff';
            setCanvasColor(normalizedFill);
        } else if (typeof canvas.backgroundColor === 'string') {
            const normalizedFill = normalizeColorValue(canvas.backgroundColor) || '#ffffff';
            setCanvasColor(normalizedFill);
        } else {
            setCanvasColor('#ffffff');
        }

        const presetMatch = PRESET_SIZES.find((preset) => preset.w === Math.round(extendedCanvas.artboard?.width || 0) && preset.h === Math.round(extendedCanvas.artboard?.height || 0));
        setSelectedPreset(presetMatch?.name ?? 'Custom');

        const workspaceColor = normalizeColorValue(extendedCanvas.getWorkspaceBackground?.() || extendedCanvas.workspaceBackground);
        if (workspaceColor) {
            setWorkspaceBgColor(workspaceColor);
        } else if (extendedCanvas.hostContainer) {
            const computed = normalizeColorValue(getComputedStyle(extendedCanvas.hostContainer).backgroundColor);
            if (computed) setWorkspaceBgColor(computed);
        }
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
        let animationFrame: number | null = null;

        const queueSync = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = requestAnimationFrame(() => {
                animationFrame = null;
                syncCanvasMetrics();
            });
        };

        queueSync();
        ((canvas.on as unknown) as (eventName: string, handler: (...args: unknown[]) => void) => void)('artboard:resize', queueSync);
        ((canvas.on as unknown) as (eventName: string, handler: (...args: unknown[]) => void) => void)('workspace:color', queueSync);

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            ((canvas.off as unknown) as (eventName: string, handler: (...args: unknown[]) => void) => void)('artboard:resize', queueSync);
            ((canvas.off as unknown) as (eventName: string, handler: (...args: unknown[]) => void) => void)('workspace:color', queueSync);
        };
    }, [canvas, syncCanvasMetrics]);

    useEffect(() => {
        if (!canvas) return;

        const removeGuide = () => {
            if (taperGuideRef.current) {
                canvas.remove(taperGuideRef.current);
                taperGuideRef.current = null;
                canvas.requestRenderAll();
            }
        };

        if (!selectedObject || !isTaperDirectionDragging) {
            removeGuide();
            return;
        }

        const rect = selectedObject.getBoundingRect();
        const dir = Math.max(-100, Math.min(100, taperDirection)) / 100;
        const x = rect.left + rect.width / 2 + (rect.width / 2) * dir;
        const y = rect.top;

        let guide = taperGuideRef.current;
        if (!guide) {
            guide = new fabric.Circle({
                radius: 4,
                fill: '#7c3aed',
                stroke: '#ffffff',
                strokeWidth: 1,
                left: x,
                top: y,
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false,
                excludeFromExport: true,
                hasControls: false,
                hasBorders: false
            });
            taperGuideRef.current = guide;
            canvas.add(guide);
        } else {
            guide.set({ left: x, top: y });
        }

        guide.setCoords();
        canvas.requestRenderAll();

        return () => removeGuide();
    }, [canvas, selectedObject, isTaperDirectionDragging, taperDirection]);

    useEffect(() => {
        if (!canvas) return;

        const updateObjects = () => {
            const objs = canvas.getObjects();
            const assignIds = (obj: fabric.Object) => {
                ensureObjectId(obj);
                if (obj.type === 'group') {
                    (obj as fabric.Group).getObjects().forEach(assignIds);
                }
            };
            objs.forEach(assignIds);
            setObjects([...objs.reverse()]); // Reverse to show top layer first
        };
        
        // Initial load
        updateObjects();

        const handleSelection = (e: { selected?: fabric.Object[] } = {}) => {
            const selection = canvas.getActiveObject();
            const activeObjects = (e && e.selected) ? e.selected : (canvas.getActiveObjects() || []);

            let targetForProps: fabric.Object | null | undefined = selection;

            // Check for potential Mask pair (Exactly 2 objects)
            // we trust the activeObjects count. If 2 items are selected, we treat as mask candidate.
            if (activeObjects.length === 2) {
                const allObjects = canvas.getObjects();
                
                // Sort by Z-Index (ascending: 0=Bottom, N=Top)
                const sorted = [...activeObjects].sort((a, b) => {
                    const idxA = allObjects.indexOf(a);
                    const idxB = allObjects.indexOf(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });

                const bottom = sorted[0]; 
                const top = sorted[1];
                
                // Select Bottom (Content) for properties
                setSelectedObject(bottom);
                // Mark Top as Mask Candidate
                setMaskCandidate(top);
                
                targetForProps = bottom;
            } else {
                setSelectedObject(selection || null);
                setMaskCandidate(null);
                targetForProps = selection;
            }
            
            // Refetch target
            const availableTarget = targetForProps;

            const activeIds = new Set(activeObjects.map((obj) => ensureObjectId(obj)));
            setSelectedIds(activeIds);

            if (activeObjects.length === 1) {
                lastSelectedIdRef.current = ensureObjectId(activeObjects[0]);
            }

            if (availableTarget && availableTarget.type !== 'activeSelection' && availableTarget.type !== 'group') {
                const fill = availableTarget.get('fill');
                
                if (typeof fill === 'string') {
                    setIsGradient(false);
                    setColor(fill);
                } else if (fill && typeof fill === 'object' && (fill as fabric.Gradient<'linear'>).type === 'linear') {
                    setIsGradient(true);
                    // Extract colors (approximate for UI)
                    const gradient = fill as fabric.Gradient<'linear'>;
                    const stops = gradient.colorStops || [];
                    if (stops.length >= 2) {
                        setGradientStart(stops[0].color);
                        setGradientEnd(stops[stops.length - 1].color);
                    }
                    
                    // Estimate Angle from coords
                    const c = gradient.coords || { x1: 0, y1: 0, x2: 1, y2: 0 };
                    const dx = c.x2 - c.x1;
                    const dy = c.y2 - c.y1;
                    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    if (angle < 0) angle += 360;
                    setGradientAngle(Math.round(angle));

                    setColor('#000000'); // Dummy for picker
                } else {
                     setIsGradient(false);
                     setColor('#000000');
                }

                setOpacity(availableTarget.get('opacity') || 1);
                
                // Read Masking State
                if (availableTarget.clipPath) {
                    // fabric.Object does not technically expose 'inverted' in typings sometimes, check casting
                    const clip = availableTarget.clipPath as fabric.Object & { inverted?: boolean };
                    setMaskInverted(clip.inverted || false);
                } else {
                    setMaskInverted(false);
                }
                
                // Read Effects
                // Check if path exists (Curved Text)
                // Fabric stores 'path' object on text
                const path = availableTarget.get('path') as fabric.Path;
                if (path && (availableTarget as ExtendedFabricObject).curveStrength !== undefined) {
                     setCurveStrength((availableTarget as ExtendedFabricObject).curveStrength || 0);
                     setCurveCenter((availableTarget as ExtendedFabricObject).curveCenter || 0);
                } else {
                     setCurveStrength(0);
                     setCurveCenter(0);
                }

                setSkewX(availableTarget.get('skewX') || 0);
                setSkewY(availableTarget.get('skewY') || 0);
                setSkewZ((availableTarget as ExtendedFabricObject).skewZ ?? 0);
                setTaperDirection((availableTarget as ExtendedFabricObject).taperDirection ?? 0);

                const strokeInfo = parseColorWithAlpha(availableTarget.get('stroke'));
                setStrokeColor(strokeInfo.color || '#000000');
                setStrokeOpacity(strokeInfo.alpha ?? 1);
                setStrokeWidth(availableTarget.get('strokeWidth') || 0);
                const paintFirst = availableTarget.get('paintFirst');
                setStrokeInside(paintFirst !== 'stroke');
                
                const shadow = availableTarget.get('shadow') as fabric.Shadow;
                if (shadow) {
                    setShadowEnabled(true);
                    const shadowInfo = parseColorWithAlpha(shadow.color || '#000000');
                    setShadowColor(shadowInfo.color || '#000000');
                    setShadowOpacity(shadowInfo.alpha ?? 1);
                    setShadowBlur(shadow.blur || 10);
                    setShadowOffsetX(shadow.offsetX || 5);
                    setShadowOffsetY(shadow.offsetY || 5);
                } else {
                    setShadowEnabled(false);
                    // Reset defaults for clean UI if re-enabled
                    setShadowBlur(10);
                    setShadowOffsetX(5);
                    setShadowOffsetY(5);
                    setShadowOpacity(1);
                }

                // Read Blending Mode
                setBlendMode(availableTarget.globalCompositeOperation || 'source-over');

                // Read Filters (Images Only)
                if (availableTarget.type === 'image') {
                    const img = availableTarget as fabric.Image;
                    // Reset all filters first
                    setBlurValue(0);
                    setBrightnessValue(0);
                    setContrastValue(0);
                    setNoiseValue(0);
                    setSaturationValue(0);
                    setPixelateValue(0);
                    setVibranceValue(0);

                    // Map filters from active array
                    // Note: In Fabric, filters is an array of instances. We need to check their type.
                    if (img.filters && img.filters.length > 0) {
                        img.filters.forEach(filter => {
                            if (!filter) return;
                            const type = filter.type;
                            
                            if (type === 'Blur') setBlurValue((filter as { blur?: number }).blur || 0);
                            if (type === 'Brightness') setBrightnessValue((filter as { brightness?: number }).brightness || 0);
                            if (type === 'Contrast') setContrastValue((filter as { contrast?: number }).contrast || 0);
                            if (type === 'Noise') setNoiseValue((filter as { noise?: number }).noise || 0);
                            if (type === 'Saturation') setSaturationValue((filter as { saturation?: number }).saturation || 0);
                            if (type === 'Vibrance') setVibranceValue((filter as { vibrance?: number }).vibrance || 0);
                            if (type === 'Pixelate') setPixelateValue((filter as { blocksize?: number }).blocksize || 0);
                        });
                    }
                }

                // Check if it is a text object
                if (availableTarget.type === 'text' || availableTarget.type === 'i-text') {
                    const textObject = availableTarget as fabric.IText;
                    setFontFamily(textObject.get('fontFamily') || 'Arial');
                    setFontWeight((textObject.get('fontWeight') as string) || 'normal');
                }

                // Check for Star properties
                if ('isStar' in availableTarget && (availableTarget as StarPolygon).isStar) {
                     const starSelection = availableTarget as StarPolygon;
                    setStarPoints(starSelection.starPoints || 5);
                    setStarInnerRadius(starSelection.starInnerRadius || 0.5);
                }
            }
        };

        const handleCleared = () => {
            setSelectedObject(null);
            setSelectedIds(new Set());
            lastSelectedIdRef.current = null;
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleCleared);
        
        canvas.on('object:added', updateObjects);
        canvas.on('object:removed', updateObjects);
        canvas.on('object:modified', updateObjects);
        
        // Initial load
        updateObjects();

        return () => {
            canvas.off('selection:created', handleSelection);
            canvas.off('selection:updated', handleSelection);
            canvas.off('selection:cleared', handleCleared);
            canvas.off('object:added', updateObjects);
            canvas.off('object:removed', updateObjects);
            canvas.off('object:modified', updateObjects);
        };
    }, [canvas, ensureObjectId]);

    const updateColor = (newColor: string) => {
        setColor(newColor);
        setIsGradient(false);
        if (selectedObject && canvas) {
            selectedObject.set('fill', newColor);
            canvas.requestRenderAll();
        }
    };

    const updateGradientStops = (start: string, end: string, angle: number = gradientAngle, type: 'linear' | 'radial' = gradientType, transition: number = gradientTransition) => {
         // Update state
         setGradientStart(start);
         setGradientEnd(end);
         setGradientAngle(angle);
         setGradientType(type);
         setGradientTransition(transition);

         if (selectedObject && canvas) {
             // Calculate Coords based on Angle
             let coords: Record<string, number> = { x1: 0, y1: 0, x2: 1, y2: 0 };
             
             if (type === 'linear') {
                const rad = angle * (Math.PI / 180);
                const len = 1; 
                coords = {
                    x1: 0.5 - (Math.cos(rad) * len)/2,
                    y1: 0.5 - (Math.sin(rad) * len)/2,
                    x2: 0.5 + (Math.cos(rad) * len)/2,
                    y2: 0.5 + (Math.sin(rad) * len)/2
                };
             } else {
                 // Radial
                 coords = {
                     x1: 0.5, y1: 0.5,
                     x2: 0.5, y2: 0.5,
                     r1: 0,
                     r2: 0.5 // Fit to box half-width (radius)
                 };
             }

             // Calculate Transition offsets
             // Transition = 1 (Smooth, offsets 0 and 1)
             // Transition = 0 (Hard, offsets 0.5 and 0.5)
             const halfSpread = transition / 2;
             const offset1 = 0.5 - halfSpread;
             const offset2 = 0.5 + halfSpread;

             const gradient = new fabric.Gradient({
                type: type,
                gradientUnits: 'percentage',
                coords: coords,
                colorStops: [
                    { offset: offset1, color: start },
                    { offset: offset2, color: end }
                ]
             });
             
             setIsGradient(true);
             selectedObject.set('fill', gradient);
             canvas.requestRenderAll();
         }
    }

    const updateOpacity = (newOpacity: number) => {
        setOpacity(newOpacity);
        if (selectedObject && canvas) {
            selectedObject.set('opacity', newOpacity);
            canvas.requestRenderAll();
        }
    };

    const updateFontFamily = (newFont: string) => {
        setFontFamily(newFont);
        if (selectedObject && canvas && 'fontFamily' in selectedObject) {
             selectedObject.set('fontFamily', newFont);
             canvas.requestRenderAll();
        }
    };

    const updateFontWeight = (newWeight: string) => {
        setFontWeight(newWeight);
         if (selectedObject && canvas && 'fontWeight' in selectedObject) {
             selectedObject.set('fontWeight', newWeight);
             canvas.requestRenderAll();
        }
    };

    // Helper to generate star points (Duplicate from Toolbar, ideally moved to utils)
    const getStarPoints = (numPoints: number, innerRadius: number, outerRadius: number) => {
        const points = [];
        const angleStep = Math.PI / numPoints;
        for (let i = 0; i < 2 * numPoints; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const a = i * angleStep - Math.PI / 2;
            points.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
        }
        return points;
    };

    const updateStarPoints = (newPoints: number) => {
        setStarPoints(newPoints);
        if (selectedObject && 'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && canvas) {
            const starObject = selectedObject as StarPolygon;
            starObject.set({ starPoints: newPoints } as Partial<StarPolygon>);
            const points = getStarPoints(
                newPoints, 
                (starObject.width! / 2) * starInnerRadius, 
                starObject.width! / 2 
            );
            // Fabric polygon points update is tricky, simpler to replace or force update
            // Updating 'points' property directly doesn't usually trigger recalc of dimensions perfectly in v5/6
            // But let's try setting it.
            starObject.set({ points: points });
            canvas.requestRenderAll();
        }
    }

    const updateStarInnerRadius = (newRadiusRatio: number) => {
        setStarInnerRadius(newRadiusRatio);
        if (selectedObject && 'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && canvas) {
            const starObject = selectedObject as StarPolygon;
            starObject.set({ starInnerRadius: newRadiusRatio } as Partial<StarPolygon>);
            const points = getStarPoints(
                starPoints, 
                (starObject.width! / 2) * newRadiusRatio, 
                starObject.width! / 2 
            );
             starObject.set({ points: points });
             canvas.requestRenderAll();
        }
    }

    // --- EFFECTS HANDLERS ---
    
    // Create or update text path for curvature
        const updateTextCurve = (strength: number, centerOverride?: number) => {
         // Strength: -100 to 100
         if (!selectedObject || (selectedObject.type !== 'text' && selectedObject.type !== 'i-text')) return;
         
         const textObj = selectedObject as fabric.IText;
            const center = centerOverride ?? curveCenter;
         setCurveStrength(strength);
         // Store strength for UI consistency
            (textObj as ExtendedFabricObject).set({ curveStrength: strength, curveCenter: center });

         if (strength === 0) {
             textObj.set('path', null);
         } else {
             // Calculate Path
             // A simple Quadratic curve
             const len = textObj.width || 200;
             const height = (strength / 100) * len * 0.5; // Height of arch
             const offset = (center / 100) * len * 0.5;
             
             // In SVG path format: M startX startY Q controlX controlY endX endY
             // Start at 0,0 relative to path
             // End at len, 0
             // Control at len/2, height*2 (approx)
             const pathData = `M 0 0 Q ${len/2 + offset} ${height * -1.5} ${len} 0`;
             
             const path = new fabric.Path(pathData);
             path.set({ 
                 visible: false,
                 // Align text to path center usually looks best for arches
                 left: -len/2,
                 top: 0
             });
             
             textObj.set('path', path);
             // Center align often needed for symmetry
             // textObj.set('textAlign', 'center'); 
         }
         
         textObj.canvas?.requestRenderAll();
    };

    const updateSkew = (axis: 'x'|'y', val: number) => {
         if (!selectedObject) return;
         if (axis === 'x') {
             setSkewX(val);
             selectedObject.set('skewX', val);
             const extended = selectedObject as ExtendedFabricObject;
             if (extended.skewZ !== undefined) {
                 extended.set({ skewZBaseSkewX: val });
             }
         } else {
             setSkewY(val);
             selectedObject.set('skewY', val);
             const extended = selectedObject as ExtendedFabricObject;
             if (extended.skewZ !== undefined) {
                 extended.set({ skewZBaseSkewY: val });
             }
         }
         selectedObject.canvas?.requestRenderAll();
    };

            const applyTaper = (zVal: number, dirVal: number) => {
                if (!selectedObject) return;
                const extended = selectedObject as ExtendedFabricObject;
                const baseScaleX = extended.skewZBaseScaleX ?? selectedObject.scaleX ?? 1;
                const baseScaleY = extended.skewZBaseScaleY ?? selectedObject.scaleY ?? 1;
                const baseSkewX = extended.skewZBaseSkewX ?? selectedObject.skewX ?? 0;
                const baseSkewY = extended.skewZBaseSkewY ?? selectedObject.skewY ?? 0;
                const baseLeft = extended.taperBaseLeft ?? selectedObject.left ?? 0;
                const baseTop = extended.taperBaseTop ?? selectedObject.top ?? 0;

                if (
                    extended.skewZBaseScaleX === undefined ||
                    extended.skewZBaseScaleY === undefined ||
                    extended.skewZBaseSkewX === undefined ||
                    extended.skewZBaseSkewY === undefined
                ) {
                    extended.set({
                        skewZBaseScaleX: baseScaleX,
                        skewZBaseScaleY: baseScaleY,
                        skewZBaseSkewX: baseSkewX,
                        skewZBaseSkewY: baseSkewY
                    });
                }

                if (extended.taperBaseLeft === undefined || extended.taperBaseTop === undefined) {
                    extended.set({ taperBaseLeft: baseLeft, taperBaseTop: baseTop });
                }

                const clamped = Math.max(-100, Math.min(100, zVal));
                const direction = clamped >= 0 ? 1 : -1;
                const magnitude = Math.min(Math.abs(clamped), 100) / 100; // 0..1
                const dir = Math.max(-100, Math.min(100, dirVal)) / 100; // -1..1

                if (magnitude === 0) {
                    selectedObject.set({
                        originX: 'center',
                        originY: 'center',
                        scaleX: baseScaleX,
                        scaleY: baseScaleY,
                        skewX: baseSkewX,
                        skewY: baseSkewY,
                        left: baseLeft,
                        top: baseTop
                    });
                    extended.set({ skewZ: 0, taperDirection: dirVal });
                    selectedObject.canvas?.requestRenderAll();
                    return;
                }

                // Symmetric taper from both sides, centered
                const taper = 0.6 * magnitude;
                const zoom = 0.25 * magnitude;

                const scaleXRaw = baseScaleX * (1 + direction * taper);
                const scaleYRaw = baseScaleY * (1 + direction * zoom);
                const scaleX = Math.max(0.2, Math.min(3, scaleXRaw));
                const scaleY = Math.max(0.2, Math.min(3, scaleYRaw));

                // Aim the taper toward the direction point
                const skewAim = dir * 18 * magnitude; // degrees
                const skewX = baseSkewX + clamped * 0.22 + skewAim;
                const skewY = baseSkewY + clamped * 0.06 + dir * 6 * magnitude;
                const originY = clamped >= 0 ? 'top' : 'bottom';

                const baseWidth = (selectedObject.width ?? 0) * baseScaleX;
                const shiftX = dir * magnitude * baseWidth * 0.18;

                selectedObject.set({
                    originX: 'center',
                    originY,
                    scaleX,
                    scaleY,
                    skewX,
                    skewY,
                    left: baseLeft + shiftX,
                    top: baseTop
                });
                extended.set({ skewZ: clamped, taperDirection: dirVal });
                selectedObject.canvas?.requestRenderAll();
            };

            const updateSkewZ = (val: number) => {
                if (!selectedObject) return;
                setSkewZ(val);
                applyTaper(val, taperDirection);
            };

            const updateTaperDirection = (val: number) => {
                if (!selectedObject) return;
                setTaperDirection(val);
                applyTaper(skewZ, val);
            };

    const updateStroke = (newWidth: number) => {
         if (!selectedObject) return;
         setStrokeWidth(newWidth);
         selectedObject.set({
             stroke: applyAlphaToColor(strokeColor, strokeOpacity),
             strokeWidth: newWidth,
             paintFirst: strokeInside ? 'fill' : 'stroke'
         });
         selectedObject.canvas?.requestRenderAll();
    };

    const updateStrokeColor = (newColor: string) => {
         if (!selectedObject) return;
         setStrokeColor(newColor);
         const colorWithAlpha = applyAlphaToColor(newColor, strokeOpacity);
         if (strokeWidth > 0) {
            selectedObject.set({ stroke: colorWithAlpha, paintFirst: strokeInside ? 'fill' : 'stroke' });
            selectedObject.canvas?.requestRenderAll();
         } else {
             // If width is 0, user probably wants to see it, so set width to 1
             setStrokeWidth(1);
             selectedObject.set({ stroke: colorWithAlpha, strokeWidth: 1, paintFirst: strokeInside ? 'fill' : 'stroke' });
             selectedObject.canvas?.requestRenderAll();
         }
    };

    const updateStrokeOpacity = (val: number) => {
        if (!selectedObject) return;
        setStrokeOpacity(val);
        const colorWithAlpha = applyAlphaToColor(strokeColor, val);
        if (strokeWidth > 0) {
            selectedObject.set({ stroke: colorWithAlpha, paintFirst: strokeInside ? 'fill' : 'stroke' });
        } else {
            setStrokeWidth(1);
            selectedObject.set({ stroke: colorWithAlpha, strokeWidth: 1, paintFirst: strokeInside ? 'fill' : 'stroke' });
        }
        selectedObject.canvas?.requestRenderAll();
    };

    const updateStrokeInside = (inside: boolean) => {
        if (!selectedObject) return;
        setStrokeInside(inside);
        selectedObject.set({ paintFirst: inside ? 'fill' : 'stroke' });
        selectedObject.canvas?.requestRenderAll();
    };

    const toggleShadow = (enable: boolean) => {
        if (!selectedObject) return;
        setShadowEnabled(enable);
        
        if (enable) {
             const shadow = new fabric.Shadow({
                color: applyAlphaToColor(shadowColor, shadowOpacity),
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY
            });
            selectedObject.set('shadow', shadow);
        } else {
            selectedObject.set('shadow', null);
        }
        selectedObject.canvas?.requestRenderAll();
    };

    const updateShadowProp = (prop: string, value: string | number) => {
        // Retrieve fresh reference from canvas to avoid linting "state mutation" errors
        const activeObject = canvas?.getActiveObject();
        if (!activeObject) return;
        
        let shadow = activeObject.shadow as fabric.Shadow;
        
        if (!shadow) {
            // Create if missing (e.g. user drags slider before checking box)
             setShadowEnabled(true);
             shadow = new fabric.Shadow({
                color: shadowColor,
                blur: shadowBlur,
                offsetX: shadowOffsetX,
                offsetY: shadowOffsetY
            });
            activeObject.set('shadow', shadow);
        }

        if (prop === 'color' && typeof value === 'string') { 
            setShadowColor(value);
            shadow.color = applyAlphaToColor(value, shadowOpacity);
        }
        if (prop === 'blur') {
            const val = typeof value === 'number' ? value : Number(value);
            setShadowBlur(val);
            shadow.blur = val;
        }
        if (prop === 'offsetX') {
            const val = typeof value === 'number' ? value : Number(value);
            setShadowOffsetX(val);
            shadow.offsetX = val;
        }
        if (prop === 'offsetY') {
            const val = typeof value === 'number' ? value : Number(value);
             setShadowOffsetY(val);
             shadow.offsetY = val;
        }
        if (prop === 'opacity') {
            const val = typeof value === 'number' ? value : Number(value);
            setShadowOpacity(val);
            shadow.color = applyAlphaToColor(shadowColor, val);
        }
        
        // Fabric doesn't always auto-detect deep property change on shadow
        // So we reset it or mark dirty
        activeObject.set('dirty', true);
        canvas?.requestRenderAll();
    };

    const updateBlendMode = (mode: string) => {
        setBlendMode(mode);
        if (selectedObject && canvas) {
            selectedObject.set('globalCompositeOperation', mode);
            // Force re-render of key things
            selectedObject.set('dirty', true);
            canvas.requestRenderAll();
        }
    };

    const updateImageFilter = (type: string, value: number) => {
        // Retrieve fresh reference from canvas to avoid linting "state mutation" errors
        const activeObject = canvas?.getActiveObject();
        if (!activeObject || activeObject.type !== 'image') return;
        
        const img = activeObject as fabric.Image;

        // Fabric filters array
        if (!img.filters) img.filters = [];
        
        // Find existing
        const idx = img.filters.findIndex(f => f.type === type);
        
        let shouldRemove = false;
        if (type !== 'Pixelate' && value === 0) shouldRemove = true;
        if (type === 'Pixelate' && value < 2) shouldRemove = true;
        
        if (shouldRemove) {
            if (idx > -1) {
                img.filters.splice(idx, 1);
            }
        } else {
            if (idx > -1) {
                // Update
                const filter = img.filters[idx];
                if (type === 'Blur') (filter as unknown as { blur: number }).blur = value;
                else if (type === 'Brightness') (filter as unknown as { brightness: number }).brightness = value;
                else if (type === 'Contrast') (filter as unknown as { contrast: number }).contrast = value;
                else if (type === 'Noise') (filter as unknown as { noise: number }).noise = value;
                else if (type === 'Saturation') (filter as unknown as { saturation: number }).saturation = value;
                else if (type === 'Vibrance') (filter as unknown as { vibrance: number }).vibrance = value;
                else if (type === 'Pixelate') (filter as unknown as { blocksize: number }).blocksize = value;
            } else {
                // Add new
                let newFilter = null;
                // Use imported fabric namespace
                if (type === 'Blur') newFilter = new fabric.filters.Blur({ blur: value });
                else if (type === 'Brightness') newFilter = new fabric.filters.Brightness({ brightness: value });
                else if (type === 'Contrast') newFilter = new fabric.filters.Contrast({ contrast: value });
                else if (type === 'Noise') newFilter = new fabric.filters.Noise({ noise: value });
                else if (type === 'Saturation') newFilter = new fabric.filters.Saturation({ saturation: value });
                else if (type === 'Vibrance') newFilter = new fabric.filters.Vibrance({ vibrance: value });
                else if (type === 'Pixelate') newFilter = new fabric.filters.Pixelate({ blocksize: value });
                
                if (newFilter) img.filters.push(newFilter);
            }
        }

        // Update UI State
        if (type === 'Blur') setBlurValue(value);
        else if (type === 'Brightness') setBrightnessValue(value);
        else if (type === 'Contrast') setContrastValue(value);
        else if (type === 'Noise') setNoiseValue(value);
        else if (type === 'Saturation') setSaturationValue(value);
        else if (type === 'Vibrance') setVibranceValue(value);
        else if (type === 'Pixelate') setPixelateValue(value);

        img.applyFilters();
        canvas?.requestRenderAll();
    };

    const toggleMaskInvert = () => {
        const activeObject = canvas?.getActiveObject();
        if (!activeObject || !activeObject.clipPath || !canvas) return;
        
        const mask = activeObject.clipPath as fabric.Object & { inverted?: boolean };
        
        mask.inverted = !mask.inverted;
        
        setMaskInverted(mask.inverted || false);
        mask.dirty = true;
        activeObject.set('dirty', true);
        canvas.requestRenderAll();
    };

    // --- MASKING ---
    const createMask = () => {
        if (!canvas) return;

        // Check if we are in 'pending mask' mode (2 items selected)
        if (maskCandidate && selectedObject) {
             const bottom = selectedObject;
             const top = maskCandidate;
             
             // Ungroup if needed
             canvas.discardActiveObject();
             
             // Apply Mask
             bottom.set('clipPath', top);
             canvas.remove(top);
             
             // absolutePositioned is in standard types
             top.set('absolutePositioned', true);
             
             bottom.set('dirty', true);
             canvas.requestRenderAll();
             
             // Reset candidates/selection
             canvas.setActiveObject(bottom);
             setSelectedObject(bottom);
             setMaskCandidate(null);
             return;
        }
        
        const activeObjects = canvas.getActiveObjects();

        if (activeObjects.length !== 2) {
            toast({
                title: 'Create mask failed',
                description: `Select exactly 2 objects. Currently selected: ${activeObjects.length}.`,
                variant: 'warning'
            });
            return;
        }

        const bottom = activeObjects[0];
        const top = activeObjects[1];

        // 1. Ungroup (Restore objects to canvas coordinates)
        canvas.discardActiveObject();
        
        // 2. Set the top object as the clipPath of the bottom object
        // 'top' now has canvas-relative coordinates because we ungrouped
        bottom.set('clipPath', top);
        
        // 3. Remove the mask object from the canvas (it's now part of the bottom object)
        canvas.remove(top);
        
        // 4. Ensure the mask tends to use absolute coordinates (canvas coordinates) 
        // instead of being relative to the object center
        top.set('absolutePositioned', true);
        
        bottom.set('dirty', true);
        canvas.requestRenderAll();
        
        // 5. Select the masked object to show updated state
        canvas.setActiveObject(bottom);
        setSelectedObject(bottom);
    };

    const releaseMask = () => {
        if (!selectedObject || !selectedObject.clipPath || !canvas) return;
        
        const mask = selectedObject.clipPath;
        
        // We move the mask back to the canvas as a regular object
        // We need to clone it because clipPath object instance handling can be tricky if reused
        
        mask.clone().then((cloned) => {
             // Restore properties if needed
             // If absolutePositioned was true, coords are global.
             // If false, they were relative.
             
             // If it was absolute, we just add it.
             canvas.add(cloned as ExtendedFabricObject);
             
             if (mask.absolutePositioned) {
                 cloned.set({
                     left: mask.left,
                     top: mask.top,
                     scaleX: mask.scaleX,
                     scaleY: mask.scaleY,
                     angle: mask.angle
                 });
             } else {
                 // Convert relative to absolute? Complex.
                 // For now assume we always used absolutePositioned = true
                 // But if we want to be safe, center it on object.
                 cloned.set({
                     left: selectedObject.left,
                     top: selectedObject.top
                 });
             }
             
             selectedObject.set('clipPath', undefined);
             selectedObject.set('dirty', true);
             canvas.requestRenderAll();
        });
    };

    const deleteLayer = (obj: fabric.Object) => {
        if (!canvas) return;
        const parentGroup = obj.group as fabric.Group | undefined;
        if (parentGroup) {
            parentGroup.remove(obj);
            parentGroup.setCoords();
        } else {
            canvas.remove(obj);
        }
        canvas.requestRenderAll();
        // updates handled by event listener
    };

    const toggleVisibility = (obj: fabric.Object) => {
        if (!canvas) return;
        // Toggle visible property, defaulting to true if undefined
        const nextVisible = !(obj.visible ?? true);
        obj.set('visible', nextVisible);
        if (obj.type === 'group') {
            (obj as fabric.Group).getObjects().forEach((child) => child.set('visible', nextVisible));
        }
        // Deselect if hiding current selection
        if (!obj.visible && canvas.getActiveObject() === obj) {
            canvas.discardActiveObject();
        }
        canvas.requestRenderAll();
        
        // Force update local state to reflect visibility change in UI
        setObjects([...canvas.getObjects().reverse()]); 
    };

    const toggleLock = (obj: fabric.Object) => {
        if (!canvas) return;
        const extendedObj = obj as ExtendedFabricObject;
        const wasLocked = extendedObj.locked ?? false;
        const isLocked = !wasLocked;
        
        extendedObj.set('locked', isLocked);
        
        obj.set({
            selectable: !isLocked, 
            evented: !isLocked,
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked,
            lockSkewingX: isLocked,
            lockSkewingY: isLocked
        });

        if (obj.type === 'group') {
            (obj as fabric.Group).getObjects().forEach((child) => {
                const childExtended = child as ExtendedFabricObject;
                childExtended.set('locked', isLocked);
                child.set({
                    selectable: !isLocked,
                    evented: !isLocked,
                    lockMovementX: isLocked,
                    lockMovementY: isLocked,
                    lockRotation: isLocked,
                    lockScalingX: isLocked,
                    lockScalingY: isLocked,
                    lockSkewingX: isLocked,
                    lockSkewingY: isLocked
                });
            });
        }

        if (isLocked && canvas.getActiveObject() === obj) {
            canvas.discardActiveObject();
        }

        canvas.requestRenderAll();
        setObjects([...canvas.getObjects().reverse()]);
    };

    const selectLayer = (obj: fabric.Object, event?: React.MouseEvent) => {
        if (!canvas) return;

        // If hidden, keep hidden unless explicitly toggled
        if (!obj.visible) {
            // Optional: Auto-unhide on select
        }

        const objectId = ensureObjectId(obj);
        const isShift = Boolean(event?.shiftKey);
        const isToggle = Boolean(event?.metaKey || event?.ctrlKey);

        const currentSelection = canvas.getActiveObjects() || [];

        if (isShift && lastSelectedIdRef.current) {
            const ids = layerOrderRef.current;
            const startIndex = ids.indexOf(lastSelectedIdRef.current);
            const endIndex = ids.indexOf(objectId);

            if (startIndex !== -1 && endIndex !== -1) {
                const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
                const rangeIds = ids.slice(from, to + 1);
                const rangeObjects = rangeIds
                    .map((id) => layerMap.get(id)?.obj)
                    .filter((item): item is fabric.Object => Boolean(item));

                canvas.discardActiveObject();

                if (rangeObjects.length > 1) {
                    const selection = new fabric.ActiveSelection(rangeObjects, { canvas });
                    canvas.setActiveObject(selection);
                    canvas.fire('selection:created', { selected: rangeObjects });
                } else if (rangeObjects[0]) {
                    canvas.setActiveObject(rangeObjects[0]);
                    canvas.fire('selection:created', { selected: [rangeObjects[0]] });
                }

                canvas.requestRenderAll();
                setSelectedIds(new Set(rangeObjects.map((item) => ensureObjectId(item))));
                lastSelectedIdRef.current = objectId;
                return;
            }
        }

        if (isToggle) {
            const selectionMap = new Map(currentSelection.map((item) => [ensureObjectId(item), item]));
            let nextSelection = currentSelection;

            if (selectionMap.has(objectId)) {
                nextSelection = currentSelection.filter((item) => ensureObjectId(item) !== objectId);
            } else {
                nextSelection = [...currentSelection, obj];
            }

            canvas.discardActiveObject();

            if (nextSelection.length === 0) {
                canvas.requestRenderAll();
                setSelectedIds(new Set());
                lastSelectedIdRef.current = null;
                return;
            }

            if (nextSelection.length === 1) {
                canvas.setActiveObject(nextSelection[0]);
                canvas.fire('selection:created', { selected: nextSelection });
            } else {
                const selection = new fabric.ActiveSelection(nextSelection, { canvas });
                canvas.setActiveObject(selection);
                canvas.fire('selection:created', { selected: nextSelection });
            }

            canvas.requestRenderAll();
            setSelectedIds(new Set(nextSelection.map((item) => ensureObjectId(item))));
            lastSelectedIdRef.current = objectId;
            return;
        }

        canvas.discardActiveObject();
        canvas.setActiveObject(obj);
        canvas.fire('selection:created', { selected: [obj] });
        canvas.requestRenderAll();
        setSelectedIds(new Set([objectId]));
        lastSelectedIdRef.current = objectId;
    };

    // Layer Management
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!canvas || !over || active.id === over.id) return;

        const activeId = String(active.id);
        const overId = String(over.id);
        const activeNode = layerMap.get(activeId);
        const overNode = layerMap.get(overId);

        if (!activeNode || !overNode) return;
        if (isDescendant(activeNode.id, overNode.id)) return;

        const activeObj = activeNode.obj;
        const overObj = overNode.obj;
        const targetParentId = overObj.type === 'group' ? overNode.id : overNode.parentId;

        const reorderInParent = (parentGroup: fabric.Group | null, targetId: string) => {
            const siblings = parentGroup ? [...parentGroup.getObjects()].reverse() : [...canvas.getObjects()].reverse();
            const fromIndex = siblings.findIndex((item) => ensureObjectId(item) === activeNode.id);
            const toIndex = siblings.findIndex((item) => ensureObjectId(item) === targetId);

            if (fromIndex === -1 || toIndex === -1) return;
            const targetFabricIndex = siblings.length - 1 - toIndex;

            if (parentGroup && 'moveObjectTo' in parentGroup) {
                (parentGroup as fabric.Group & { moveObjectTo?: (obj: fabric.Object, index: number) => void }).moveObjectTo?.(activeObj, targetFabricIndex);
                parentGroup.setCoords();
            } else {
                canvas.moveObjectTo(activeObj, targetFabricIndex);
            }
        };

        if (overObj.type === 'group') {
            if (activeNode.parentId !== overNode.id) {
                moveObjectToGroup(activeObj, overObj as fabric.Group, canvas);
                setExpandedFolders(prev => new Set(prev).add(overNode.id));
            }
        } else if (activeNode.parentId !== targetParentId) {
            if (targetParentId) {
                const targetGroupNode = layerMap.get(targetParentId);
                if (targetGroupNode?.obj.type === 'group') {
                    moveObjectToGroup(activeObj, targetGroupNode.obj as fabric.Group, canvas);
                    reorderInParent(targetGroupNode.obj as fabric.Group, overNode.id);
                }
            } else if (activeObj.group) {
                moveObjectToCanvas(activeObj, activeObj.group as fabric.Group, canvas);
                reorderInParent(null, overNode.id);
            }
        } else {
            const parentGroup = activeObj.group ? (activeObj.group as fabric.Group) : null;
            reorderInParent(parentGroup, overNode.id);
        }

        canvas.requestRenderAll();
        setObjects([...canvas.getObjects().reverse()]);
    };

    const handlePresetChange = (value: string) => {
        setSelectedPreset(value);

        if (value === 'Custom') {
            return;
        }

        const preset = PRESET_SIZES.find((item) => item.name === value);
        if (preset) {
            updateCanvasSize(preset.w, preset.h);
        } else {
            setSelectedPreset('Custom');
        }
    };

    const updateCanvasSize = (w: number, h: number) => {
        if (!canvas) return;

        const width = Math.max(Math.round(w || 0), 1);
        const height = Math.max(Math.round(h || 0), 1);

        setCanvasWidth(width);
        setCanvasHeight(height);

        const match = PRESET_SIZES.find((preset) => preset.w === width && preset.h === height);
        setSelectedPreset(match?.name ?? 'Custom');

        const extendedCanvas = canvas as CanvasWithArtboard;
        const artboardRect = extendedCanvas.artboardRect;
        if (artboardRect) {
            artboardRect.set({ width, height });
            artboardRect.setCoords();
        }

        const canvasWithSet = extendedCanvas as CanvasWithArtboard & { set: (key: string, value: unknown) => void };
        if (extendedCanvas.artboard) {
            canvasWithSet.set('artboard', {
                ...extendedCanvas.artboard,
                width,
                height
            });
        } else {
            canvasWithSet.set('artboard', { width, height, left: 0, top: 0 });
        }

        const hostContainer = extendedCanvas.hostContainer;
        if (hostContainer) {
            const rect = hostContainer.getBoundingClientRect();
            const containerWidth = Math.ceil(rect.width);
            const containerHeight = Math.ceil(rect.height);
            if (canvas.width !== containerWidth || canvas.height !== containerHeight) {
                canvas.setDimensions({ width: containerWidth, height: containerHeight });
                canvas.calcOffset();
            }
        }

        if (extendedCanvas.centerArtboard) {
            extendedCanvas.centerArtboard();
        } else {
            canvas.requestRenderAll();
        }

        (canvas.fire as (eventName: string, options?: Record<string, unknown>) => fabric.Canvas)('artboard:resize', { width, height });
        canvas.requestRenderAll();
    };

    const updateCanvasColor = (c: string) => {
        if (!canvas) return;

        const nextColor = normalizeColorValue(c) || '#ffffff';

        const extendedCanvas = canvas as CanvasWithArtboard;
        const artboardRect = extendedCanvas.artboardRect;

        if (artboardRect) {
            artboardRect.set({ fill: nextColor });
        } else {
            canvas.set('backgroundColor', nextColor);
        }

        setCanvasColor(nextColor);
        (canvas.fire as (eventName: string, options?: Record<string, unknown>) => fabric.Canvas)('artboard:color', { color: nextColor });
        canvas.requestRenderAll();
    };

    const updateWorkspaceColor = (value: string) => {
        if (!canvas) return;

        const nextColor = normalizeColorValue(value) || '#1e1e1e';
        const extendedCanvas = canvas as CanvasWithArtboard;

        if (extendedCanvas.setWorkspaceBackground) {
            extendedCanvas.setWorkspaceBackground(nextColor);
        } else if (extendedCanvas.hostContainer) {
            extendedCanvas.hostContainer.style.setProperty('background-color', nextColor);
            (canvas.fire as (eventName: string, options?: Record<string, unknown>) => fabric.Canvas)('workspace:color', { color: nextColor });
            canvas.requestRenderAll();
        }

        setWorkspaceBgColor(nextColor);
    };

    if (activeTool === 'paint') {
        return (
            <div className="w-80 border-l border-border bg-card overflow-y-auto h-full animate-in slide-in-from-right-5 duration-300 transform-gpu relative scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                <div className="p-5 border-b border-border/50 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Wand2 size={16} className="text-primary" />
                        Paint Properties
                    </h3>
                </div>

                <div className="p-5 space-y-6">
                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brush Type</label>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                             {['Pencil', 'Spray', 'Oil', 'Watercolor'].map(b => (
                                 <button
                                    key={b}
                                    onClick={() => {
                                        setBrushType(b);
                                        // Set Defaults
                                        if (b === 'Watercolor') {
                                           setPaintOpacity(0.5);
                                           setBrushBlur(10);
                                           setPaintBlendMode('multiply'); 
                                        } else if (b === 'Oil') {
                                           setPaintOpacity(1); 
                                           setBrushBlur(0);
                                           setPaintBlendMode('source-over');
                                        } else {
                                           setPaintBlendMode('source-over');
                                        }
                                    }}
                                    className={`px-3 py-2 text-xs rounded-md border transition-all ${brushType === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary hover:bg-secondary/80 border-transparent'}`}
                                 >
                                     {b}
                                 </button>
                             ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
                            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{paintColor.toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="relative w-10 h-10 rounded-full border border-border shadow-sm overflow-hidden shrink-0 group cursor-pointer transition-transform active:scale-95">
                                <div className="absolute inset-0 z-0 bg-image-checkered opacity-20" />
                                <div className="absolute inset-0 z-10" style={{ backgroundColor: paintColor }} />
                                <input 
                                    type="color" 
                                    value={paintColor}
                                    onChange={(e) => setPaintColor(e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                            </div>
                            <div className="flex-1 space-y-2">
                                 <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                                     {['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setPaintColor(c)}
                                            className="w-6 h-6 rounded-full border border-border/50 shrink-0 hover:scale-110 transition-transform"
                                            style={{ backgroundColor: c }}
                                            title={c}
                                        />
                                     ))}
                                 </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opacity</label>
                            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(paintOpacity * 100)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0.1" 
                            max="1" 
                            step="0.05" 
                            value={paintOpacity}
                            onChange={(e) => setPaintOpacity(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>

                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brush Size</label>
                            <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{brushSize}px</span>
                        </div>
                        <input 
                            type="range" 
                            min="1" 
                            max="100" 
                            step="1" 
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                    
                    {/* Extra Settings based on Type */}
                    {(brushType === 'Pencil' || brushType === 'Watercolor' || brushType === 'Oil') && (
                         <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Softness</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{brushBlur}</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="50" 
                                step="1" 
                                value={brushBlur}
                                onChange={(e) => setBrushBlur(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}

                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blending Mode</label>
                        </div>
                        <select 
                            value={paintBlendMode}
                            onChange={(e) => setPaintBlendMode(e.target.value)}
                            className="w-full bg-secondary btn-ghost text-xs p-2 rounded-md border border-border/50 outline-none"
                        >
                            <option className="bg-zinc-950 text-white" value="source-over">Normal</option>
                            <option className="bg-zinc-950 text-white" value="multiply">Multiply (Watercolor)</option>
                            <option className="bg-zinc-950 text-white" value="screen">Screen</option>
                            <option className="bg-zinc-950 text-white" value="overlay">Overlay</option>
                            <option className="bg-zinc-950 text-white" value="darken">Darken</option>
                            <option className="bg-zinc-950 text-white" value="lighten">Lighten</option>
                        </select>
                    </div>

                    {(brushType === 'Spray' || brushType === 'Oil') && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{brushType === 'Oil' ? 'Bristle Density' : 'Spray Density'}</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{sprayDensity}</span>
                            </div>
                            <input 
                                type="range" 
                                min="5" 
                                max="100" 
                                step="1" 
                                value={sprayDensity}
                                onChange={(e) => setSprayDensity(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    )}

                </div>
            </div>
        );
    }

    // If Layers tool is active
    if (activeTool === 'layers') {
        return (
            <div className="flex flex-col h-full bg-card">
                 <div className="px-4 py-3 border-b border-border/50 bg-secondary/10 flex justify-between items-center">
                    <h2 className="font-semibold text-xs tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        <Layers size={14} /> Layers
                    </h2>
                    <span className="text-[10px] text-muted-foreground">{objects.length} elements</span>
                </div>
                
                 {/* Layer Management Toolbar */}
                 <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30 bg-secondary/5">
                     <button
                        onClick={createEmptyFolder}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                        title="Create Empty Folder"
                     >
                         <FolderPlus size={14} />
                     </button>
                     <button
                        onClick={groupSelectedLayers}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                        title="Group Selected Layers"
                     >
                         <Folder size={14} />
                     </button>
                      <button
                        onClick={ungroupSelectedLayer}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                        title="Ungroup Selected Layer"
                     >
                         <Layers size={14} />
                     </button>
                 </div>

                <div className="px-3 py-2 border-b border-border/50">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Selection
                    </div>
                    {selectedObject ? (
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                    <span>Opacity</span>
                                    <span>{Math.round(opacity * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={opacity}
                                    onChange={(e) => updateOpacity(parseFloat(e.target.value))}
                                    data-default="1"
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground uppercase">Blend</label>
                                <select
                                    value={blendMode}
                                    onChange={(e) => updateBlendMode(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                                >
                                    <option className="bg-zinc-950 text-white" value="source-over">Normal</option>
                                    <option className="bg-zinc-950 text-white" value="multiply">Multiply</option>
                                    <option className="bg-zinc-950 text-white" value="screen">Screen</option>
                                    <option className="bg-zinc-950 text-white" value="overlay">Overlay</option>
                                    <option className="bg-zinc-950 text-white" value="darken">Darken</option>
                                    <option className="bg-zinc-950 text-white" value="lighten">Lighten</option>
                                    <option className="bg-zinc-950 text-white" value="color-dodge">Color Dodge</option>
                                    <option className="bg-zinc-950 text-white" value="color-burn">Color Burn</option>
                                    <option className="bg-zinc-950 text-white" value="hard-light">Hard Light</option>
                                    <option className="bg-zinc-950 text-white" value="soft-light">Soft Light</option>
                                    <option className="bg-zinc-950 text-white" value="difference">Difference</option>
                                    <option className="bg-zinc-950 text-white" value="exclusion">Exclusion</option>
                                    <option className="bg-zinc-950 text-white" value="hue">Hue</option>
                                    <option value="saturation">Saturation</option>
                                    <option value="color">Color</option>
                                    <option value="luminosity">Luminosity</option>
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground">Select a layer to edit opacity and blending.</div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                                 <SortableContext 
                                     items={flatLayers.map((node) => node.id)}
                                     strategy={verticalListSortingStrategy}
                                 >
                                     {layerTree.map((node, index) => (
                                            <SortableLayerItem 
                                                key={node.id}
                                                id={node.id}
                                                obj={node.obj}
                                                index={index}
                                                total={layerTree.length}
                                                selectedIds={selectedIds}
                                                selectLayer={selectLayer}
                                                deleteLayer={deleteLayer}                                    
                                                toggleVisibility={toggleVisibility}
                                                toggleLock={toggleLock}                                
                                                onDblClick={onLayerDblClick}
                                                expanded={expandedFolders.has(node.id)}
                                                expandedIds={expandedFolders}
                                                onToggleExpand={toggleFolder}
                                                childrenNodes={node.children}
                                            />
                                     ))}
                                 </SortableContext>
                    </DndContext>
                    
                    {objects.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Layers size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">No layers</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const isMultipleSelection = selectedObject?.type === 'activeSelection';
    const selectionCount = selectedObject?.type === 'activeSelection'
        ? (selectedObject as fabric.ActiveSelection).getObjects().length
        : 0;
    const canCreateMask = selectionCount === 2;
    const extendedSelection = selectedObject as ExtendedFabricObject | null;
    const selectedMediaType = extendedSelection?.mediaType;
    const selectedMediaSource = extendedSelection?.mediaSource;
    const isMediaPlaceholder = Boolean(selectedMediaType && selectedMediaSource);

    const handleMediaPreview = () => {
        if (!selectedMediaType || !selectedMediaSource) return;
        if (onPreviewMedia) {
            onPreviewMedia({ type: selectedMediaType, url: selectedMediaSource });
        } else {
            window.open(selectedMediaSource, '_blank', 'noopener');
        }
    };

    // Force single view if mask candidate is present
    if (isMultipleSelection && !maskCandidate) {
        return (
            <div className="flex flex-col h-full bg-card">
                 <div className="p-4 border-b border-border/50 bg-secondary/10">
                    <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        Multiple Selection
                    </h2>
                </div>
                <div className="p-4 space-y-6">
                     <div className="bg-secondary/20 p-4 rounded-lg border border-border/50 text-center">
                        <p className="text-xs text-muted-foreground mb-4">
                            {selectionCount} objects selected
                        </p>
                        
                         <button
                            onClick={createMask}
                            disabled={!canCreateMask}
                            className="w-full py-2 bg-primary text-primary-foreground rounded-md text-xs font-medium mb-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            Create Mask
                         </button>
                         <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Uses the top object as a mask for the bottom object. Select exactly two objects to enable masking.
                         </p>
                     </div>
                </div>
            </div>
        );
    }

    if (!selectedObject) {
        // Show Canvas Settings
        return (
             <div className="flex flex-col h-full bg-card">
                 <div className="p-4 border-b border-border/50 bg-secondary/10">
                    <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        <Settings size={14} /> Canvas Settings
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Size Presets */}
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preset</label>
                        <Select value={selectedPreset} onValueChange={handlePresetChange}>
                            <SelectTrigger className="relative h-auto flex flex-col items-start gap-1 py-2">
                                <div className="text-sm font-medium text-foreground">{selectedPreset}</div>
                                <div className="text-xs text-muted-foreground">{canvasWidth} x {canvasHeight}</div>
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">v</span>
                                <SelectValue className="sr-only" />
                            </SelectTrigger>
                            <SelectContent>
                                {PRESET_SIZES.map((preset) => (
                                    <SelectItem key={preset.name} value={preset.name}>
                                        {preset.name} - {preset.w} x {preset.h}
                                    </SelectItem>
                                ))}
                                <SelectItem value="Custom">Custom size</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Custom Size */}
                    <div className="space-y-3">
                         <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dimensions</label>
                         <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Width</label>
                                <input 
                                    type="number" 
                                    value={canvasWidth}
                                    onChange={(e) => updateCanvasSize(parseInt(e.target.value) || 0, canvasHeight)}
                                    className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm"
                                />
                             </div>
                             <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Height</label>
                                <input 
                                    type="number" 
                                    value={canvasHeight}
                                    onChange={(e) => updateCanvasSize(canvasWidth, parseInt(e.target.value) || 0)}
                                    className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-sm"
                                />
                             </div>
                         </div>
                    </div>

                          {/* Artboard Background */}
                          <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Artboard</label>
                                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{canvasColor}</span>
                                </div>
                                <div className="relative w-full flex items-center gap-3 bg-secondary/30 p-2 rounded-lg border border-border/50">
                                      <div 
                                          className="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20"
                                          style={{ backgroundColor: canvasColor }}
                                      ></div>
                                      <input 
                                          type="color" 
                                          value={canvasColor} 
                                          onChange={(e) => updateCanvasColor(e.target.value)}
                                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <span className="text-sm text-foreground font-medium flex-1">Artboard color</span>
                                </div>
                          </div>

                          {/* Workspace Background */}
                          <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workspace</label>
                                      <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{workspaceBgColor}</span>
                                </div>
                                <div className="relative w-full flex items-center gap-3 bg-secondary/30 p-2 rounded-lg border border-border/50">
                                      <div 
                                          className="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20"
                                          style={{ backgroundColor: workspaceBgColor }}
                                      ></div>
                                      <input 
                                          type="color" 
                                          value={workspaceBgColor} 
                                          onChange={(e) => updateWorkspaceColor(e.target.value)}
                                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <span className="text-sm text-foreground font-medium flex-1">Workspace color</span>
                                </div>
                          </div>

                </div>
             </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-card">
            {/* Header */}
            <div className="p-4 border-b border-border/50 bg-secondary/10">
                <h2 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase inline-flex items-center gap-2">
                    {selectedObject.type} Properties 
                    {maskCandidate && <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] rounded-full">Mask Mode</span>}
                </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-8">
                {/* Pending Mask Creation Action */}
                {maskCandidate && (
                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2">
                         <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                                <Blend size={12} /> Masking Available
                            </label>
                            <span className="text-[10px] text-muted-foreground">Top object will mask Bottom</span>
                         </div>
                         <button
                            onClick={createMask}
                            className="w-full py-2 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                         >
                            Apply Mask
                         </button>
                    </div>
                )}

                  {/* Media Placeholder Preview */}
                  {isMediaPlaceholder && selectedMediaType && selectedMediaSource && (
                      <div className="space-y-3 bg-secondary/20 border border-border/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Media Preview</label>
                              <span className="text-[10px] font-semibold uppercase text-primary">{selectedMediaType}</span>
                          </div>
                          <div className="rounded-md overflow-hidden border border-border/50 bg-background">
                              {selectedMediaType === 'video' ? (
                                  <video
                                      key={selectedMediaSource}
                                      src={selectedMediaSource}
                                      controls
                                      className="w-full aspect-video bg-black"
                                  />
                              ) : (
                                  <audio
                                      key={selectedMediaSource}
                                      src={selectedMediaSource}
                                      controls
                                      className="w-full"
                                  />
                              )}
                          </div>
                          <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
                              <span>Double-click the media placeholder on the canvas or use the button below to open a floating player.</span>
                              <button
                                  onClick={handleMediaPreview}
                                  className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors"
                              >
                                  <Play size={14} />
                                  Open Floating Player
                                  <ExternalLink size={12} className="opacity-80" />
                              </button>
                          </div>
                      </div>
                  )}

                {/* Fill / Gradient Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                         <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fill Style</label>
                         <div className="flex gap-1 text-[10px] bg-secondary/50 p-1 rounded">
                             <button 
                                onClick={() => updateColor(gradientStart)} 
                                className={`px-2 py-0.5 rounded transition-all ${!isGradient ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                            >
                                Solid
                             </button>
                             <button 
                                onClick={() => updateGradientStops(gradientStart, gradientEnd)}
                                className={`px-2 py-0.5 rounded transition-all ${isGradient ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                            >
                                Gradient
                             </button>
                         </div>
                    </div>
                    
                    {!isGradient ? (
                        <div className="flex items-center gap-3 bg-secondary/30 p-2 rounded-lg border border-border/50">
                            <div className="relative w-full flex items-center gap-3">
                                <div 
                                    className="w-8 h-8 rounded-full shadow-sm ring-1 ring-border/20"
                                    style={{ backgroundColor: color }}
                                ></div>
                                <input 
                                    type="color" 
                                    value={color} 
                                    onChange={(e) => updateColor(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                                <span className="text-sm text-foreground font-medium flex-1">Pick a color</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 bg-secondary/20 p-3 rounded-lg border border-border/50">
                             
                             {/* Gradient Type */}
                             <div className="flex gap-1 bg-secondary/30 p-1 rounded-md mb-2">
                                <button
                                    onClick={() => updateGradientStops(gradientStart, gradientEnd, gradientAngle, 'linear', gradientTransition)}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] uppercase font-medium rounded transition-all ${gradientType === 'linear' ? 'bg-background shadow text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                >
                                    Linear
                                </button>
                                <button
                                    onClick={() => updateGradientStops(gradientStart, gradientEnd, gradientAngle, 'radial', gradientTransition)}
                                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] uppercase font-medium rounded transition-all ${gradientType === 'radial' ? 'bg-background shadow text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                >
                                    Radial
                                </button>
                             </div>

                             {/* Gradient Preview Bar */}
                             <div 
                                className="h-6 rounded-md w-full shadow-inner ring-1 ring-border/20 transition-all"
                                style={{ 
                                    background: gradientType === 'linear' 
                                        ? `linear-gradient(${gradientAngle + 90}deg, ${gradientStart}, ${gradientEnd})`
                                        : `radial-gradient(circle, ${gradientStart}, ${gradientEnd})`
                                }}
                             />
                             
                             {/* Colors */}
                             <div className="flex items-center gap-3">
                                 <div className="space-y-1 flex-1">
                                    <label className="text-[10px] text-muted-foreground uppercase">Start</label>
                                    <div className="relative h-8 rounded border border-border flex items-center gap-2 px-2 bg-background hover:bg-secondary/50">
                                        <div className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: gradientStart }} />
                                        <input 
                                            type="color" 
                                            value={gradientStart}
                                            onChange={(e) => updateGradientStops(e.target.value, gradientEnd, gradientAngle, gradientType, gradientTransition)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                        <span className="text-xs font-mono">{gradientStart}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => updateGradientStops(gradientEnd, gradientStart, gradientAngle, gradientType, gradientTransition)}
                                    className="mt-4 p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                    title="Swap Colors"
                                >
                                    <ArrowLeftRight size={14} />
                                </button>
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] text-muted-foreground uppercase">End</label>
                                    <div className="relative h-8 rounded border border-border flex items-center gap-2 px-2 bg-background hover:bg-secondary/50">
                                        <div className="w-5 h-5 rounded-full border shadow-sm" style={{ backgroundColor: gradientEnd }} />
                                        <input 
                                            type="color" 
                                            value={gradientEnd}
                                            onChange={(e) => updateGradientStops(gradientStart, e.target.value, gradientAngle, gradientType, gradientTransition)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                        />
                                        <span className="text-xs font-mono">{gradientEnd}</span>
                                    </div>
                                </div>
                             </div>

                             {/* Angle Control */}
                             {gradientType === 'linear' && (
                                <div className="space-y-2 pt-2 border-t border-border/30">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Angle</span>
                                        <span>{gradientAngle}°</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="360" 
                                        value={gradientAngle}
                                        onChange={(e) => updateGradientStops(gradientStart, gradientEnd, parseInt(e.target.value), gradientType, gradientTransition)}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                             )}

                             {/* Transition / Spread Control */}
                             <div className="space-y-2 pt-2 border-t border-border/30">
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                    <span>Transition Area</span>
                                    <span>{Math.round(gradientTransition * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.01" 
                                    value={gradientTransition}
                                    onChange={(e) => updateGradientStops(gradientStart, gradientEnd, gradientAngle, gradientType, parseFloat(e.target.value))}
                                    data-default="1"
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                             </div>
                        </div>
                    )}
                </div>

                {/* Opacity Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opacity</label>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(opacity * 100)}%</span>
                    </div>
                    <div className="relative h-6 flex items-center">
                         <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={opacity} 
                            onChange={(e) => updateOpacity(parseFloat(e.target.value))}
                                     data-default="1"
                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                {/* Blending Mode */}
                <div className="space-y-3">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Blend size={12} /> Blending Mode
                    </label>
                    <select
                        value={blendMode}
                        onChange={(e) => updateBlendMode(e.target.value)}
                        className="w-full bg-secondary/50 border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    >
                        <option className="bg-zinc-950 text-white" value="source-over">Normal</option>
                        <option className="bg-zinc-950 text-white" value="multiply">Multiply</option>
                        <option className="bg-zinc-950 text-white" value="screen">Screen</option>
                        <option className="bg-zinc-950 text-white" value="overlay">Overlay</option>
                        <option className="bg-zinc-950 text-white" value="darken">Darken</option>
                        <option className="bg-zinc-950 text-white" value="lighten">Lighten</option>
                        <option className="bg-zinc-950 text-white" value="color-dodge">Color Dodge</option>
                        <option className="bg-zinc-950 text-white" value="color-burn">Color Burn</option>
                        <option className="bg-zinc-950 text-white" value="hard-light">Hard Light</option>
                        <option className="bg-zinc-950 text-white" value="soft-light">Soft Light</option>
                        <option className="bg-zinc-950 text-white" value="difference">Difference</option>
                        <option value="exclusion">Exclusion</option>
                        <option value="hue">Hue</option>
                        <option value="saturation">Saturation</option>
                        <option value="color">Color</option>
                        <option value="luminosity">Luminosity</option>
                    </select>
                </div>

                {/* Effects Section */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                    <h3 className="font-semibold text-sm tracking-tight text-foreground/90 uppercase flex items-center gap-2">
                        <Wand2 size={14} /> Effects
                    </h3>
                    
                    {/* Shadow Effect */}
                    <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 space-y-3">
                        <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-foreground">Drop Shadow</label>
                             </div>
                             <input 
                                type="checkbox"
                                checked={shadowEnabled}
                                onChange={(e) => toggleShadow(e.target.checked)}
                                className="accent-primary w-4 h-4 cursor-pointer"
                             />
                        </div>
                        
                        {shadowEnabled && (
                            <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                        <span>Color</span>
                                    </div>
                                    <div className="relative h-6 w-full rounded border border-border flex items-center px-1 bg-background">
                                        <div className="w-full h-4 rounded-sm border shadow-sm" style={{ backgroundColor: shadowColor }} />
                                        <input 
                                            type="color"
                                            value={shadowColor}
                                            onChange={(e) => updateShadowProp('color', e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Blur</span>
                                        <span>{shadowBlur}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="50" value={shadowBlur} 
                                        onChange={(e) => updateShadowProp('blur', parseInt(e.target.value))}
                                        data-default="10"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Opacity</span>
                                        <span>{Math.round(shadowOpacity * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={shadowOpacity}
                                        onChange={(e) => updateShadowProp('opacity', parseFloat(e.target.value))}
                                        data-default="1"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                            <span>Offset X</span>
                                            <span>{shadowOffsetX}</span>
                                        </div>
                                        <input 
                                            type="range" min="-50" max="50" value={shadowOffsetX} 
                                            onChange={(e) => updateShadowProp('offsetX', parseInt(e.target.value))}
                                            data-default="5"
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                            <span>Offset Y</span>
                                            <span>{shadowOffsetY}</span>
                                        </div>
                                        <input 
                                            type="range" min="-50" max="50" value={shadowOffsetY} 
                                            onChange={(e) => updateShadowProp('offsetY', parseInt(e.target.value))}
                                            data-default="5"
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Image Filters (Only for Images) */}
                    {selectedObject.type === 'image' && (
                        <div className="space-y-3">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Image Filters</label>
                            
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 space-y-4">
                                {/* Blur */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Blur</span>
                                        <span>{Math.round(blurValue * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.01" value={blurValue} 
                                        onChange={(e) => updateImageFilter('Blur', parseFloat(e.target.value))}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                {/* Brightness */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Brightness</span>
                                        <span>{Math.round(brightnessValue * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="-1" max="1" step="0.01" value={brightnessValue} 
                                        onChange={(e) => updateImageFilter('Brightness', parseFloat(e.target.value))}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                {/* Contrast */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Contrast</span>
                                        <span>{Math.round(contrastValue * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" min="-1" max="1" step="0.01" value={contrastValue} 
                                        onChange={(e) => updateImageFilter('Contrast', parseFloat(e.target.value))}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                {/* Saturation and Vibrance */}
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                            <span>Saturation</span>
                                            <span>{Math.round(saturationValue * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="-1" max="1" step="0.01" value={saturationValue} 
                                            onChange={(e) => updateImageFilter('Saturation', parseFloat(e.target.value))}
                                            data-default="0"
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                            <span>Vibrance</span>
                                            <span>{Math.round(vibranceValue * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="-1" max="1" step="0.01" value={vibranceValue} 
                                            onChange={(e) => updateImageFilter('Vibrance', parseFloat(e.target.value))}
                                            data-default="0"
                                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {/* Noise */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Noise</span>
                                        <span>{noiseValue}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1000" step="10" value={noiseValue} 
                                        onChange={(e) => updateImageFilter('Noise', parseInt(e.target.value))}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                
                                {/* Pixelate */}
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                                        <span>Pixelate</span>
                                        <span>{pixelateValue}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="20" step="1" value={pixelateValue} 
                                        onChange={(e) => updateImageFilter('Pixelate', parseInt(e.target.value))}
                                        data-default="0"
                                        className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Masking Release */}
                    {selectedObject.clipPath && (
                         <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 transition-all hover:bg-secondary/30 mt-4">
                             <div className="flex justify-between items-center mb-2">
                                 <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                     <ArrowLeftRight size={12} className="text-primary" /> Masking
                                 </label>
                             </div>
                             <p className="text-[10px] text-muted-foreground mb-3">
                                 This object is currently masked by another shape.
                             </p>
                             
                             <div className="flex items-center gap-2 mb-3">
                                <input 
                                    type="checkbox" 
                                    id="invertMask"
                                    checked={maskInverted}
                                    onChange={toggleMaskInvert}
                                    className="accent-primary w-3.5 h-3.5 cursor-pointer"
                                />
                                <label htmlFor="invertMask" className="text-[10px] text-foreground cursor-pointer select-none">
                                    Invert Mask
                                </label>
                             </div>

                             <button 
                                onClick={releaseMask}
                                className="w-full text-xs font-medium bg-destructive/10 text-destructive px-3 py-2 rounded-md hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center gap-2 transition-colors"
                             >
                                <Trash2 size={12} /> Release Mask
                             </button>
                         </div>
                    )}
                </div>

                {/* Effects Section (Stroke, Shadow, Skew) */}
                <div className="pt-6 border-t border-border/50 space-y-4">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Effects</label>
                    
                    {/* Stroke */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase">
                            <span>Stroke</span>
                            <div className="flex items-center gap-2">
                                <input type="number" min="0" max="20" value={strokeWidth} onChange={(e) => updateStroke(parseFloat(e.target.value))} className="w-8 h-4 bg-transparent text-right outline-none text-xs" />
                                <span>px</span>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                             <input 
                                type="range" 
                                min="0" 
                                max="20" 
                                step="0.5" 
                                value={strokeWidth}
                                onChange={(e) => updateStroke(parseFloat(e.target.value))}
                                          data-default="0"
                                className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="w-6 h-6 rounded-full border border-border shadow-sm relative overflow-hidden shrink-0">
                                <div className="absolute inset-0" style={{ backgroundColor: strokeColor }} />
                                <input 
                                    type="color" 
                                    value={strokeColor} 
                                    onChange={(e) => updateStrokeColor(e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <label className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
                                <input
                                    type="checkbox"
                                    checked={strokeInside}
                                    onChange={(e) => updateStrokeInside(e.target.checked)}
                                    className="accent-primary w-3.5 h-3.5 cursor-pointer"
                                />
                                Inside Stroke
                            </label>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                    <span>Opacity</span>
                                    <span>{Math.round(strokeOpacity * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={strokeOpacity}
                                    onChange={(e) => updateStrokeOpacity(parseFloat(e.target.value))}
                                    data-default="1"
                                    className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Skew */}
                     <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                             <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Skew X</span>
                                <span>{Math.round(skewX)}°</span>
                             </div>
                             <input 
                                type="range" 
                                min="-45" 
                                max="45" 
                                value={skewX}
                                onChange={(e) => updateSkew('x', parseFloat(e.target.value))}
                                          data-default="0"
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <div className="space-y-1">
                             <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Skew Y</span>
                                <span>{Math.round(skewY)}°</span>
                             </div>
                             <input 
                                type="range" 
                                min="-45" 
                                max="45" 
                                value={skewY}
                                onChange={(e) => updateSkew('y', parseFloat(e.target.value))}
                                          data-default="0"
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                            <span>Taper (Depth)</span>
                            <span>{Math.round(skewZ)}</span>
                        </div>
                        <input
                            type="range"
                            min="-180"
                            max="180"
                            value={skewZ}
                            onChange={(e) => updateSkewZ(parseFloat(e.target.value))}
                            data-default="0"
                            className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                            <span>Taper Direction</span>
                            <span>{Math.round(taperDirection)}</span>
                        </div>
                        <div className="relative h-8">
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={taperDirection}
                                onChange={(e) => updateTaperDirection(parseFloat(e.target.value))}
                                onPointerDown={() => setIsTaperDirectionDragging(true)}
                                onPointerUp={() => setIsTaperDirectionDragging(false)}
                                onPointerLeave={() => setIsTaperDirectionDragging(false)}
                                data-default="0"
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            {isTaperDirectionDragging && (
                                <div
                                    className="absolute top-4 h-2 w-2 rounded-full bg-primary shadow"
                                    style={{ left: `calc(${((taperDirection + 100) / 200) * 100}% - 4px)` }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Shadow */}
                    <div className="space-y-3 pt-2">
                         <div className="flex items-center justify-between">
                             <span className="text-xs font-medium">Drop Shadow</span>
                             <div className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${shadowEnabled ? 'bg-primary' : 'bg-secondary'}`} onClick={() => toggleShadow(!shadowEnabled)}>
                                 <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${shadowEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                             </div>
                         </div>
                         
                         {shadowEnabled && (
                             <div className="space-y-3 p-3 bg-secondary/10 rounded-lg border border-border/30 animate-in fade-in slide-in-from-top-2">
                                 {/* Color & Blur */}
                                 <div className="flex gap-3">
                                     <div className="w-8 h-8 rounded-md border border-border shadow-sm relative overflow-hidden shrink-0">
                                        <div className="absolute inset-0" style={{ backgroundColor: shadowColor }} />
                                        <input 
                                            type="color" 
                                            value={shadowColor} 
                                            onChange={(e) => updateShadowProp('color', e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                            <span>Blur</span>
                                            <span>{shadowBlur}px</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="50" 
                                            value={shadowBlur}
                                            onChange={(e) => updateShadowProp('blur', parseFloat(e.target.value))}
                                            data-default="10"
                                            className="w-full h-1 bg-secondary/50 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                 </div>
                                 <div className="space-y-1">
                                     <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                         <span>Opacity</span>
                                         <span>{Math.round(shadowOpacity * 100)}%</span>
                                     </div>
                                     <input
                                         type="range"
                                         min="0"
                                         max="1"
                                         step="0.01"
                                         value={shadowOpacity}
                                         onChange={(e) => updateShadowProp('opacity', parseFloat(e.target.value))}
                                         data-default="1"
                                         className="w-full h-1 bg-secondary/50 rounded-lg appearance-none cursor-pointer"
                                     />
                                 </div>
                                 
                                 {/* Offset */}
                                 <div className="grid grid-cols-2 gap-3">
                                     <div className="space-y-1">
                                         <label className="text-[10px] text-muted-foreground uppercase">Offset X</label>
                                         <input 
                                            type="number" 
                                            value={shadowOffsetX}
                                            onChange={(e) => updateShadowProp('offsetX', parseFloat(e.target.value))}
                                            className="w-full bg-secondary btn-ghost text-xs p-1 px-2 rounded-md border border-border/50 outline-none"
                                         />
                                     </div>
                                     <div className="space-y-1">
                                         <label className="text-[10px] text-muted-foreground uppercase">Offset Y</label>
                                         <input 
                                            type="number" 
                                            value={shadowOffsetY}
                                            onChange={(e) => updateShadowProp('offsetY', parseFloat(e.target.value))}
                                            className="w-full bg-secondary btn-ghost text-xs p-1 px-2 rounded-md border border-border/50 outline-none"
                                         />
                                     </div>
                                 </div>
                             </div>
                         )}
                    </div>
                </div>

                {selectedObject.type === 'image' && onMake3D && (
                    <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">AI Actions</label>
                        <button
                            onClick={() => {
                                const imgObj = selectedObject as fabric.Image;
                                // Use toDataURL to get the image content, enabling it to be sent to API
                                const dataUrl = imgObj.toDataURL();
                                onMake3D(dataUrl);
                            }}
                            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-95"
                        >
                            <Box size={16} />
                            <span>Make 3D</span>
                        </button>
                    </div>
                )}
                
                {(selectedObject.type === 'text' || selectedObject.type === 'i-text') && (
                     <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Typography</label>
                        <div className="grid grid-cols-2 gap-2">
                             <select 
                                value={fontFamily}
                                onChange={(e) => updateFontFamily(e.target.value)}
                                className="w-full bg-secondary btn-ghost text-sm p-2 rounded-md border border-border/50 focus:border-primary outline-none"
                             >
                                <option className="bg-zinc-950 text-white" value="Arial">Arial</option>
                                <option className="bg-zinc-950 text-white" value="Helvetica">Helvetica</option>
                                <option className="bg-zinc-950 text-white" value="Times New Roman">Times New Roman</option>
                                <option className="bg-zinc-950 text-white" value="Courier New">Courier New</option>
                                <option className="bg-zinc-950 text-white" value="Verdana">Verdana</option>
                                <option className="bg-zinc-950 text-white" value="Georgia">Georgia</option>
                                <option className="bg-zinc-950 text-white" value="Tahoma">Tahoma</option>
                                <option className="bg-zinc-950 text-white" value="Trebuchet MS">Trebuchet MS</option>
                            </select>
                            <select 
                                value={fontWeight}
                                onChange={(e) => updateFontWeight(e.target.value)}
                                className="w-full bg-secondary btn-ghost text-sm p-2 rounded-md border border-border/50 focus:border-primary outline-none"
                            >
                                <option className="bg-zinc-950 text-white" value="normal">Regular</option>
                                <option className="bg-zinc-950 text-white" value="bold">Bold</option>
                                <option className="bg-zinc-950 text-white" value="300">Light</option>
                                <option value="600">Semi Bold</option>
                                <option value="800">Extra Bold</option>
                            </select>
                        </div>
                        
                         <div className="space-y-2 pt-2 border-t border-border/30">
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                                <span>Curvature (Arch)</span>
                                <span>{curveStrength}</span>
                             </div>
                             <input 
                                type="range" 
                                min="-100" 
                                max="100" 
                                value={curveStrength}
                                onChange={(e) => updateTextCurve(parseInt(e.target.value))}
                                data-default="0"
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground uppercase pt-2">
                                <span>Arch Center</span>
                                <span>{curveCenter}</span>
                            </div>
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={curveCenter}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setCurveCenter(val);
                                    updateTextCurve(curveStrength, val);
                                }}
                                data-default="0"
                                className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                     </div>
                )}

                {'isStar' in selectedObject && (selectedObject as StarPolygon).isStar && (
                    <div className="pt-6 border-t border-border/50 space-y-4">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Star Settings</label>
                        
                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-foreground">Points</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{starPoints}</span>
                            </div>
                            <input 
                                type="range" 
                                min="3" 
                                max="20" 
                                step="1" 
                                value={starPoints} 
                                onChange={(e) => updateStarPoints(parseInt(e.target.value))}
                                data-default="5"
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-medium text-foreground">Depth</label>
                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{Math.round(starInnerRadius * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.1" 
                                max="0.9" 
                                step="0.05" 
                                value={starInnerRadius} 
                                onChange={(e) => updateStarInnerRadius(parseFloat(e.target.value))}
                                data-default="0.5"
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                )}
            </div>
            
            {/* Footer Actions */}
            <div className="p-4 border-t border-border/50 bg-secondary/5">
                <button 
                    onClick={async () => {
                        if (canvas && selectedObject) {
                            const confirmed = await dialog.confirm('Delete selected element?', { title: 'Delete element', variant: 'destructive' });
                            if (confirmed) {
                                canvas.remove(selectedObject);
                                canvas.discardActiveObject();
                                canvas.requestRenderAll();
                            }
                        }
                    }}
                    className="w-full py-2 bg-destructive/10 text-destructive text-sm font-medium rounded-md hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2"
                >
                    <Trash2 size={16} />
                    Delete Element
                </button>
            </div>
        </div>
    );
}

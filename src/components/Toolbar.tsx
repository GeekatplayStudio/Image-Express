'use client';
import { useEffect, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { Type, Square, Image as ImageIcon, LayoutTemplate, Shapes, Circle, Triangle, Star, Move, Layers, Box, Folder, Wand2, PaintBucket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarPolygon } from '@/types';
import AssetLibrary from './AssetLibrary';
import TemplateLibrary from './TemplateLibrary';
import InputModal from './InputModal';
import ImageGeneratorModal from './ImageGeneratorModal';

/**
 * Toolbar
 * Left sidebar providing access to all creation tools.
 * Manages active tool state and sub-menus (Shapes, Assets).
 */
interface ToolbarProps {
    canvas: fabric.Canvas | null;
    activeTool: string;
    setActiveTool: (tool: string) => void;
    onOpen3DEditor?: (url: string) => void;
}

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

// Start of component
export default function Toolbar({ canvas, activeTool, setActiveTool, onOpen3DEditor }: ToolbarProps) {
    const [showShapesMenu, setShowShapesMenu] = useState(false);
    const [refreshTemplatesTrigger, setRefreshTemplatesTrigger] = useState(0);
    const shapesMenuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showImageGen, setShowImageGen] = useState(false);

    // Reordered tools based on standard workflows (Select -> Create -> Assets -> AI -> Layers)
    const tools = [
        { name: 'select', icon: Move, label: 'Select' },
        { name: 'shapes', icon: Shapes, label: 'Shapes' },
        { name: 'text', icon: Type, label: 'Text' },
        { name: 'gradient', icon: PaintBucket, label: 'Fill / Gradient' },
        { name: 'assets', icon: ImageIcon, label: 'Gallery' },
        { name: 'ai-zone', icon: Wand2, label: 'AI Zone' }, // New Tool
        { name: '3d-gen', icon: Box, label: 'AI 3D' },
        { name: 'templates', icon: LayoutTemplate, label: 'Library' },
        { name: 'layers', icon: Layers, label: 'Layers' },
    ];

    // Close shapes menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (shapesMenuRef.current && !shapesMenuRef.current.contains(event.target as Node)) {
                setShowShapesMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToolClick = (toolName: string) => {
        if (toolName === 'shapes') {
             setShowShapesMenu(!showShapesMenu);
             setActiveTool('shapes');
             return;
        }

        // Toggle behavior: Close tool if clicking standard panel icons again
        if (activeTool === toolName) {
            // Exceptions: 'text' (add new text), 'select' (deselect all)
            const nonTogglingTools = ['select', 'text'];
            if (!nonTogglingTools.includes(toolName)) {
                setActiveTool('select');
                return;
            }
        }

        setActiveTool(toolName);
        setShowShapesMenu(false);
        
        // Handle single-action tools
        switch(toolName) {
            case 'select':
                if (canvas) {
                    canvas.discardActiveObject(); 
                    canvas.requestRenderAll();
                    canvas.defaultCursor = 'default';
                    canvas.hoverCursor = 'move';
                    canvas.selection = true;
                }
                break;
            case 'gradient': 
                if (canvas) {
                    // Enable gradient mode
                    // Disable normal selection for canvas (but allow object selection? No, usually tool takes over)
                    // We'll handle this in a useEffect in parent or separate interactive component
                    canvas.defaultCursor = 'crosshair';
                    canvas.hoverCursor = 'crosshair';
                    canvas.selection = false;
                }
                break;
            case 'text':
                addText();
                break;
            case 'assets':
                // Toggle asset library (merged functionality for media/upload)
                break;
            case 'ai-zone':
                // logic handled by tool activation
                break;
            case 'layers':
                // Properties Panel handles the view reset, we just set activeTool
                break;
        }
    };

    const addRectangle = () => {
        if (!canvas) return;
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: '#8b5cf6',
            width: 100,
            height: 100,
            rx: 0, 
            ry: 0,
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
    };

    const addCircle = () => {
        if (!canvas) return;
        const circle = new fabric.Circle({
            left: 150,
            top: 150,
            fill: '#ec4899', // Pink
            radius: 50,
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
    };

    const addTriangle = () => {
        if (!canvas) return;
        const triangle = new fabric.Triangle({
            left: 200,
            top: 200,
            fill: '#06b6d4', // Cyan
            width: 100,
            height: 100,
        });
        canvas.add(triangle);
        canvas.setActiveObject(triangle);
    };

    const addStar = () => {
        if (!canvas) return;
        
        const points = getStarPoints(5, 25, 50);
        const star = new fabric.Polygon(points, {
            left: 250,
            top: 250,
            fill: '#eab308', // Yellow
            objectCaching: false,
        }) as StarPolygon;
        
        // Attach custom properties for the star
        star.isStar = true;
        star.starPoints = 5;
        star.starInnerRadius = 0.5; // ratio

        canvas.add(star);
        canvas.setActiveObject(star);
    };

    const addText = () => {
        if (!canvas) return;
        const text = new fabric.IText('Tap to edit', {
            left: 100,
            top: 250,
            fontFamily: 'Arial',
            fill: '#1f2937',
            fontSize: 40,
            fontWeight: 'bold'
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    };

    const add3DPlaceholder = (url: string) => {
        if (!canvas) return;
        
        const group = new fabric.Group([], {
            left: 150,
            top: 150,
            subTargetCheck: true,
            interactive: true 
        });

        const box = new fabric.Rect({
            width: 80,
            height: 80,
            fill: '#3b82f6',
            rx: 10,
            ry: 10,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 5, offsetY: 5 })
        });

        const text = new fabric.IText('3D', {
            fontSize: 30,
            fill: 'white',
            left: 20,
            top: 25,
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            selectable: false
        });
        
        group.add(box);
        group.add(text);
        
        // Attach metadata
        (group as any).is3DModel = true;
        (group as any).modelUrl = url;

        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
    };

    const handleUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !canvas) return;

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';

        // If 'media' tool button was used, we assume it's a direct upload. 
        // User asked: "when i select add asset it should have check box ask if i want store on server"
        // The Asset Library component handles this best.
        // But if we stick to the old 'media' button just putting it on canvas, we miss the feature.
        // Let's rely on the new Asset Library for uploading with options.
        // The old media button behavior is preserved here for quick ephemeral access.

        const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!supportedTypes.includes(file.type)) {
            alert('Unsupported file type. Please upload JPEG, PNG, WEBP, or SVG.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result as string;
            loadDataUrlToCanvas(data);
        };
        reader.readAsDataURL(file);
    };

    const loadDataUrlToCanvas = (data: string) => {
        if (!canvas) return;
        fabric.Image.fromURL(data, {
             crossOrigin: 'anonymous'
        }).then((img) => {
             // Scale down if image is too large
             const maxWidth = canvas.width! * 0.5;
             const scale = maxWidth / img.width!;
             if (scale < 1) {
                 img.scale(scale);
             }
             
             img.set({
                 left: 100,
                 top: 100
             });
             
             canvas.add(img);
             canvas.setActiveObject(img);
             canvas.requestRenderAll();
        }).catch((err) => {
             console.error("Error loading image:", err);
        });
    }

    const handleSaveTemplateTrigger = () => {
        if (!canvas) return;
        setShowSaveModal(true);
    };

    const handleSaveTemplateConfirm = async (name: string) => {
        if (!canvas) return;
        setShowSaveModal(false);

        try {
            // Include custom properties in serialization
            const json = canvas.toObject(['id', 'gradient', 'pattern', 'is3DModel', 'modelUrl', 'isStar', 'starPoints', 'starInnerRadius']); 
            const dataUrl = canvas.toDataURL({
                format: 'png',
                multiplier: 0.5,
                quality: 0.8
            });

            const res = await fetch('/api/templates/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    canvasData: json,
                    thumbnailDataUrl: dataUrl
                })
            });

            const data = await res.json();
            if (data.success) {
                // Trigger refresh
                setRefreshTemplatesTrigger(prev => prev + 1);
            } else {
                alert('Failed to save: ' + data.message);
            }
        } catch (err) {
            console.error(err);
            alert('Error saving template');
        }
    };

    const handleLoadTemplate = (url: string) => {
         if (!canvas) return;
         fetch(url)
            .then(res => res.json())
            .then(json => {
                canvas.clear();
                canvas.loadFromJSON(json, () => {
                    canvas.requestRenderAll();
                    setActiveTool('select');
                });
            })
            .catch(err => {
                console.error("Error loading template", err);
                alert("Failed to load template");
            });
    }

    return (
        <div className="flex flex-col gap-3 w-full items-center pt-2 relative">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileChange}
            />
            {tools.map((tool) => (
                <button 
                    key={tool.name}
                    onClick={() => handleToolClick(tool.name)}
                    className={cn(
                        "flex flex-col items-center justify-center gap-1 group relative w-10 h-10 rounded-xl transition-all duration-200 z-20",
                        activeTool === tool.name 
                            ? "bg-primary/20 text-primary shadow-sm" 
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                    title={tool.label}
                >
                    <tool.icon size={20} strokeWidth={1.5} className="group-hover:scale-110 transition-transform duration-200"/>
                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 absolute -bottom-4 transition-opacity duration-200 pointer-events-none whitespace-nowrap bg-popover text-popover-foreground px-2 py-0.5 rounded shadow-md border z-50">
                        {tool.label}
                    </span>
                </button>
            ))}

            {/* Template Library */}
            {activeTool === 'templates' && (
                <TemplateLibrary 
                    key={refreshTemplatesTrigger}
                    onClose={() => setActiveTool('select')}
                    onSelect={handleLoadTemplate}
                    onSaveCurrent={handleSaveTemplateTrigger}
                />
            )}

            {/* AI Image Generation (Zone Selector Overlay) */}
            {activeTool === 'ai-zone' && canvas && (
                 <ImageGeneratorModal 
                    canvas={canvas}
                    onClose={() => setActiveTool('select')}
                 />
            )}

            {showSaveModal && (
                <InputModal  
                    isOpen={showSaveModal}
                    title="Save Template"
                    description="Enter a name for your custom template."
                    placeholder="My Awesome Template"
                    confirmLabel="Save Template"
                    onConfirm={handleSaveTemplateConfirm}
                    onCancel={() => setShowSaveModal(false)}
                />
            )}

            {/* Asset Library */}
            {activeTool === 'assets' && (
                <AssetLibrary 
                    onClose={() => setActiveTool('select')}
                    onSelect={(path, type) => {
                        if (type === 'models') {
                            if (onOpen3DEditor) {
                                onOpen3DEditor(path);
                                setActiveTool('select');
                            } else {
                                add3DPlaceholder(path);
                            }
                        } else {
                            loadDataUrlToCanvas(path);
                        }
                    }}
                />
            )}

            {/* Shapes Popover */}
            {showShapesMenu && (
                <div 
                    ref={shapesMenuRef}
                    className="absolute left-[80px] top-[70px] bg-card border border-border rounded-lg shadow-xl p-3 grid grid-cols-2 gap-2 z-50 w-32 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                    <button onClick={addRectangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Square size={20} />
                        <span className="text-[10px]">Rect</span>
                    </button>
                    <button onClick={addCircle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Circle size={20} />
                        <span className="text-[10px]">Circle</span>
                    </button>
                    <button onClick={addTriangle} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Triangle size={20} />
                        <span className="text-[10px]">Triangle</span>
                    </button>
                    <button onClick={addStar} className="flex flex-col items-center gap-1 p-2 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
                        <Star size={20} />
                        <span className="text-[10px]">Star</span>
                    </button>
                </div>
            )}
        </div>
    );
}

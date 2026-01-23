'use client';

import { useState, useRef, useEffect } from 'react';
import DesignCanvas from '@/components/DesignCanvas';
import Toolbar from '@/components/Toolbar';
import PropertiesPanel from '@/components/PropertiesPanel';
import ThreeDGenerator from '@/components/ThreeDGenerator';
import ThreeDLayerEditor from '@/components/ThreeDLayerEditor';
import SettingsModal from '@/components/SettingsModal';
import JobStatusFooter from '@/components/JobStatusFooter';
import UserProfileModal from '@/components/UserProfileModal';
import AssetLibrary from '@/components/AssetLibrary';
import MissingAssetsModal from '@/components/MissingAssetsModal';
import * as fabric from 'fabric';
import { Download, Share2, Sparkles, Home as HomeIcon, ChevronDown, Image as ImageIcon, FileText, FileCode, Settings, Box, Cloud, User, Save, X, Maximize, Minimize, ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { BackgroundJob, ThreeDImage, ThreeDGroup } from '@/types';

interface MissingItem {
    id: string; 
    type: 'image' | 'model';
    originalSrc: string;
}

interface EditorViewProps {
    initialDesign: any | null;
    initialTemplateJsonUrl: string | null;
    user: string;
    onBack: () => void;
    currentDesignName: string;
    currentDesignId: string | null;
    onUpdateDesignInfo: (id: string | null, name: string) => void;
    onOpenDocumentation?: () => void;
}

type PanelMode = 'docked-left' | 'docked-right' | 'floating' | 'collapsed-left' | 'collapsed-right';

export default function EditorView({ 
    initialDesign, 
    initialTemplateJsonUrl,
    user, 
    onBack,
    currentDesignName: propDesignName,
    currentDesignId: propDesignId,
    onUpdateDesignInfo,
    onOpenDocumentation
}: EditorViewProps) {
    
    // Core Logic States
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [activeTool, setActiveTool] = useState<string>('select');
    const [zoom, setZoom] = useState(1);
    const [isDirty, setIsDirty] = useState(false);

    // Panel State
    const [panelState, setPanelState] = useState<{
        mode: PanelMode;
        position: { x: number; y: number };
        width: number;
    }>({
        mode: 'docked-right', // Default like original
        position: { x: 100, y: 100 },
        width: 320
    });
    
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const dragPanelOffset = useRef({ x: 0, y: 0 });

    const handlePanelDragStart = (e: React.MouseEvent) => {
        setIsDraggingPanel(true);
        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        dragPanelOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        
        // Use window listeners for smoother drag
        const moveHandler = (moveEvent: MouseEvent) => {
            setPanelState(prev => {
                // If we were docked, we are now floating
                // We update position to follow mouse
                return {
                    ...prev,
                    mode: 'floating',
                    position: {
                        x: moveEvent.clientX - dragPanelOffset.current.x,
                        y: moveEvent.clientY - dragPanelOffset.current.y
                    }
                };
            });
        };

        const upHandler = (upEvent: MouseEvent) => {
            setIsDraggingPanel(false);
            window.removeEventListener('mousemove', moveHandler);
            window.removeEventListener('mouseup', upHandler);
            
            // Check for Docking
            const screenWidth = window.innerWidth;
            const x = upEvent.clientX;
            
            if (x < 100) {
                setPanelState(prev => ({ ...prev, mode: 'docked-left', position: { x: 0, y: 0 } }));
            } else if (x > screenWidth - 100) {
                setPanelState(prev => ({ ...prev, mode: 'docked-right', position: { x: 0, y: 0 } }));
            }
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
    };

    const toggleCollapse = () => {
        setPanelState(prev => {
            if (prev.mode === 'docked-left') return { ...prev, mode: 'collapsed-left' };
            if (prev.mode === 'docked-right') return { ...prev, mode: 'collapsed-right' };
            if (prev.mode === 'collapsed-left') return { ...prev, mode: 'docked-left' };
            if (prev.mode === 'collapsed-right') return { ...prev, mode: 'docked-right' };
            return prev;
        });
    };

    const toggleFloat = () => {
        setPanelState(prev => {
            if (prev.mode === 'floating') return { ...prev, mode: 'docked-right', position: { x: 0, y: 0 }};
            // Default float pos center-ish
             return { ...prev, mode: 'floating', position: { x: window.innerWidth - 400, y: 100 }};
        });
    };
    
    // UI States
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    
    // Assets & Missing Items
    const [showMissingAssetsModal, setShowMissingAssetsModal] = useState(false);
    const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
    const [pendingTemplateJson, setPendingTemplateJson] = useState<any>(null);
    const [showAssetBrowserForMissing, setShowAssetBrowserForMissing] = useState(false);
    const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
    const [replacementMap, setReplacementMap] = useState<Record<string, string>>({});

    // 3D & AI States
    const [initialImageFor3D, setInitialImageFor3D] = useState<string | undefined>(undefined);
    const [sourceObjectFor3D, setSourceObjectFor3D] = useState<fabric.Object | null>(null);
    const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
    const [editingModelUrl, setEditingModelUrl] = useState<string | null>(null);
    const [editingModelObject, setEditingModelObject] = useState<fabric.Object | null>(null);
    const exportRef = useRef<HTMLDivElement>(null);
    
    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number } | null>(null);

    // API Keys State
    const [apiKeys, setApiKeys] = useState<{
        meshy?: string, 
        tripo?: string, 
        stability?: string, 
        openai?: string, 
        google?: string,
        banana?: string
    }>({});

    // --- Loading Logic ---
    useEffect(() => {
        if (!canvas) return;

        // If we have an initial template URL (passed from dashboard selection)
        if (initialTemplateJsonUrl) {
            handleLoadTemplate(initialTemplateJsonUrl);
        } 
        // Or if we have a full design object (opened from dashboard)
        else if (initialDesign) {
            handleOpenDesign(initialDesign);
        }
        
    }, [canvas, initialDesign, initialTemplateJsonUrl]);

    // Handle Open Design (Local helpers)
    const handleOpenDesign = async (design: any) => {
        if (!canvas) return;
        
        let designData = design.data;
        if (typeof designData === 'string') {
            try {
                const res = await fetch(designData);
                if (!res.ok) throw new Error("Failed to fetch design data");
                designData = await res.json();
            } catch (e) {
                console.error("Error loading design data", e);
                alert("Could not load design data.");
                return;
            }
        }
  
        canvas.loadFromJSON(designData, () => {
            canvas.requestRenderAll();
            // Don't set isDirty, we just opened it
            setIsDirty(false);
        });
    };

    // --- Navigation Guard ---
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleBack = () => {
        if (isDirty) {
            if (confirm("Discard unsaved changes and leave?")) {
                setIsDirty(false);
                onBack();
            }
        } else {
            onBack();
        }
    };

    // --- Save Logic ---
    const handleSave = async () => {
       if (!canvas) return;
       
       let name = propDesignName;
       
       if (!propDesignId && name === 'Untitled Design') {
           const inputName = prompt("Enter design name:", propDesignName);
           if (!inputName) return; 
           name = inputName;
       } else if (name === 'Untitled Design') {
            const inputName = prompt("Enter design name:", propDesignName);
            if (inputName) name = inputName;
       }
       
       const json = canvas.toJSON();
       const thumbnailDataUrl = canvas.toDataURL({ format: 'png', multiplier: 0.5 });

       try {
           const response = await fetch('/api/designs/save', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                   id: propDesignId,
                   name,
                   canvasData: json,
                   thumbnailDataUrl
               })
           });
           
           const result = await response.json();
           if (result.success) {
                onUpdateDesignInfo(result.design.id, result.design.name);
                setIsDirty(false);
                alert("Design saved successfully!");
           } else {
                alert("Failed to save design: " + result.message);
           }
       } catch (error) {
           console.error("Save error:", error);
           alert("Error saving design to server.");
       }
    };

    // --- Export Logic ---
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
          if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
            setShowExportMenu(false);
          }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleExport = (format: 'png' | 'jpg' | 'svg' | 'pdf' | 'json') => {
        if (!canvas) return;
        try {
            let dataUrl = '';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `design-${timestamp}.${format}`;
    
            switch (format) {
                case 'png':
                    dataUrl = canvas.toDataURL({
                        format: 'png',
                        quality: 1,
                        multiplier: 1,
                        enableRetinaScaling: true
                    });
                    downloadFile(dataUrl, filename);
                    break;
                case 'jpg':
                    const originalBg = canvas.backgroundColor;
                    canvas.set('backgroundColor', '#ffffff');
                    dataUrl = canvas.toDataURL({
                        format: 'jpeg',
                        quality: 0.9,
                        multiplier: 1,
                        enableRetinaScaling: true
                    });
                    downloadFile(dataUrl, filename);
                    canvas.set('backgroundColor', originalBg); 
                    canvas.requestRenderAll();
                    break;
                case 'svg':
                    const svgContent = canvas.toSVG();
                    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    downloadFile(url, filename);
                    break;
                 case 'pdf':
                    const pdfWidth = canvas.width!;
                    const pdfHeight = canvas.height!;
                    const pdf = new jsPDF({
                        orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
                        unit: 'px',
                        format: [pdfWidth, pdfHeight]
                    });
                    const imgData = canvas.toDataURL({
                        format: 'png',
                        quality: 1,
                        multiplier: 1,
                        enableRetinaScaling: true
                    });
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    pdf.save(filename);
                    break;
                 case 'json':
                    const json = JSON.stringify(canvas.toJSON());
                    const jsonBlob = new Blob([json], { type: 'application/json' });
                    const jsonUrl = URL.createObjectURL(jsonBlob);
                    downloadFile(jsonUrl, `design-${timestamp}.json`);
                    break;
            }
        } catch (error) {
            console.error("Export failed:", error);
        }
        setShowExportMenu(false);
    };

    const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Template Loading Helper (Missing Assets Logic) ---
    const handleLoadTemplate = async (templateJsonUrl: string) => {
        if (!canvas) return;
        setMissingItems([]);
        setPendingTemplateJson(null);
   
        try {
           const res = await fetch(templateJsonUrl);
           if(!res.ok) throw new Error("Failed to fetch template JSON");
           
           const json = await res.json();
           const objects = json.objects || [];
           const missing: MissingItem[] = [];
   
           const checkUrl = (url: string): Promise<boolean> => {
               return new Promise((resolve) => {
                   const img = new Image();
                   img.onload = () => resolve(true);
                   img.onerror = () => resolve(false);
                   img.src = url; 
               });
           };
           
           const candidates: { index: number, src: string, type: 'image' | 'model' }[] = [];
           objects.forEach((obj: any, index: number) => {
               if (obj.type === 'image' && obj.src) candidates.push({ index, src: obj.src, type: 'image' });
               if (obj.is3DModel && obj.modelUrl) candidates.push({ index, src: obj.modelUrl, type: 'model' });
           });
   
           for (const cand of candidates) {
               let exists = false;
               if (cand.type === 'model') {
                    try {
                        const head = await fetch(cand.src, { method: 'HEAD' });
                        exists = head.ok;
                    } catch { exists = false; }
               } else {
                    exists = await checkUrl(cand.src);
               }
               if (!exists) {
                   missing.push({
                       id: cand.index.toString(),
                       type: cand.type,
                       originalSrc: cand.src
                   });
               }
           }
   
           if (missing.length > 0) {
               setMissingItems(missing);
               setPendingTemplateJson(json);
               setShowMissingAssetsModal(true);
           } else {
               canvas.loadFromJSON(json, () => {
                   canvas.requestRenderAll();
                   setIsDirty(false);
               });
           }
        } catch (e) {
            console.error("Failed to load template", e);
            alert("Error loading template file.");
        }
    };
    
    // --- Resolving Missing Assets ---
    const handleResolveMissing = (replaceMap: Record<string, string> | null) => {
        if (!canvas || !pendingTemplateJson) return;
        const json = JSON.parse(JSON.stringify(pendingTemplateJson));
        if (replaceMap) {
            Object.entries(replaceMap).forEach(([indexStr, newUrl]) => {
                const idx = parseInt(indexStr);
                if (json.objects && json.objects[idx]) {
                     const obj = json.objects[idx];
                     if (obj.type === 'image') obj.src = newUrl;
                     if (obj.is3DModel) obj.modelUrl = newUrl;
                }
            });
        } else {
            const indicesToRemove = missingItems.map(m => parseInt(m.id)).sort((a,b) => b-a);
            indicesToRemove.forEach(idx => {
                 json.objects.splice(idx, 1);
            });
        }
        canvas.loadFromJSON(json, () => {
            canvas.requestRenderAll();
            setIsDirty(false);
            setPendingTemplateJson(null);
            setMissingItems([]);
            setShowMissingAssetsModal(false);
        });
    };

    // --- Interactive Tools & Events (Zoom, Gradient, DoubleClick 3D) ---
    const handleZoom = (factor: number) => {
        if (!canvas) return;
        
        // Safeguard: Ensure canvas fills parent container before zooming
        // We use the canvas wrapper element to find the parent container size
        const wrapper = canvas.getElement()?.parentElement?.parentElement; // Adjust traversal if needed, or check logic
        // Actually, canvas wrapper is usually a div inside our container. 
        // Best bet: check canvas.width vs clientWidth of its placeholder? 
        // Let's rely on standard re-check or just setDimensions if we can find parent.
        // Fabric's lower-canvas is usually wrapped in .canvas-container. 
        // We can check .canvas-container's parent.
        if (wrapper && wrapper.clientWidth > 0 && wrapper.clientHeight > 0) {
             const pW = wrapper.clientWidth;
             const pH = wrapper.clientHeight;
             if (canvas.width !== pW || canvas.height !== pH) {
                 canvas.setDimensions({ width: pW, height: pH });
             }
        }

        const currentZoom = canvas.getZoom();
        let newZoom = currentZoom + factor;
        
        // Limits matching DesignCanvas
        newZoom = Math.max(0.05, Math.min(newZoom, 20));
        
        // Zoom to center of the current viewport
        const centerPoint = new fabric.Point(canvas.width! / 2, canvas.height! / 2);
        canvas.zoomToPoint(centerPoint, newZoom);
        
        canvas.requestRenderAll();
        setZoom(newZoom);
    };

    // Sync UI zoom state with Canvas events (e.g. Mouse Wheel)
    useEffect(() => {
        if (!canvas) return;
        
        const updateZoomState = () => {
            setZoom(canvas.getZoom());
        };
        
        canvas.on('mouse:wheel', updateZoomState);
        // Also sync on touch/pinch gestures if any
        
        return () => {
            canvas.off('mouse:wheel', updateZoomState);
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;
    
        const handleDblClick = (e: fabric.TPointerEventInfo) => {
          const target = e.target as ThreeDImage | undefined;
          if (target && (target.is3DModel || target.modelUrl)) {
            setEditingModelUrl(target.modelUrl || null);
            setEditingModelObject(target);
          } else if (target) {
            setActiveTool('select');
          }
        };
    
        const handleWheel = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
            const evt = opt.e;
            evt.preventDefault();
            evt.stopPropagation();
            const delta = evt.deltaY;
            const currentZoom = canvas.getZoom();
            let newZoom = currentZoom * (0.999 ** delta);
            if (newZoom > 5) newZoom = 5;
            if (newZoom < 0.1) newZoom = 0.1;
            
            const width = canvas.width!;
            const height = canvas.height!;
            const baseWidth = width / currentZoom;
            const baseHeight = height / currentZoom;
    
            canvas.setZoom(newZoom);
            canvas.setDimensions({ width: baseWidth * newZoom, height: baseHeight * newZoom });
            canvas.requestRenderAll();
            setZoom(newZoom);
        };
    
        const handleGradientTool = () => {
            let isDown = false;
            let startPoint = { x: 0, y: 0 };
            let activeObj: fabric.Object | null | undefined = null;
    
            return {
                'mouse:down': (opt: fabric.TPointerEventInfo) => {
                    if (activeTool !== 'gradient') return;
                    if (opt.target) {
                        canvas.setActiveObject(opt.target);
                        activeObj = opt.target;
                    } else {
                        activeObj = canvas.getActiveObject();
                    }
                    if (!activeObj) return;
                    isDown = true;
                    const pointer = canvas.getScenePoint(opt.e);
                    startPoint = { x: pointer.x, y: pointer.y };
                },
                'mouse:move': (opt: fabric.TPointerEventInfo) => {
                    if (!isDown || activeTool !== 'gradient' || !activeObj) return;
                    const pointer = canvas.getScenePoint(opt.e);
                    const m = activeObj.calcTransformMatrix();
                    const mInv = fabric.util.invertTransform(m);
                    const p1Local = fabric.util.transformPoint(new fabric.Point(startPoint.x, startPoint.y), mInv);
                    const p2Local = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), mInv);
                    const w = activeObj.width || 1; 
                    const h = activeObj.height || 1;
                    const ox = activeObj.originX === 'center' ? 0.5 : (activeObj.originX === 'right' ? 1 : 0);
                    const oy = activeObj.originY === 'center' ? 0.5 : (activeObj.originY === 'bottom' ? 1 : 0);
                    const n1 = { x: (p1Local.x / w) + ox, y: (p1Local.y / h) + oy };
                    const n2 = { x: (p2Local.x / w) + ox, y: (p2Local.y / h) + oy };
    
                    const newGradient = new fabric.Gradient({
                        type: 'linear', gradientUnits: 'percentage',
                        coords: { x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y },
                        colorStops: [ { offset: 0, color: 'blue' }, { offset: 1, color: 'red' } ]
                    });
                    const currentFill = activeObj.get('fill');
                    if (currentFill && (currentFill as fabric.Gradient<'linear'>).type === 'linear') {
                         newGradient.colorStops = (currentFill as fabric.Gradient<'linear'>).colorStops;
                    }
                    activeObj.set('fill', newGradient);
                    canvas.requestRenderAll();
                },
                'mouse:up': () => { isDown = false; activeObj = null; }
            };
        };
    
        const gradientHandlers = handleGradientTool();
        canvas.on('mouse:wheel', handleWheel);
        canvas.on('mouse:dblclick', handleDblClick);
        canvas.on('mouse:down', gradientHandlers['mouse:down']);
        canvas.on('mouse:move', gradientHandlers['mouse:move']);
        canvas.on('mouse:up', gradientHandlers['mouse:up']);
    
        return () => {
          canvas.off('mouse:wheel', handleWheel);
          canvas.off('mouse:dblclick', handleDblClick);
          canvas.off('mouse:down', gradientHandlers['mouse:down']);
          canvas.off('mouse:move', gradientHandlers['mouse:move']);
          canvas.off('mouse:up', gradientHandlers['mouse:up']);
        };
    }, [canvas, activeTool]);


    // --- Background Jobs (AI) ---
    // Check API keys on mount and when settings close
    useEffect(() => {
        const checkKeys = () => {
            setApiKeys({
                meshy: localStorage.getItem('meshy_api_key') || undefined,
                tripo: localStorage.getItem('tripo_api_key') || undefined,
                stability: localStorage.getItem('stability_api_key') || undefined,
                openai: localStorage.getItem('openai_api_key') || undefined,
                google: localStorage.getItem('google_api_key') || undefined,
                banana: localStorage.getItem('banana_api_key') || undefined,
            });
        };
        checkKeys();
    }, [showSettings]);
    
    const is3DMode = activeTool === '3d-gen';
    const has2DKey = !!(apiKeys.stability || apiKeys.openai || apiKeys.google || apiKeys.banana);
    const has3DKey = !!(apiKeys.meshy || apiKeys.tripo);
    const isConnected = is3DMode ? has3DKey : has2DKey;

    useEffect(() => {
        const activeJobs = backgroundJobs.filter(j => j.status === 'PENDING' || j.status === 'IN_PROGRESS');
        if (activeJobs.length === 0) return;
    
        const checkJobStatus = async (job: BackgroundJob) => {
            if (!job.id || !job.apiKey) return;
            try {
                type ApiResponse = {
                    status?: string; progress?: number;
                    model_urls?: { glb: string }; thumbnail_url?: string;
                    data?: { status: string; progress: number; output?: any };
                    code?: number; 
                };
                let data: ApiResponse | null = null;
                let status: BackgroundJob['status'] = job.status;
                let progress = job.progress || 0;
                let resultUrl = job.resultUrl;
                let thumbnailUrl = job.thumbnailUrl;
    
                if (job.provider === 'stability') {
                    const res = await fetch(`/api/ai/stability/upscale/poll?id=${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.status === 'SUCCEEDED') {
                         status = 'SUCCEEDED';
                         resultUrl = `data:image/png;base64,${data.image}`; 
                    } else if (data.status === 'IN_PROGRESS') {
                         status = 'IN_PROGRESS';
                    } else {
                         status = 'FAILED';
                    }
                } else if (job.provider === 'tripo') {
                     const res = await fetch(`/api/ai/tripo/${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                     if (!res.ok) return;
                     const json = (await res.json()) as ApiResponse;
                     if (json.data) {
                         const tData = json.data;
                         if (tData.status === 'success') status = 'SUCCEEDED';
                         else if (tData.status === 'failed' || tData.status === 'cancelled') status = 'FAILED';
                         else status = 'IN_PROGRESS';
                         progress = tData.progress;
                         resultUrl = tData.output?.model || tData.output?.pbr_model || tData.output?.base_model;
                         thumbnailUrl = tData.output?.rendered_image || tData.output?.render_image;
                     } else if (json.code !== undefined && json.code !== 0) { status = 'FAILED'; }
                } else {
                    const endpoint = job.type === 'image-to-3d' ? 'image-to-3d' : 'text-to-3d';
                    const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}/${job.id}`, { headers: { 'Authorization': `Bearer ${job.apiKey}` } });
                    if (!res.ok) return;
                    data = (await res.json()) as ApiResponse;
                    if (data.status === 'SUCCEEDED') status = 'SUCCEEDED';
                    else if (data.status === 'FAILED' || data.status === 'EXPIRED') status = 'FAILED';
                    else status = 'IN_PROGRESS'; 
                    if (data.progress !== undefined) progress = data.progress;
                    resultUrl = data.model_urls?.glb;
                    thumbnailUrl = data.thumbnail_url;
                }
    
                if (status === 'SUCCEEDED' || status === 'FAILED') {
                     const updatedJob: BackgroundJob = { ...job, status: status, resultUrl: resultUrl, thumbnailUrl: thumbnailUrl, progress: status === 'SUCCEEDED' ? 100 : progress };
                     setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));
                     if (status === 'SUCCEEDED' && resultUrl) {
                          let filename = (job.prompt || 'generated').slice(0, 15).replace(/[^a-z0-9]/gi, '_');
                          if (!filename.toLowerCase().endsWith('.glb')) filename += '.glb';
                          try {
                            await fetch('/api/assets/save-url', { method: 'POST', body: JSON.stringify({ url: resultUrl, filename: filename, type: 'models' }) });
                          } catch (err) { console.error("Failed to auto-save asset", err); }
    
                          const addFallbackPlaceholder = () => {
                              if (!canvas) return; 
                              const group = new fabric.Group([], { left: 150, top: 150, subTargetCheck: true, interactive: true });
                              const box = new fabric.Rect({ width: 100, height: 100, fill: '#3b82f6', rx: 10, ry: 10 });
                              const text = new fabric.IText('3D', { fontSize: 30, fill: 'white', left: 30, top: 35, fontFamily: 'sans-serif', fontWeight: 'bold' });
                              group.add(box); group.add(text);
                              const threeDGroup = group as ThreeDGroup;
                              threeDGroup.is3DModel = true; threeDGroup.modelUrl = resultUrl;
                              canvas.add(threeDGroup); canvas.setActiveObject(threeDGroup); canvas.requestRenderAll();
                          };
    
                          if (canvas) {
                              if (thumbnailUrl) {
                                fabric.FabricImage.fromURL(thumbnailUrl, { crossOrigin: 'anonymous' })
                                    .then(img => {
                                        if (!img) throw new Error("Image loaded but null");
                                        img.scaleToWidth(200); img.set({ left: 100, top: 100 });
                                        const threeDImg = img as ThreeDImage; threeDImg.is3DModel = true; threeDImg.modelUrl = resultUrl;
                                        canvas.add(threeDImg); canvas.setActiveObject(threeDImg); canvas.requestRenderAll();
                                    }).catch(err => { addFallbackPlaceholder(); });
                              } else { addFallbackPlaceholder(); }
                          }
                      }
                } else {
                     if (progress !== job.progress || status !== job.status) {
                         setBackgroundJobs(prev => prev.map(p => p.id === job.id ? { ...p, progress: progress, status: status } : p));
                     }
                }
            } catch (e) { }
        };
        const interval = setInterval(() => { activeJobs.forEach(job => checkJobStatus(job)); }, 2000);
        return () => clearInterval(interval);
    }, [backgroundJobs, canvas]);

    return (
        <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
            {/* Editor Header */}
            <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-20 relative shadow-sm">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg flex items-center justify-center">
                          <span className="font-bold text-white text-lg">IE</span>
                        </div>
                        <span className="font-bold text-lg hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-pink-500">
                          {propDesignName || 'Explorer'}
                        </span>
                    </div>
                    <nav className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
                       <button 
                          onClick={handleBack}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                       >
                         <HomeIcon size={16} />
                         <span>Home</span>
                       </button>
                    </nav>
                 </div>

                 {/* Actions */}
                      <div className="flex items-center gap-3">
                            <button 
                                onClick={() => onOpenDocumentation?.()}
                                className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title="How to use Image Express"
                            >
                                ?
                            </button>
                     <button 
                        onClick={() => handleSave()}
                        className={`p-2 hover:bg-secondary rounded-full transition-colors ${isDirty ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                        title="Save Design"
                     >
                        <Save size={20} />
                     </button>
        
                     <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                        title="Settings"
                     >
                        <Settings size={20} />
                     </button>
        
                     <button 
                        onClick={() => setShowProfileModal(true)}
                        className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground ml-1"
                        title="User Profile"
                     >
                        <User size={20} />
                     </button>
                     
                     <div className="flex items-center gap-2 mr-2">
                         <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                                has3DKey ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600' : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-50'
                            }`} title={has3DKey ? "3D Services Connected" : "No 3D Services Connected"}
                         >
                            <Box size={14} strokeWidth={has3DKey ? 2 : 1.5} />
                            {has3DKey && <span className="text-[10px] font-bold">3D</span>}
                         </div>
                         <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                                has2DKey ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-50'
                            }`} title={has2DKey ? "Generative AI Connected" : "No Generative AI Connected"}
                         >
                            <Cloud size={14} strokeWidth={has2DKey ? 2 : 1.5} />
                             {has2DKey && <span className="text-[10px] font-bold">AI</span>}
                         </div>
                     </div>
        
                     <button
                        onClick={() => {
                            if (!isConnected) { setShowSettings(true); return; }
                            if (!is3DMode) { setActiveTool(activeTool === 'ai-zone' ? 'select' : 'ai-zone'); }
                        }}
                        className={`p-2.5 rounded-full border flex items-center justify-center transition-all duration-200 ${
                            isConnected ? 'bg-gradient-to-tr from-yellow-400/20 to-orange-500/20 border-orange-500/30 text-orange-600 hover:bg-orange-500/30 hover:shadow-md cursor-pointer'
                            : 'bg-secondary/30 border-transparent text-muted-foreground/40 cursor-not-allowed group'
                        }`}
                        title={isConnected ? "Open Generator" : "Connect AI Services in Settings"}
                     >
                        <Sparkles size={18} className={`transition-all ${isConnected ? "text-orange-500 fill-orange-500/20" : "text-muted-foreground/40"}`} />
                     </button>
                     <div className="h-6 w-px bg-border mx-1"></div>
                     <button className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                        <Share2 size={20} />
                     </button>
                     
                     <div className="relative" ref={exportRef}>
                        <button 
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20 transition-all transform hover:scale-105 active:scale-95"
                        >
                            <Download size={16} />
                            <span>Export</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 z-50">
                                <button onClick={() => handleExport('png')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-blue-500"/> <span className="font-medium">PNG</span></button>
                                <button onClick={() => handleExport('jpg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><ImageIcon size={16} className="text-orange-500"/> <span className="font-medium">JPG</span></button>
                                <button onClick={() => handleExport('svg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-purple-500"/> <span className="font-medium">SVG</span></button>
                                <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileText size={16} className="text-red-500"/> <span className="font-medium">PDF</span></button>
                                <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3"><FileCode size={16} className="text-green-500"/> <span className="font-medium">JSON</span></button>
                            </div>
                        )}
                     </div>
                     <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-400 to-cyan-300 ring-2 ring-background ml-2"></div>
                 </div>
            </header>

            {/* Overlays */}
            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} userId={user} />
            <UserProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} username={user} onLogout={onBack} />
            
            {showAssetBrowserForMissing && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                     <div className="bg-card w-[800px] h-[600px] rounded-xl shadow-2xl relative flex flex-col overflow-hidden border border-border">
                          <div className="flex-1 overflow-hidden">
                              <AssetLibrary 
                                  onSelect={(url) => { if (replacingItemId) { setReplacementMap(prev => ({ ...prev, [replacingItemId]: url })); } setShowAssetBrowserForMissing(false); setReplacingItemId(null); }}
                                  onClose={() => setShowAssetBrowserForMissing(false)}
                              />
                          </div>
                          <button onClick={() => setShowAssetBrowserForMissing(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground bg-background/50 rounded-full p-1 z-50"> <X size={20} /> </button>
                     </div>
                </div>
            )}
            
            <MissingAssetsModal 
                  isOpen={showMissingAssetsModal}
                  missingItems={missingItems}
                  onReplace={(id) => { setReplacingItemId(id); setShowAssetBrowserForMissing(true); }}
                  onIgnore={() => { handleResolveMissing(Object.keys(replacementMap).length > 0 ? replacementMap : null); }}
                  onClose={() => { setShowMissingAssetsModal(false); setPendingTemplateJson(null); }}
            />

            {/* Main Editor Layout */}
            <div className="flex flex-1 overflow-hidden relative">
                <aside className="w-[60px] bg-card border-r flex flex-col items-center py-4 z-20 shadow-xl gap-4 relative">
                     <Toolbar 
                        canvas={canvas} 
                        activeTool={activeTool} 
                        setActiveTool={setActiveTool} 
                        onOpen3DEditor={(url) => setEditingModelUrl(url)} 
                        apiKeys={apiKeys} 
                        onJobCreated={(job) => setBackgroundJobs(prev => [...prev, job])} 
                     />
                </aside>

                {/* Left Docked Panel */}
                {panelState.mode === 'docked-left' && (
                    <aside style={{ width: panelState.width }} className="bg-card border-r flex flex-col z-10 shadow-xl overflow-hidden shrink-0">
                        <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14}/> Properties</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12}/></button>
                                <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronLeft size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                             <PropertiesPanel 
                                canvas={canvas} activeTool={activeTool} onLayerDblClick={() => setActiveTool('select')}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                            />
                        </div>
                    </aside>
                )}
                 {panelState.mode === 'collapsed-left' && (
                     <div onClick={toggleCollapse} className="w-4 bg-muted border-r hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                         <ChevronRight size={14} className="text-muted-foreground" />
                     </div>
                 )}

                <main className="flex-1 bg-secondary/30 relative flex items-center justify-center overflow-hidden">
                   <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                   
                   {/* DOCK ZONES (Visible when Dragging) */}
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

                   {/* Main Canvas Area - Full Width/Height */}
                   <div className="absolute inset-0 z-0 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
                        {editingModelUrl && (
                            <ThreeDLayerEditor 
                                 modelUrl={editingModelUrl}
                                 existingObject={editingModelObject}
                                 onClose={() => { setEditingModelUrl(null); setEditingModelObject(null); }}
                                 onSave={(dataUrl, currentModelUrl) => {
                                     if (canvas) {
                                        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then(img => {
                                            if (editingModelObject) {
                                                img.set({ left: editingModelObject.left, top: editingModelObject.top, scaleX: editingModelObject.scaleX, scaleY: editingModelObject.scaleY, angle: editingModelObject.angle, originX: "center", originY: "center" });
                                                canvas.remove(editingModelObject);
                                            } else { img.scaleToWidth(300); img.set({ left: 300, top: 300, originX: 'center', originY: 'center' }); }
                                            const threeDImg = img as ThreeDImage; threeDImg.is3DModel = true; threeDImg.modelUrl = currentModelUrl;
                                            canvas.add(threeDImg); canvas.setActiveObject(threeDImg); canvas.requestRenderAll();
                                            setEditingModelUrl(null); setEditingModelObject(null);
                                        });
                                     }
                                 }}
                            />
                        )}
                        {activeTool === '3d-gen' && (
                            <ThreeDGenerator 
                                initialImage={initialImageFor3D}
                                activeJob={backgroundJobs.find(j => j.status === 'IN_PROGRESS' || j.status === 'PENDING')}
                                onStartBackgroundJob={(jobData) => {
                                    setBackgroundJobs(prev => [...prev, jobData as BackgroundJob]);
                                    if (sourceObjectFor3D && canvas) { sourceObjectFor3D.set('visible', false); canvas.requestRenderAll(); }
                                    setActiveTool('select'); setInitialImageFor3D(undefined); setSourceObjectFor3D(null);
                                }}
                                onAddToCanvas={(dataUrl, modelUrl) => {
                                    if (canvas) {
                                        fabric.FabricImage.fromURL(dataUrl).then((img) => {
                                            // Handle resizing to fit viewport/artboard
                                            // @ts-ignore
                                            const artboard = canvas.artboard || { width: canvas.width || 800, height: canvas.height || 600 };
                                            const viewW = artboard.width;
                                            const viewH = artboard.height;
                                            
                                            if (img.width! > viewW * 0.8 || img.height! > viewH * 0.8) {
                                                const scale = Math.min((viewW * 0.8) / img.width!, (viewH * 0.8) / img.height!);
                                                img.scale(scale);
                                            }
                                            
                                            // Center object on canvas instead of hardcoded 100,100
                                            canvas.centerObject(img);
                                            
                                            if (modelUrl) { const threeDImg = img as ThreeDImage; threeDImg.is3DModel = true; threeDImg.modelUrl = modelUrl; }
                                            canvas.add(img); canvas.setActiveObject(img);
                                            if (sourceObjectFor3D) { sourceObjectFor3D.set('visible', false); canvas.requestRenderAll(); }
                                            setActiveTool('select'); setInitialImageFor3D(undefined); setSourceObjectFor3D(null);
                                        });
                                    }
                                }}
                                onClose={() => { setActiveTool('select'); setInitialImageFor3D(undefined); setSourceObjectFor3D(null); }} 
                            />
                        )}
                        <DesignCanvas onCanvasReady={setCanvas} onModified={() => setIsDirty(true)} />
                   </div>
                   
                   <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover/90 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-border/50 z-20 transform hover:-translate-y-1 transition-transform duration-300">
                       <button onClick={() => handleZoom(0.1)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Zoom In">+</button>
                       <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
                       <button onClick={() => handleZoom(-0.1)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Zoom Out">-</button>
                   </div>
                </main>
                
                {/* Right Docked Panel */}
                {panelState.mode === 'docked-right' && (
                    <aside style={{ width: panelState.width }} className="bg-card border-l flex flex-col z-10 shadow-xl overflow-hidden shrink-0">
                         <div className="h-8 bg-muted border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><GripHorizontal size={14}/> Properties</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded"><Maximize size={12}/></button>
                                <button onClick={toggleCollapse} className="p-0.5 hover:bg-background rounded"><ChevronRight size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            <PropertiesPanel 
                                canvas={canvas} activeTool={activeTool} onLayerDblClick={() => setActiveTool('select')}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                            />
                        </div>
                    </aside>
                )}
                 {panelState.mode === 'collapsed-right' && (
                     <div onClick={toggleCollapse} className="w-4 bg-muted border-l hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors">
                         <ChevronLeft size={14} className="text-muted-foreground" />
                     </div>
                 )}

                {/* Floating Panel Overlay */}
                {panelState.mode === 'floating' && (
                    <div 
                         style={{ 
                             position: 'fixed', 
                             left: panelState.position.x, 
                             top: panelState.position.y, 
                             width: panelState.width,
                             height: '70vh', // Fixed height when floating
                         }} 
                         className="z-50 shadow-2xl border rounded-xl overflow-hidden bg-card flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    >
                         <div className="h-8 bg-secondary border-b flex items-center justify-between px-2 cursor-move select-none" onMouseDown={handlePanelDragStart}>
                             <div className="flex items-center gap-2 text-xs font-semibold"><GripHorizontal size={14}/> Properties (Floating)</div>
                             <div className="flex gap-1">
                                <button onClick={toggleFloat} className="p-0.5 hover:bg-background rounded" title="Dock Right"><Minimize size={12}/></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                             <PropertiesPanel 
                                canvas={canvas} activeTool={activeTool} onLayerDblClick={() => setActiveTool('select')}
                                onMake3D={(imageUrl) => { setInitialImageFor3D(imageUrl); if (canvas) { setSourceObjectFor3D(canvas.getActiveObject() || null); } setActiveTool('3d-gen'); }}
                            />
                        </div>
                    </div>
                )}
                <JobStatusFooter jobs={backgroundJobs} onClear={(id) => setBackgroundJobs(prev => prev.filter(j => j.id !== id))} />
            </div>
        </div>
    );
}

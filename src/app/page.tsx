'use client';

import { useState, useRef, useEffect } from 'react';
import DesignCanvas from '@/components/DesignCanvas';
import Toolbar from '@/components/Toolbar';
import PropertiesPanel from '@/components/PropertiesPanel';
import ThreeDGenerator from '@/components/ThreeDGenerator';
import ThreeDLayerEditor from '@/components/ThreeDLayerEditor';
import SettingsModal from '@/components/SettingsModal';
import JobStatusFooter from '@/components/JobStatusFooter';
import LoginModal from '@/components/LoginModal';
import UserProfileModal from '@/components/UserProfileModal';
import Dashboard from '@/components/Dashboard';
import * as fabric from 'fabric';
import { Download, Share2, Sparkles, FolderKanban, Home as HomeIcon, ChevronDown, Image as ImageIcon, FileText, FileCode, Settings, Box, Cloud, User } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { BackgroundJob } from '@/types';

/**
 * Home (Main Editor)
 * Central component orchestrating the Canvas, Toolbar, and Properties Panel.
 * Handles interactive tools like Gradient Drag and Zoom.
 */
export default function Home() {
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [username, setUsername] = useState('Guest');
  
  // View State
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>('dashboard');

  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [zoom, setZoom] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Check session
    const user = localStorage.getItem('image-express-user');
    if (user) {
      setIsLoggedIn(true);
      setUsername(user);
    } else {
      setShowLoginModal(true);
    }
  }, []);

  const handleLogin = (user: string) => {
    localStorage.setItem('image-express-user', user);
    setIsLoggedIn(true);
    setUsername(user);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('image-express-user');
    setIsLoggedIn(false);
    setUsername('Guest');
    setShowProfileModal(false);
    setShowLoginModal(true);
  };
  const [initialImageFor3D, setInitialImageFor3D] = useState<string | undefined>(undefined);
  const [sourceObjectFor3D, setSourceObjectFor3D] = useState<fabric.Object | null>(null);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [editingModelUrl, setEditingModelUrl] = useState<string | null>(null);
  const [editingModelObject, setEditingModelObject] = useState<fabric.Object | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  
  // API Key State for UI Feedback
  const [apiKeys, setApiKeys] = useState<{
        meshy?: string, 
        tripo?: string, 
        stability?: string, 
        openai?: string, 
        google?: string,
        banana?: string
    }>({});

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

  // Background Job Polling
  useEffect(() => {
    // Only poll if there are pending/in-progress jobs
    const activeJobs = backgroundJobs.filter(j => j.status === 'PENDING' || j.status === 'IN_PROGRESS');
    if (activeJobs.length === 0) return;

    const checkJobStatus = async (job: BackgroundJob) => {
        // Validate inputs before fetch to prevent TypeError
        if (!job.id || !job.apiKey) return;
        
        try {
            let data: any = null;
            let status = job.status;
            let progress = job.progress || 0;
            let resultUrl = job.resultUrl;
            let thumbnailUrl = job.thumbnailUrl;

            // --- 1. Fetch Status based on Provider ---
            if (job.provider === 'tripo') {
                 // Use local proxy
                 const res = await fetch(`/api/ai/tripo/${job.id}`, {
                     headers: { 'Authorization': `Bearer ${job.apiKey}` }
                 });
                 if (!res.ok) {
                    console.error("Tripo Poll Failed:", res.status, await res.text());
                    return;
                 }
                 const json = await res.json();
                 if (json.data) {
                     const tData = json.data;
                     console.log("Tripo Poll:", tData.status, tData.progress, tData.output); 

                     // Map Tripo status to internal format
                     if (tData.status === 'success') status = 'SUCCEEDED';
                     else if (tData.status === 'failed' || tData.status === 'cancelled') status = 'FAILED';
                     else status = 'IN_PROGRESS';

                     progress = tData.progress;
                     resultUrl = tData.output?.model;
                     thumbnailUrl = tData.output?.rendered_image;
                     data = tData; // Keep raw for logging if needed
                 } else if (json.code !== undefined && json.code !== 0) {
                     console.error("Tripo Poll Error Code:", json);
                     status = 'FAILED';
                 }
            } else {
                // Default: Meshy
                const endpoint = job.type === 'image-to-3d' ? 'image-to-3d' : 'text-to-3d';
                // Using local proxy for polling
                const res = await fetch(`/api/ai/meshy?endpoint=${endpoint}/${job.id}`, {
                     headers: { 'Authorization': `Bearer ${job.apiKey}` }
                });
                
                if (!res.ok) return;

                data = await res.json();
                
                if (data.status === 'SUCCEEDED') status = 'SUCCEEDED';
                else if (data.status === 'FAILED' || data.status === 'EXPIRED') status = 'FAILED';
                else status = 'IN_PROGRESS'; // Meshy uses PENDING/IN_PROGRESS

                progress = data.progress;
                resultUrl = data.model_urls?.glb;
                thumbnailUrl = data.thumbnail_url;
            }

            if (!data) return;

            // --- 2. Handle Completion ---
            if (status === 'SUCCEEDED' || status === 'FAILED') {
                 
                 const updatedJob: BackgroundJob = {
                     ...job,
                     status: status as any,
                     resultUrl: resultUrl,
                     thumbnailUrl: thumbnailUrl,
                     progress: status === 'SUCCEEDED' ? 100 : progress
                 };
                 
                 // Update state safely
                 setBackgroundJobs(prev => prev.map(p => p.id === job.id ? updatedJob : p));

                 // If SUCCEEDED, auto-save and add to canvas
                 if (status === 'SUCCEEDED' && resultUrl) {
                      
                      // Auto-save logic
                      let filename = (job.prompt || 'generated').slice(0, 15);
                      filename = filename.replace(/[^a-z0-9]/gi, '_');
                      if (!filename.toLowerCase().endsWith('.glb')) {
                          filename += '.glb';
                      }

                      // Save to Assets
                      try {
                        await fetch('/api/assets/save-url', {
                                method: 'POST',
                                body: JSON.stringify({
                                    url: resultUrl,
                                    filename: filename,
                                    type: 'models'
                                })
                        });
                      } catch (err) {
                          console.error("Failed to auto-save asset", err);
                      }

                      // Add to Canvas (Thumbnail)
                      if (canvas && thumbnailUrl) {
                          fabric.Image.fromURL(thumbnailUrl, { crossOrigin: 'anonymous' }).then(img => {
                              img.scaleToWidth(200);
                              img.set({ left: 100, top: 100 });
                              
                              (img as any).is3DModel = true;
                              (img as any).modelUrl = resultUrl;

                              canvas.add(img);
                              canvas.setActiveObject(img);
                          });
                      }
                 }

            } else {
                 // Update Progress
                 if (progress !== job.progress || status !== job.status) {
                     setBackgroundJobs(prev => prev.map(p => p.id === job.id ? { 
                         ...p, 
                         progress: progress, 
                         status: status as any
                     } : p));
                 }
            }
        } catch (e) {
            console.error("Job poll error", e);
        }
    };

    const interval = setInterval(() => {
        activeJobs.forEach(job => checkJobStatus(job));
    }, 2000);

    return () => clearInterval(interval);
  }, [backgroundJobs, canvas]); // Dependency on canvas to allow adding result

  // Close export menu when clicking outside
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
    
    // Reset zoom for export to ensure full resolution/correct dimensions
    const originalZoom = canvas.getZoom();
    const originalWidth = canvas.width!;
    const originalHeight = canvas.height!;
    const originalViewportTransform = canvas.viewportTransform;

    // Temporarily reset zoom to 1 for export if needed, or keeping it as is.
    // Usually for high quality export, we might want multiplier.
    // For simplicity, we just use what's on screen but maybe scaled up if we want better quality.
    
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
                // Set background to white for JPG as it transparency becomes black
                const originalBg = canvas.backgroundColor;
                canvas.backgroundColor = '#ffffff';
                dataUrl = canvas.toDataURL({
                    format: 'jpeg',
                    quality: 0.9,
                    multiplier: 1,
                    enableRetinaScaling: true
                });
                downloadFile(dataUrl, filename);
                canvas.backgroundColor = originalBg; 
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
                
                // Create PDF with same dimensions
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

  // Double Click Listener for 3D Models
  useEffect(() => {
    if (!canvas) return;

    const handleDblClick = (e: any) => {
      const target = e.target;
      if (target && (target.is3DModel || target.modelUrl)) {
        setEditingModelUrl(target.modelUrl);
        setEditingModelObject(target);
      } else if (target) {
        // Switch to properties panel (select tool) for any other object
        setActiveTool('select');
      }
    };

    const handleWheel = (opt: any) => {
        const evt = opt.e;
        evt.preventDefault();
        evt.stopPropagation();
  
        const delta = evt.deltaY;
        let currentZoom = canvas.getZoom();
        let newZoom = currentZoom * (0.999 ** delta);
        
        if (newZoom > 5) newZoom = 5;
        if (newZoom < 0.1) newZoom = 0.1;

        // Consistent "Paper Resize" Zoom Logic
        const width = canvas.width!;
        const height = canvas.height!;
        const baseWidth = width / currentZoom;
        const baseHeight = height / currentZoom;

        canvas.setZoom(newZoom);
        canvas.setDimensions({
            width: baseWidth * newZoom,
            height: baseHeight * newZoom
        });
        canvas.requestRenderAll();
        
        setZoom(newZoom);
    };

    // Gradient Tool Interaction
    const handleGradientTool = () => {
        let isDown = false;
        let startPoint = { x: 0, y: 0 };
        let activeObj: fabric.Object | null | undefined = null;

        return {
            'mouse:down': (opt: any) => {
                if (activeTool !== 'gradient') return;
                
                // Allow selecting object if clicked directly on it, otherwise use currently active
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
            'mouse:move': (opt: any) => {
                if (!isDown || activeTool !== 'gradient' || !activeObj) return;
                
                const pointer = canvas.getScenePoint(opt.e);
                
                // Calculate Vector relative to Object
                // This is complex because objects can be rotated/scaled.
                // Assuming simple case for V1: Map canvas points to object bounding box percentage?
                // Or just use coords 'pixels' mode if fabric supports it robustly? 
                
                // Easier Approach:
                // Fabric Gradients use 'coords' {x1, y1, x2, y2}
                // If gradientUnits = 'percentage' (default), 0,0 is top-left, 1,1 is bottom-right.
                
                // Transform to Local Coordinates using Matrix
                const m = activeObj.calcTransformMatrix();
                const mInv = fabric.util.invertTransform(m);
                const p1Local = fabric.util.transformPoint(new fabric.Point(startPoint.x, startPoint.y), mInv);
                const p2Local = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), mInv);

                // Determine offsets based on origin (Handle Center vs Left/Top)
                const w = activeObj.width || 1; 
                const h = activeObj.height || 1;
                const ox = activeObj.originX === 'center' ? 0.5 : (activeObj.originX === 'right' ? 1 : 0);
                const oy = activeObj.originY === 'center' ? 0.5 : (activeObj.originY === 'bottom' ? 1 : 0);

                const n1 = {
                    x: (p1Local.x / w) + ox,
                    y: (p1Local.y / h) + oy
                };
                const n2 = {
                    x: (p2Local.x / w) + ox,
                    y: (p2Local.y / h) + oy
                };

                const newGradient = new fabric.Gradient({
                    type: 'linear',
                    gradientUnits: 'percentage', // Relative to object size
                    coords: {
                        x1: n1.x,
                        y1: n1.y,
                        x2: n2.x,
                        y2: n2.y
                    },
                    colorStops: [
                        { offset: 0, color: 'blue' }, // Should use current start/end color state but tricky to access from here without ref
                        { offset: 1, color: 'red' }
                    ]
                });
                
                // If the object already has a gradient, preserve colors
                const currentFill = activeObj.get('fill');
                if (currentFill && (currentFill as any).type === 'linear') {
                    // Update coords only? No, set returns new instance usually safer
                     newGradient.colorStops = (currentFill as any).colorStops;
                }

                activeObj.set('fill', newGradient);
                canvas.requestRenderAll();
            },
            'mouse:up': () => {
                isDown = false;
                activeObj = null;
            }
        };
    };

    const gradientHandlers = handleGradientTool();
    
    // Bind Events
    canvas.on('mouse:wheel', handleWheel);
    canvas.on('mouse:dblclick', handleDblClick);
    
    // We need to add/remove these dynamically or just have them check 'activeTool' inside
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
  }, [canvas, activeTool]); // Re-bind when activeTool changes to ensure closure scope is fresh? 
  // Actually if we check activeTool valid inside handler, we just need to re-bind if tool changes if we assume closure captures old state? 
  // Yes, handleGradientTool runs inside useEffect, so it captures current 'activeTool'.
  // IF 'activeTool' changes, useEffect runs again -> unbinds old -> binds new. Correct.

  // Handle Loading Template
  const handleLoadTemplate = async (templateJsonUrl: string) => {
     if (!canvas) return;
     try {
        const res = await fetch(templateJsonUrl);
        const json = await res.json();
        canvas.loadFromJSON(json, () => {
             canvas.requestRenderAll();
        });
     } catch (e) {
         console.error("Failed to load template", e);
     }
  };

  const handleZoom = (factor: number) => {
        if (!canvas) return;
        let newZoom = zoom + factor;
        // Clamp between 10% and 500%
        newZoom = Math.max(0.1, Math.min(newZoom, 5));
        
        // Calculate new dimensions based on current logical size
        // logicalSize = currentDimension / currentZoom
        const width = canvas.width!;
        const height = canvas.height!;
        const baseWidth = width / zoom;
        const baseHeight = height / zoom;

        // Apply new zoom and dimensions
        canvas.setZoom(newZoom);
        canvas.setDimensions({
            width: baseWidth * newZoom,
            height: baseHeight * newZoom
        });
        canvas.requestRenderAll();
        
        setZoom(newZoom);
    };

    return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-20 relative shadow-sm">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
               <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg flex items-center justify-center">
                 <span className="font-bold text-white text-lg">IE</span>
               </div>
               <span className="font-bold text-lg hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-pink-500">
                 Image Express
               </span>
           </div>
           <nav className="hidden md:flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
              <button 
                 onClick={() => setCurrentView('dashboard')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'dashboard' ? 'bg-background shadow-sm border border-border/50 text-foreground' : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'}`}
              >
                <HomeIcon size={16} />
                <span>Home</span>
              </button>
              <button 
                 onClick={() => setCurrentView('editor')}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${currentView === 'editor' ? 'bg-background shadow-sm border border-border/50 text-foreground' : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'}`}
              >
                <FolderKanban size={16} />
                <span>Design</span>
              </button>
           </nav>
        </div>
        
        <div className="flex items-center gap-3">
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
             
             {/* Service Status Indicators */}
             <div className="flex items-center gap-2 mr-2">
                 {/* 3D Services Status */}
                 <div 
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                        has3DKey 
                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600' 
                        : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-50'
                    }`}
                    title={has3DKey ? "3D Services Connected" : "No 3D Services Connected"}
                 >
                    <Box size={14} strokeWidth={has3DKey ? 2 : 1.5} />
                    {has3DKey && <span className="text-[10px] font-bold">3D</span>}
                 </div>

                 {/* Image Services Status */}
                 <div 
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                        has2DKey 
                        ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' 
                        : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-50'
                    }`}
                    title={has2DKey ? "Generative AI Connected" : "No Generative AI Connected"}
                 >
                    <Cloud size={14} strokeWidth={has2DKey ? 2 : 1.5} />
                     {has2DKey && <span className="text-[10px] font-bold">AI</span>}
                 </div>
             </div>

             <button
                onClick={() => {
                    if (!isConnected) {
                        setShowSettings(true);
                        return;
                    }
                    if (!is3DMode) {
                         setActiveTool(activeTool === 'ai-zone' ? 'select' : 'ai-zone');
                    }
                }}
                className={`p-2.5 rounded-full border flex items-center justify-center transition-all duration-200 ${
                    isConnected 
                    ? 'bg-gradient-to-tr from-yellow-400/20 to-orange-500/20 border-orange-500/30 text-orange-600 hover:bg-orange-500/30 hover:shadow-md cursor-pointer'
                    : 'bg-secondary/30 border-transparent text-muted-foreground/40 cursor-not-allowed group'
                }`}
                title={isConnected ? "Open Generator" : "Connect AI Services in Settings"}
             >
                <Sparkles 
                    size={18} 
                    className={`transition-all ${isConnected ? "text-orange-500 fill-orange-500/20" : "text-muted-foreground/40"}`} 
                />
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
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Format</div>
                        <button onClick={() => handleExport('png')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 transition-colors">
                            <ImageIcon size={16} className="text-blue-500"/>
                            <div className="flex flex-col">
                                <span className="font-medium">PNG</span>
                                <span className="text-[10px] text-muted-foreground">High Quality Image</span>
                            </div>
                        </button>
                        <button onClick={() => handleExport('jpg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 transition-colors">
                            <ImageIcon size={16} className="text-orange-500"/>
                             <div className="flex flex-col">
                                <span className="font-medium">JPG</span>
                                <span className="text-[10px] text-muted-foreground">For Web & Sharing</span>
                            </div>
                        </button>
                        <button onClick={() => handleExport('svg')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 transition-colors">
                            <FileCode size={16} className="text-purple-500"/>
                            <div className="flex flex-col">
                                <span className="font-medium">SVG</span>
                                <span className="text-[10px] text-muted-foreground">Vector Graphic</span>
                            </div>
                        </button>
                        <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 transition-colors">
                            <FileText size={16} className="text-red-500"/>
                            <div className="flex flex-col">
                                <span className="font-medium">PDF</span>
                                <span className="text-[10px] text-muted-foreground">Document</span>
                            </div>
                        </button>
                        <hr className="my-1 border-border/50" />
                        <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 flex items-center gap-3 transition-colors">
                            <FileCode size={16} className="text-green-500"/>
                            <div className="flex flex-col">
                                <span className="font-medium">JSON</span>
                                <span className="text-[10px] text-muted-foreground">Project File</span>
                            </div>
                        </button>
                    </div>
                )}
             </div>
             
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-400 to-cyan-300 ring-2 ring-background ml-2"></div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      <LoginModal 
        isOpen={showLoginModal} 
        onLogin={handleLogin} 
      />
      
      <UserProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)}
        username={username}
        onLogout={handleLogout}
      />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {currentView === 'dashboard' ? (
           <Dashboard 
              user={username}
              onNewDesign={() => setCurrentView('editor')}
              onSelectTemplate={(t) => {
                  setCurrentView('editor');
              }}
           />
        ) : (
        <>
        {/* Left Sidebar (Asset Rail) */}
        <aside className="w-[60px] bg-card border-r flex flex-col items-center py-4 z-10 shadow-sm gap-4">
             <Toolbar 
                canvas={canvas} 
                activeTool={activeTool} 
                setActiveTool={setActiveTool} 
                onOpen3DEditor={(url) => setEditingModelUrl(url)}
             />
        </aside>

        {/* Center Stage */}
        <main className="flex-1 bg-secondary/30 relative flex items-center justify-center overflow-hidden">
           {/* Dot Background Pattern */}
           <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
           
           <div className="relative w-full h-full shadow-2xl overflow-hidden m-8 border border-border/10 rounded-lg">
                {editingModelUrl && (
                    <ThreeDLayerEditor 
                         modelUrl={editingModelUrl}
                         existingObject={editingModelObject}
                         onClose={() => {
                             setEditingModelUrl(null);
                             setEditingModelObject(null);
                         }}
                         onSave={(dataUrl, currentModelUrl) => {
                             if (canvas) {
                                fabric.Image.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then(img => {
                                    
                                    // If updating existing, copy properties
                                    if (editingModelObject) {
                                        img.set({
                                            left: editingModelObject.left,
                                            top: editingModelObject.top,
                                            scaleX: editingModelObject.scaleX,
                                            scaleY: editingModelObject.scaleY,
                                            angle: editingModelObject.angle,
                                            originX: "center",
                                            originY: "center"
                                        });
                                        canvas.remove(editingModelObject);
                                    } else {
                                         // New 
                                         img.scaleToWidth(300);
                                         img.set({ left: 300, top: 300, originX: 'center', originY: 'center' });
                                    }
                                    
                                    // Attach metadata
                                    (img as any).is3DModel = true;
                                    (img as any).modelUrl = currentModelUrl;

                                    canvas.add(img);
                                    canvas.setActiveObject(img);
                                    canvas.requestRenderAll();
                                    
                                    setEditingModelUrl(null);
                                    setEditingModelObject(null);
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
                            
                            // Hide original if applicable
                            if (sourceObjectFor3D && canvas) {
                                sourceObjectFor3D.set('visible', false);
                                canvas.requestRenderAll();
                            }
                            // Close tool to allow background processing
                            setActiveTool('select');
                            setInitialImageFor3D(undefined);
                            setSourceObjectFor3D(null);
                        }}
                        onAddToCanvas={(dataUrl, modelUrl) => {
                            if (canvas) {
                                fabric.Image.fromURL(dataUrl).then((img) => {
                                    img.set({ left: 100, top: 100 });
                                    
                                    if (modelUrl) {
                                        (img as any).is3DModel = true;
                                        (img as any).modelUrl = modelUrl;
                                    }

                                    canvas.add(img);
                                    canvas.setActiveObject(img);
                                    
                                    // Make original invisible
                                    if (sourceObjectFor3D) {
                                        sourceObjectFor3D.set('visible', false);
                                        // Also deselect it if it was selected, but we just set active object to new 3D img
                                        canvas.requestRenderAll();
                                    }
                                    
                                    setActiveTool('select');
                                    setInitialImageFor3D(undefined);
                                    setSourceObjectFor3D(null);
                                });
                            }
                        }}
                        onClose={() => {
                            setActiveTool('select');
                            setInitialImageFor3D(undefined);
                            setSourceObjectFor3D(null);
                        }} 
                    />
                )}
                <DesignCanvas onCanvasReady={setCanvas} />
           </div>
           
           {/* Floating Action Bar */}
           <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover/90 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-border/50 z-20 transform hover:-translate-y-1 transition-transform duration-300">
               <button 
                  onClick={() => handleZoom(0.1)}
                  className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" 
                  title="Zoom In"
               >+</button>
               <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
               <button 
                  onClick={() => handleZoom(-0.1)}
                  className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" 
                  title="Zoom Out"
               >-</button>
           </div>
        </main>

        {/* Right Sidebar (Properties) */}
        <aside className="w-80 bg-card border-l flex flex-col z-10 shadow-xl overflow-hidden">
            <PropertiesPanel 
                canvas={canvas} 
                activeTool={activeTool}
                onLayerDblClick={() => setActiveTool('select')}
                onMake3D={(imageUrl) => {
                    setInitialImageFor3D(imageUrl);
                    if (canvas) {
                        setSourceObjectFor3D(canvas.getActiveObject() || null);
                    }
                    setActiveTool('3d-gen');
                }}
            />
        </aside>

        {/* Status Bar */}
        <JobStatusFooter 
            jobs={backgroundJobs} 
            onClear={(id) => setBackgroundJobs(prev => prev.filter(j => j.id !== id))} 
        />
        </>
        )}
      </div>
    </div>
  );
}

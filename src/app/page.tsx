'use client';

import { useState } from 'react';
import DesignCanvas from '@/components/DesignCanvas';
import Toolbar from '@/components/Toolbar';
import PropertiesPanel from '@/components/PropertiesPanel';
import * as fabric from 'fabric';
import { Download, Share2, Sparkles, FolderKanban, Home as HomeIcon } from 'lucide-react';

export default function Home() {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [zoom, setZoom] = useState(1);

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
           <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg flex items-center justify-center">
             <span className="font-bold text-white text-lg">Cf</span>
           </div>
           <nav className="hidden md:flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-background/80 transition-all text-sm font-medium text-muted-foreground hover:text-foreground">
                <HomeIcon size={16} />
                <span>Home</span>
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-foreground bg-background shadow-sm border border-border/50">
                <FolderKanban size={16} />
                <span>Design</span>
              </button>
           </nav>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="px-4 py-1.5 bg-secondary/30 rounded-full border border-border/50 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 cursor-pointer transition-colors">
                <Sparkles size={14} className="text-yellow-500" />
                <span>Generate</span>
             </div>
             <div className="h-6 w-px bg-border mx-1"></div>
             <button className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <Share2 size={20} />
             </button>
             <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20 transition-all transform hover:scale-105 active:scale-95">
                <Download size={16} />
                <span>Export</span>
             </button>
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-400 to-cyan-300 ring-2 ring-background ml-2"></div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Asset Rail) */}
        <aside className="w-[72px] bg-card border-r flex flex-col items-center py-4 z-10 shadow-sm gap-4">
             <Toolbar 
                canvas={canvas} 
                activeTool={activeTool} 
                setActiveTool={setActiveTool} 
             />
        </aside>

        {/* Center Stage */}
        <main className="flex-1 bg-secondary/30 relative flex items-center justify-center overflow-hidden">
           {/* Dot Background Pattern */}
           <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#888 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
           
           <div className="relative w-full h-full shadow-2xl overflow-hidden m-8 border border-border/10 rounded-lg">
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
        <aside className="w-80 bg-card border-l flex flex-col z-10 shadow-xl overflow-y-auto">
            <PropertiesPanel 
                canvas={canvas} 
                activeTool={activeTool}
            />
        </aside>
      </div>
    </div>
  );
}

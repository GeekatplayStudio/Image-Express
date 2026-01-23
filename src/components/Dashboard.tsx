import React, { useEffect, useState } from 'react';
import { Plus, File, Image as ImageIcon, MoreVertical, Clock, Layout, Trash2 } from 'lucide-react';

interface DashboardProps {
  onNewDesign: () => void;
  onSelectTemplate: (template: any) => void;
  onOpenDesign: (design: any) => void;
  user: string;
}

const MOCK_TEMPLATES = [
  {
    id: 't1',
    name: 'Social Media Post',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&q=80',
    width: 1080,
    height: 1080,
    type: 'Instagram',
    jsonUrl: '/assets/templates/test2-1769108044838.json' 
  },
  {
    id: 't2',
    name: 'Website Banner',
    thumbnail: 'https://images.unsplash.com/photo-1557838923-2985c318be48?w=400&q=80',
    width: 1920,
    height: 600,
    type: 'Web',
    jsonUrl: '/assets/templates/vlad-cowboy-1769103769516.json'
  },
  {
    id: 't3',
    name: 'Product Showcase',
    thumbnail: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80',
    width: 1200,
    height: 1200,
    type: 'E-commerce',
    jsonUrl: '/assets/templates/test2-1769108044838.json'
  }
];

export default function Dashboard({ onNewDesign, onSelectTemplate, onOpenDesign, user }: DashboardProps) {
  const [recentDesigns, setRecentDesigns] = useState<any[]>([]);

  useEffect(() => {
      // Load designs from server
      const loadDesigns = async () => {
          try {
              const res = await fetch('/api/designs/list');
              const data = await res.json();
              if (data.success) {
                  setRecentDesigns(data.designs);
              }
          } catch (e) {
              console.error("Failed to load designs", e);
          }
      };
      loadDesigns();
  }, []);
  
  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm('Delete this design?')) {
          try {
              const res = await fetch('/api/designs/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id })
              });
              const result = await res.json();
              if (result.success) {
                  const updated = recentDesigns.filter(d => d.id !== id);
                  setRecentDesigns(updated);
              } else {
                  alert("Failed to delete design");
              }
          } catch (err) {
              console.error("Delete failed", err);
              alert("Error deleting design");
          }
      }
  };

  return (
    <div className="flex-1 bg-secondary/10 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row items-center gap-8 bg-card/50 p-8 rounded-2xl border border-border/50 shadow-sm">
          <div className="relative shrink-0">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden ring-4 ring-background shadow-xl">
               <img 
                 src="https://github.com/GeekatplayStudio.png" 
                 alt="GeekatplayStudio" 
                 className="w-full h-full object-cover"
               />
            </div>
            <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-background rounded-full"></div>
          </div>

          <div className="flex-1 text-center md:text-left space-y-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">Image Express</span></h1>
              <div className="text-muted-foreground text-lg mt-1">
                Open source project by <span className="font-semibold text-foreground">V Chopine</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
               <a href="https://github.com/GeekatplayStudio" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-foreground"></span> GitHub Repo
               </a>
               <a href="https://www.linkedin.com/in/geekatplay/" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#0077b5]/10 text-[#0077b5] hover:bg-[#0077b5]/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  LinkedIn: Geekatplay
               </a>
               <a href="https://www.youtube.com/@geekatplay" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  YouTube: @geekatplay
               </a>
               <a href="https://www.youtube.com/@geekatplay-ru" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  YouTube: @geekatplay-ru
               </a>
               <a href="https://www.geekatplay.com" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  Website: Geekatplay.com
               </a>
               <a href="https://www.chopinephotography.com" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 rounded-full text-sm font-medium transition-colors flex items-center gap-2">
                  Website: ChopinePhotography.com
               </a>
            </div>
          </div>

          <button 
            onClick={onNewDesign}
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-3 transition-all shadow-xl shadow-primary/20 hover:scale-105 hover:-translate-y-1"
          >
            <Plus size={24} strokeWidth={3} />
            Start Creating
          </button>
        </div>

        {/* Start Fresh / Templates */}
        <section>
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-xl font-semibold flex items-center gap-2">
               <Layout size={20} className="text-indigo-500" />
               Start with a Template
             </h2>
             <button className="text-sm text-primary hover:underline">View all templates</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {/* Blank Canvas Card */}
             <div 
                onClick={onNewDesign}
                className="group relative aspect-[4/3] bg-card rounded-xl border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 hover:bg-secondary/30"
             >
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                   <Plus size={24} />
                </div>
                <span className="font-medium text-muted-foreground group-hover:text-foreground">Blank Canvas</span>
             </div>

             {/* Template Cards */}
             {MOCK_TEMPLATES.map(template => (
                <div 
                   key={template.id}
                   onClick={() => onSelectTemplate(template)}
                   className="group relative aspect-[4/3] bg-card rounded-xl border border-border overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/20"
                >
                   <div className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-105" style={{ backgroundImage: `url(${template.thumbnail})` }} />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                   
                   <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-medium truncate">{template.name}</h3>
                      <p className="text-white/70 text-xs mt-1">{template.width} x {template.height} px</p>
                   </div>
                   
                   <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-black/50 backdrop-blur-md text-white/90 text-[10px] px-2 py-1 rounded-full border border-white/10 uppercase tracking-wide">
                        {template.type}
                      </span>
                   </div>
                </div>
             ))}
          </div>
        </section>

        {/* Recent Designs */}
        <section>
           <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
             <Clock size={20} className="text-purple-500" />
             Recent Designs
           </h2>
           
           {recentDesigns.length === 0 ? (
               <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                   <p>No saved designs yet. Create one to get started!</p>
               </div>
           ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {recentDesigns.map(design => (
                 <div 
                    key={design.id} 
                    onClick={() => onOpenDesign(design)}
                    className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow group cursor-pointer relative"
                 >
                    <div className="aspect-[16/9] bg-secondary/50 flex items-center justify-center relative bg-checkerboard">
                         {/* Generate a preview if we had one, for now placeholder */}
                         {/* fabric.js can export dataURL but storing it in localStorage might be heavy. */}
                         {/* design.thumbnail could be stored if we updated handleSave to export small jpg */}
                        {design.thumbnail ? (
                            <img src={design.thumbnail} className="w-full h-full object-contain" alt={design.name}/>
                        ) : (
                            <ImageIcon className="text-muted-foreground/30 w-12 h-12" />
                        )}
                        
                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                           <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDesign(design);
                                }}
                                className="bg-white text-black px-4 py-1.5 rounded-md text-sm font-medium hover:bg-white/90 shadow-lg"
                           >
                              Open
                           </button>
                        </div>
                    </div>
                    <div className="p-3 flex items-start justify-between">
                       <div>
                          <h3 className="font-medium text-sm text-foreground truncate max-w-[150px]">{design.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                              {new Date(design.lastModified).toLocaleDateString()}
                          </p>
                       </div>
                       <button 
                            onClick={(e) => handleDelete(design.id, e)}
                            className="text-muted-foreground hover:text-destructive p-1.5 rounded hover:bg-destructive/10 transition-colors"
                            title="Delete"
                        >
                          <Trash2 size={16} />
                       </button>
                    </div>
                 </div>
              ))}
           </div>
           )}
        </section>

      </div>
    </div>
  );
}

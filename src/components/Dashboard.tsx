import React, { useEffect, useState } from 'react';
import { Plus, File, Image as ImageIcon, MoreVertical, Clock, Layout, Trash2, ChevronDown, ChevronUp, Search, Instagram, Youtube, Book, Monitor, Heart, Upload, Sparkles, Box, Wand2 } from 'lucide-react';

interface DashboardProps {
  onNewDesign: () => void;
  onSelectTemplate: (template: any) => void;
  onOpenDesign: (design: any) => void;
  user: string;
}

const START_ACTIONS = [
    {
        id: 'start-custom',
        label: 'Custom Size',
        icon: Plus,
        color: 'bg-gradient-to-br from-yellow-400 to-orange-500',
        textColor: 'text-yellow-950',
        action: 'new'
    },
    {
        id: 'start-upload',
        label: 'Upload Media',
        icon: Upload,
        color: 'bg-gradient-to-br from-blue-400 to-indigo-500',
         textColor: 'text-blue-50',
        action: 'upload'
    },
    {
        id: 'start-ai-3d',
        label: 'Create 3D',
        icon: Box,
        color: 'bg-gradient-to-br from-emerald-400 to-teal-500',
         textColor: 'text-emerald-50',
        action: '3d'
    },
    {
        id: 'start-ai-img',
        label: 'Generate Image',
        icon: Sparkles,
        color: 'bg-gradient-to-br from-pink-500 to-rose-600',
         textColor: 'text-pink-50',
        action: 'ai'
    }
];

const POPULAR_TEMPLATES = [
  {
    id: 't-insta',
    name: 'Instagram Post',
    width: 1080,
    height: 1080,
    type: 'Social Media',
    icon: Instagram,
    color: 'from-pink-500 to-orange-500',
    // jsonUrl: null // No JSON, start blank
  },
  {
    id: 't-yt',
    name: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    type: 'Video',
    icon: Youtube,
    color: 'from-red-600 to-red-400',
  },
  {
    id: 't-book',
    name: 'Book Cover',
    width: 1600,
    height: 2560,
    type: 'Print',
    icon: Book,
    color: 'from-blue-600 to-indigo-600',
  },
  {
    id: 't-banner',
    name: 'Website Hero',
    width: 1920,
    height: 600,
    type: 'Web',
    icon: Monitor,
    color: 'from-emerald-500 to-teal-500',
  }
];

// Expanded mock data for when user clicks "Show More"
const MORE_TEMPLATES = [
    ...POPULAR_TEMPLATES.map(t => ({...t, id: t.id + '_2', name: t.name + ' II'})),
    ...POPULAR_TEMPLATES.map(t => ({...t, id: t.id + '_3', name: t.name + ' III'})),
];

export default function Dashboard({ onNewDesign, onSelectTemplate, onOpenDesign, user }: DashboardProps) {
  const [recentDesigns, setRecentDesigns] = useState<any[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [showAllDesigns, setShowAllDesigns] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
      // Load designs from server
      const loadDesigns = async () => {
          try {
              const res = await fetch('/api/designs/list');
              const data = await res.json();
              if (data.success) {
                  // Sort by newest first
                  const sorted = data.designs.sort((a: any, b: any) => 
                      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
                  );
                  setRecentDesigns(sorted);
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

  const visibleDesigns = showAllDesigns ? recentDesigns : recentDesigns.slice(0, 4);

  return (
    <div className="flex-1 bg-background p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Modern Hero & Search */}
        <div className="relative py-12 text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground">
                What will you <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">create</span> today?
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Select a template below to get started, or create a custom size.
            </p>
            
            <div className="max-w-xl mx-auto relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <input 
                    type="text"
                    placeholder="Search templates (Instagram, Resume, Poster...)"
                    className="w-full h-12 pl-12 pr-4 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none"
                    disabled
                />
                <div className="absolute right-2 top-2 bottom-2">
                    <button 
                        onClick={onNewDesign}
                        className="h-full px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Custom Size
                    </button>
                </div>
            </div>
        </div>

        {/* Start Creating Section (Adobe Style) */}
        <section>
             <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-xl font-bold text-foreground">How would you like to start?</h2>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 {START_ACTIONS.map((action) => (
                     <button
                        key={action.id}
                        onClick={() => {
                            if (action.action === 'new') onNewDesign();
                            else if (action.action === 'ai') onNewDesign(); // Temporary map to new
                            else if (action.action === '3d') onNewDesign(); // Temporary
                            else alert("Upload feature coming to dashboard soon!");
                        }}
                        className={`group relative h-32 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left p-0 ${action.color}`}
                     >
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors" />
                        <div className="absolute top-4 left-4">
                             <div className={`p-2 rounded-full bg-white/20 backdrop-blur-md ${action.textColor}`}>
                                 <action.icon size={24} />
                             </div>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                            <h3 className={`font-bold text-lg ${action.textColor}`}>{action.label}</h3>
                        </div>
                        {/* Decorative Icon Background */}
                        <div className="absolute -bottom-4 -right-4 opacity-20 transform rotate-12 scale-150 pointer-events-none text-white">
                             <action.icon size={100} />
                        </div>
                     </button>
                 ))}
             </div>
        </section>

        {/* Categories Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All', 'Social Media', 'Video', 'Print', 'Web', 'Marketing'].map(cat => (
                <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                        activeCategory === cat 
                        ? 'bg-foreground text-background border-foreground' 
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/50'
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>

        {/* Popular Templates Row */}
        <section className="space-y-4">
             <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Layout size={20} className="text-indigo-500" />
                    Popular Templates
                </h2>
             </div>
             
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
                {POPULAR_TEMPLATES.map((template) => (
                    <div 
                        key={template.id}
                        onClick={() => onSelectTemplate(template)}
                        className="group relative aspect-[3/4] md:aspect-square bg-card rounded-2xl border border-border/50 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                    >
                        {/* Abstract Background */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                            <div className={`p-4 rounded-full bg-gradient-to-br ${template.color} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                                <template.icon size={32} />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{template.name}</h3>
                                <p className="text-xs text-muted-foreground mt-1">{template.width} x {template.height} px</p>
                            </div>
                        </div>
                    </div>
                ))}
                
                {/* Expanded Content */}
                {showAllTemplates && MORE_TEMPLATES.map((template) => (
                     <div 
                        key={template.id}
                        onClick={() => onSelectTemplate(template)}
                        className="group relative aspect-[3/4] md:aspect-square bg-card rounded-2xl border border-border/50 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-in fade-in slide-in-from-top-4"
                    >
                        <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                             <div className={`p-3 rounded-full bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors`}>
                                <template.icon size={24} />
                            </div>
                            <div>
                                <h3 className="font-medium text-sm">{template.name}</h3>
                                <p className="text-[10px] text-muted-foreground">{template.width} x {template.height}</p>
                            </div>
                        </div>
                    </div>
                ))}
             </div>

             {/* Divider / Expander */}
             <div className="relative py-4 flex items-center justify-center">
                 <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                 </div>
                 <button 
                    onClick={() => setShowAllTemplates(!showAllTemplates)}
                    className="relative bg-background border border-border rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2 shadow-sm"
                 >
                    {showAllTemplates ? (
                        <>Show Less <ChevronUp size={14} /></>
                    ) : (
                        <>View All Templates <ChevronDown size={14} /></>
                    )}
                 </button>
             </div>
        </section>

        {/* Recent Designs Row */}
        <section className="space-y-4">
           <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Clock size={20} className="text-purple-500" />
                    Your Projects
                </h2>
                <div className="text-sm text-muted-foreground">{recentDesigns.length} saved</div>
           </div>
           
           {recentDesigns.length === 0 ? (
               <div className="text-center py-20 bg-secondary/20 rounded-2xl border border-dashed border-border text-muted-foreground flex flex-col items-center gap-4">
                   <div className="p-4 bg-background rounded-full shadow-sm">
                        <Plus size={32} className="text-primary/50" />
                   </div>
                   <div>
                       <p className="font-medium">No saved designs yet.</p>
                       <p className="text-sm mt-1">Start a new project to see it here.</p>
                   </div>
               </div>
           ) : (
           <>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Create New Card (Always First in List? Or separate?) - Let's keep it separate in hero */}
                  
                  {visibleDesigns.map(design => (
                     <div 
                        key={design.id} 
                        onClick={() => onOpenDesign(design)}
                        className="group bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer relative flex flex-col"
                     >
                        <div className="aspect-video bg-secondary/50 flex items-center justify-center relative bg-checkerboard overflow-hidden">
                            {design.thumbnail ? (
                                <img src={design.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={design.name}/>
                            ) : (
                                <ImageIcon className="text-muted-foreground/30 w-12 h-12" />
                            )}
                            
                            {/* Overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="bg-white text-black px-4 py-2 rounded-full font-semibold text-sm transform translate-y-2 group-hover:translate-y-0 transition-transform">
                                    Edit Project
                                </span>
                            </div>
                        </div>
                        
                        <div className="p-4 flex items-center justify-between bg-card flex-1">
                           <div className="min-w-0">
                              <h3 className="font-semibold text-sm text-foreground truncate" title={design.name}>{design.name}</h3>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  edited {new Date(design.lastModified).toLocaleDateString()}
                              </p>
                           </div>
                           <button 
                                onClick={(e) => handleDelete(design.id, e)}
                                className="text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete Project"
                            >
                              <Trash2 size={16} />
                           </button>
                        </div>
                     </div>
                  ))}
               </div>

                {/* Show More Designs Divider */}
                {recentDesigns.length > 4 && (
                    <div className="relative py-4 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border"></div>
                        </div>
                        <button 
                            onClick={() => setShowAllDesigns(!showAllDesigns)}
                            className="relative bg-background border border-border rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2 shadow-sm"
                        >
                            {showAllDesigns ? (
                                <>Show Less <ChevronUp size={14} /></>
                            ) : (
                                <>Show All Designs ({recentDesigns.length}) <ChevronDown size={14} /></>
                            )}
                        </button>
                    </div>
                )}
           </>
           )}
        </section>

        {/* Footer Info Section */}
        <section className="border-t border-border pt-8 mt-12 mb-8">
            <div className="flex flex-col md:flex-row items-center gap-8 bg-card/30 p-8 rounded-2xl border border-border/50">
              <div className="relative shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-4 ring-background shadow-lg">
                   <img 
                     src="https://github.com/GeekatplayStudio.png" 
                     alt="GeekatplayStudio" 
                     className="w-full h-full object-cover"
                   />
                </div>
                <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-4 border-background rounded-full"></div>
              </div>

              <div className="flex-1 text-center md:text-left space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight">Image Express</h2>
                  <div className="text-muted-foreground mt-1">
                    Open source project by <span className="font-semibold text-foreground">V Chopine</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                   <a href="https://github.com/GeekatplayStudio" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-full text-xs font-medium transition-colors flex items-center gap-2">
                     GitHub
                   </a>
                   <a href="https://www.linkedin.com/in/geekatplay/" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#0077b5]/10 text-[#0077b5] hover:bg-[#0077b5]/20 rounded-full text-xs font-medium transition-colors flex items-center gap-2">
                     LinkedIn
                   </a>
                   <a href="https://www.youtube.com/@geekatplay" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/20 rounded-full text-xs font-medium transition-colors flex items-center gap-2">
                     YouTube
                   </a>
                   <a href="https://www.geekatplay.com" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 rounded-full text-xs font-medium transition-colors flex items-center gap-2">
                      Geekatplay.com
                   </a>
                   <a href="https://www.chopinephotography.com" target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 rounded-full text-xs font-medium transition-colors flex items-center gap-2">
                      ChopinePhotography.com
                   </a>
                   
                   <div className="w-px h-6 bg-border mx-2 hidden md:block"></div>

                   <a href="https://geekatplay.gumroad.com/coffee" target="_blank" rel="noreferrer" className="group px-4 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white rounded-full text-xs font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2 transform hover:-translate-y-0.5">
                      <Heart size={14} className="group-hover:animate-bounce" fill="currentColor" />
                      Support my work
                   </a>
                </div>
              </div>
            </div>
        </section>

      </div>
    </div>
  );
}

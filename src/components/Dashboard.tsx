import React from 'react';
import { Plus, File, Image as ImageIcon, MoreVertical, Clock, Layout } from 'lucide-react';

interface DashboardProps {
  onNewDesign: () => void;
  onSelectTemplate: (template: any) => void;
  user: string;
}

const MOCK_TEMPLATES = [
  {
    id: 't1',
    name: 'Social Media Post',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&q=80',
    width: 1080,
    height: 1080,
    type: 'Instagram'
  },
  {
    id: 't2',
    name: 'Website Banner',
    thumbnail: 'https://images.unsplash.com/photo-1557838923-2985c318be48?w=400&q=80',
    width: 1920,
    height: 600,
    type: 'Web'
  },
  {
    id: 't3',
    name: 'Product Showcase',
    thumbnail: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80',
    width: 1200,
    height: 1200,
    type: 'E-commerce'
  }
];

const RECENT_DESIGNS = [
  {
    id: 'd1',
    name: 'Summer Campaign',
    lastModified: '2 hours ago',
    thumbnail: null // Placeholder
  },
  {
    id: 'd2',
    name: 'Logo Draft v2',
    lastModified: '1 day ago',
    thumbnail: null
  }
];

export default function Dashboard({ onNewDesign, onSelectTemplate, user }: DashboardProps) {
  return (
    <div className="flex-1 bg-secondary/10 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Welcome Section */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Welcome back, {user}</h1>
            <p className="text-muted-foreground mt-2">Ready to create something amazing today?</p>
          </div>
          <button 
            onClick={onNewDesign}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} />
            Create New Design
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
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {RECENT_DESIGNS.map(design => (
                 <div key={design.id} className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
                    <div className="aspect-[16/9] bg-secondary/50 flex items-center justify-center relative">
                        <ImageIcon className="text-muted-foreground/30 w-12 h-12" />
                        
                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                           <button className="bg-white text-black px-4 py-1.5 rounded-md text-sm font-medium hover:bg-white/90">
                              Edit
                           </button>
                        </div>
                    </div>
                    <div className="p-3 flex items-start justify-between">
                       <div>
                          <h3 className="font-medium text-sm text-foreground">{design.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">Edited {design.lastModified}</p>
                       </div>
                       <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary">
                          <MoreVertical size={16} />
                       </button>
                    </div>
                 </div>
              ))}
           </div>
        </section>

      </div>
    </div>
  );
}

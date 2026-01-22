'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Box, Trash2, CheckCircle, Loader2, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Asset {
    name: string;
    path: string;
    type: 'images' | 'models';
}

interface AssetLibraryProps {
    onSelect: (path: string, type: 'images' | 'models') => void;
    onClose: () => void;
}

export default function AssetLibrary({ onSelect, onClose }: AssetLibraryProps) {
    const [activeTab, setActiveTab] = useState<'images' | 'models'>('images');
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [saveToServer, setSaveToServer] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch assets
    const fetchAssets = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/assets/list?type=${activeTab}`);
            const data = await res.json();
            if (data.success) {
                setAssets(data.files);
            }
        } catch (error) {
            console.error("Failed to load assets", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAssets();
    }, [activeTab]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // If user DOES NOT want to save to server, just use local FileReader and pass to onSelect
        if (!saveToServer) {
            const reader = new FileReader();
            reader.onload = (f) => {
                const data = f.target?.result as string;
                // For models (glb), this simple reader might be just string, but fabric usually needs URL
                // Actually for images dataURL is fine.
                // For 'models', dataURL might be large.
                onSelect(data, activeTab);
                onClose();
            };
            reader.readAsDataURL(file);
            return;
        }

        // Upload to Server
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', activeTab);

        try {
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                // Refresh list
                await fetchAssets();
                // Optional: Auto-select? Or just stay in library
            } else {
                alert('Upload failed: ' + data.message);
            }
        } catch (error) {
            console.error(error);
            alert('Upload error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="absolute left-[80px] top-[160px] bg-card border border-border rounded-lg shadow-xl w-80 h-[500px] flex flex-col z-50 animate-in fade-in slide-in-from-left-4 duration-200">
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/10 rounded-t-lg">
                <h3 className="font-semibold text-sm">Asset Library</h3>
                <div className="flex items-center gap-1">
                     <button 
                        onClick={() => fetchAssets()}
                        className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh"
                     >
                        <RotateCw size={14} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground">✕</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 border-b border-border/50">
                <button 
                    onClick={() => setActiveTab('images')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === 'images' ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                    )}
                >
                    <ImageIcon size={14} /> Images
                </button>
                <button 
                    onClick={() => setActiveTab('models')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === 'models' ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                    )}
                >
                    <Box size={14} /> 3D Models
                </button>
            </div>

            {/* Upload Area */}
            <div className="p-3 border-b border-border/50 space-y-3 bg-secondary/5">
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="saveToServer" 
                        checked={saveToServer} 
                        onChange={(e) => setSaveToServer(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    <label htmlFor="saveToServer" className="text-xs text-muted-foreground cursor-pointer select-none">
                        Save to Workspace Assets
                    </label>
                </div>
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept={activeTab === 'images' ? "image/*" : ".glb,.gltf"}
                    onChange={handleUpload}
                />
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {isUploading ? 'Uploading...' : `Upload New ${activeTab === 'images' ? 'Image' : 'Model'}`}
                </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                        <Loader2 className="animate-spin" size={20} />
                    </div>
                ) : assets.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                        No assets found. Upload one to get started.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {assets.map((asset) => (
                            <button
                                key={asset.path}
                                onClick={() => {
                                    onSelect(asset.path, asset.type);
                                    // Optionally close or keep open for multiple additions
                                }}
                                className="group relative aspect-square bg-secondary/30 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-all"
                                title={asset.name}
                            >
                                {asset.type === 'images' ? (
                                    <div className="w-full h-full relative">
                                        <img 
                                            src={asset.path} 
                                            alt={asset.name} 
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                        <Box size={24} className="mb-1" />
                                        <span className="text-[8px] px-1 truncate w-full text-center">{asset.name.split('-')[0]}</span>
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium text-[10px]">
                                    Add
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

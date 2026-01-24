'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Box, Trash2, CheckCircle, Loader2, RotateCw, Pen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Asset3DPreview from './Asset3DPreview';

/**
 * Asset Interface represents a file stored in the system.
 */
interface Asset {
    name: string;
    path: string;
    type: 'images' | 'models';
    category?: 'uploads' | 'generated';
}

interface AssetLibraryProps {
    /** Callback when user selects an asset to add to canvas */
    onSelect: (path: string, type: 'images' | 'models') => void;
    /** Callback to close the library window */
    onClose: () => void;
}

/**
 * AssetLibrary Component
 * 
 * Displays a gallery of assets (Images, 3D Models, Generated Content).
 * Allows users to Upload, Delete, Rename, and Select assets.
 * 
 * Assets are organized into three tabs:
 * 1. Uploads: User uploaded images (public/assets/uploads/images)
 * 2. 3D: User uploaded 3D models (public/assets/uploads/models)
 * 3. Generated: AI generated images (public/assets/generated/images)
 */
export default function AssetLibrary({ onSelect, onClose }: AssetLibraryProps) {
    // Current active view tab
    const [activeTab, setActiveTab] = useState<'uploads' | 'models' | 'generated'>('uploads');
    
    // List of assets currently displayed
    const [assets, setAssets] = useState<Asset[]>([]);
    
    // UI Loading States
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    
    // Toggle for saving uploads to server persistent storage
    const [saveToServer, setSaveToServer] = useState(true);
    
    // State for renaming assets inline
    const [editingAsset, setEditingAsset] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    
    // Preview popup state
    const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Fetches the list of assets from the server based on the active tab.
     */
    const fetchAssets = async () => {
        setIsLoading(true);
        try {
            // Map UI tabs to API query parameters
            let type = 'images';
            let category = 'uploads';
            
            if (activeTab === 'models') {
                type = 'models';
                category = 'uploads';
            } else if (activeTab === 'generated') {
                type = 'images';
                category = 'generated';
            }

            const res = await fetch(`/api/assets/list?type=${type}&category=${category}`);
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

    // Re-fetch when tab changes
    useEffect(() => {
        fetchAssets();
    }, [activeTab]);

    /**
     * Handles file selection from system dialog.
     * Uploads the file to the appropriate category folder.
     */
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Mode: Local Only (No Server Upload)
        // Useful for quick testing without cluttering the library
        if (!saveToServer) {
            const reader = new FileReader();
            reader.onload = (f) => {
                const data = f.target?.result as string;
                // For models (glb), this simple reader might be just string, but fabric usually needs URL
                // Actually for images dataURL is fine.
                // For 'models', dataURL might be large.
                onSelect(data, activeTab === 'models' ? 'models' : 'images');
                onClose();
            };
            reader.readAsDataURL(file);
            return;
        }

        // Mode: Server Upload
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        // Map current UI context to backend storage location
        if (activeTab === 'generated') {
            formData.append('type', 'images');
            formData.append('category', 'generated');
        } else if (activeTab === 'models') {
             formData.append('type', 'models');
             formData.append('category', 'uploads');
        } else {
             // Default: 'uploads' tab
             formData.append('type', 'images');
             formData.append('category', 'uploads');
        }

        try {
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.success) {
                // Refresh list to show new asset
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

    /**
     * Handles renaming an existing asset.
     * @param oldName The current filename
     */
    const handleRename = async (oldName: string) => {
        // Validation: Ignore empty or unchanged names
        if (!editName.trim() || editName === oldName) {
            setEditingAsset(null);
            return;
        }

        try {
            // Determine API parameters based on active tab
            let typeParam = 'images';
            let categoryParam = 'uploads';
            
            if (activeTab === 'models') {
                typeParam = 'models';
            } else if (activeTab === 'generated') {
                 categoryParam = 'generated';
            }

            const res = await fetch('/api/assets/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: typeParam,
                    category: categoryParam,
                    oldName: oldName,
                    newName: editName.trim()
                })
            });
            const data = await res.json();
            
            if (data.success) {
                await fetchAssets();
            } else {
                alert('Rename failed: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Rename error:', error);
            alert('Rename failed');
        } finally {
            setEditingAsset(null);
        }
    };

    /**
     * Handles deletion of an asset.
     * @param path The relative path to the asset
     * @param e Event to stop propagation
     */
    const deleteAsset = async (path: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selection when clicking delete
        if (!confirm('Are you sure you want to delete this asset?')) return;

        try {
            const res = await fetch('/api/assets/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: path }),
            });

            const data = await res.json();
            if (data.success || res.ok) {
                await fetchAssets();
            } else {
                alert('Delete failed: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting asset:', error);
            alert('Delete failed');
        }
    };

    return (
        <div className="fixed left-[80px] top-[140px] bg-card border border-border rounded-lg shadow-2xl w-80 h-[calc(100vh-200px)] max-h-[600px] flex flex-col z-[100] animate-in fade-in slide-in-from-left-4 duration-200">
            {/* Header Section */}
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

            {/* Navigation Tabs */}
            <div className="flex p-2 gap-1 border-b border-border/50">
                <button 
                    onClick={() => setActiveTab('uploads')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === 'uploads' ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                    )}
                >
                    <Upload size={14} /> Uploads
                </button>
                <button 
                    onClick={() => setActiveTab('models')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === 'models' ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                    )}
                >
                    <Box size={14} /> 3D
                </button>
                <button 
                    onClick={() => setActiveTab('generated')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                        activeTab === 'generated' ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                    )}
                >
                    <ImageIcon size={14} /> Generated
                </button>
            </div>

            {/* Upload Controls */}
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
                    // Determine accepted file types based on active tab
                    accept={activeTab === 'models' ? ".glb,.gltf" : "image/*"}
                    onChange={handleUpload}
                />
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {isUploading ? 'Uploading...' : `Upload New ${activeTab === 'models' ? 'Model' : 'Image'}`}
                </button>
            </div>

            {/* Asset Grid Display */}
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
                        {assets.map((asset, index) => (
                            <div
                                key={asset.path + index}
                                className="group relative aspect-square bg-secondary/30 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-all cursor-pointer"
                                title={asset.name}
                                onMouseEnter={() => asset.type === 'models' && setHoveredAsset(asset.path)}
                                onMouseLeave={() => setHoveredAsset(null)}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setEditingAsset(asset.name);
                                    setEditName(asset.name);
                                }}
                            >
                                {editingAsset === asset.name ? (
                                    /* Rename Mode Overlay */
                                    <div className="absolute inset-0 z-30 bg-background/95 flex flex-col items-center justify-center p-1" onClick={(e) => e.stopPropagation()}>
                                        <div className="w-full flex items-center justify-center gap-1 mb-1">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(asset.name);
                                                    if (e.key === 'Escape') setEditingAsset(null);
                                                }}
                                                className="w-full text-xs p-1 border border-primary rounded bg-background text-foreground text-center focus:outline-none h-6"
                                            />
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => handleRename(asset.name)}
                                                className="p-1 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded"
                                                title="Save"
                                            >
                                                <CheckCircle size={12} />
                                            </button>
                                            <button 
                                                onClick={() => setEditingAsset(null)}
                                                className="p-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded"
                                                title="Cancel"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div 
                                            className="w-full h-full" 
                                            onClick={() => {
                                                if (editingAsset !== asset.name) {
                                                    onSelect(asset.path, asset.type);
                                                    onClose();
                                                }
                                            }}
                                        >
                                            {asset.type === 'images' ? (
                                                <div className="w-full h-full relative">
                                                    <img 
                                                        src={asset.path} 
                                                        alt={asset.name} 
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                    {/* Small Label for Images */}
                                                    <div className="absolute bottom-0 w-full bg-black/60 text-white text-[9px] truncate px-1 py-0.5 text-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                        {asset.name}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                                    <Box size={24} className="mb-1" />
                                                    <span className="text-[8px] px-1 truncate w-full text-center">{asset.name.split('-')[0]}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Hover Overlay Actions (Rename / Delete) */}
                                        <div className="absolute inset-x-0 top-0 p-1 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setEditingAsset(asset.name);
                                                    setEditName(asset.name);
                                                }}
                                                className="pointer-events-auto p-1.5 bg-background/80 hover:bg-background text-foreground rounded-md shadow-sm transition-colors border border-border/50"
                                                title="Rename Asset"
                                            >
                                                <Pen size={10} />
                                            </button>

                                            <button
                                                onClick={(e) => deleteAsset(asset.path, e)}
                                                className="pointer-events-auto p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-md shadow-sm transition-colors border border-red-600/50"
                                                title="Delete Asset"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {/* 3D Preview Portal - Fixed to the right of the library */}
            {hoveredAsset && activeTab === 'models' && (
                <div className="fixed left-[410px] top-[140px] w-64 h-64 z-[110] animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                    <Asset3DPreview url={hoveredAsset} />
                </div>
            )}
        </div>
    );
}

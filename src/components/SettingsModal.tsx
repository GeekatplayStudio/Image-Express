'use client';

import { useState, useEffect } from 'react';
import { X, Save, Key, ShieldCheck, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const STORAGE_KEYS = {
    MESHY_API_KEY: 'image-express-meshy-key',
    TRIPO_API_KEY: 'image-express-tripo-key',
    HITEMS_API_KEY: 'image-express-hitems-key',
};

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [meshyKey, setMeshyKey] = useState('');
    const [tripoKey, setTripoKey] = useState('');
    const [hitemsKey, setHitemsKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'saved'>('idle');

    // Load keys on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setMeshyKey(localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || '');
            setTripoKey(localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '');
            setHitemsKey(localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '');
        }
    }, [isOpen]);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEYS.MESHY_API_KEY, meshyKey);
        localStorage.setItem(STORAGE_KEYS.TRIPO_API_KEY, tripoKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, hitemsKey);
        
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
    };

    // Helper to mask key for display if it comes from env (not implemented here per se, but good for UX)
    // Here we just input what is in local storage.

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">API Configurations</h2>
                        <p className="text-xs text-muted-foreground">Manage your keys for external AI services</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Meshy AI */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Meshy AI Key
                            {process.env.NEXT_PUBLIC_MESHY_API_KEY && (
                                <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded border border-green-500/20 flex items-center gap-1">
                                    <ShieldCheck size={10} /> Env Var Detected
                                </span>
                            )}
                        </label>
                        <input 
                            type="password"
                            value={meshyKey}
                            onChange={(e) => setMeshyKey(e.target.value)}
                            placeholder={process.env.NEXT_PUBLIC_MESHY_API_KEY ? "Using Key from .env" : "Enter Meshy API Key"}
                            className="w-full h-10 px-3 rounded-md bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                        />
                         <p className="text-[10px] text-muted-foreground">Used for 3D generation (Text-to-3D, Image-to-3D).</p>
                    </div>

                     {/* Tripo AI (Placeholder) */}
                     <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Tripo 3D Key
                            <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border border-border">Coming Soon</span>
                        </label>
                        <input 
                            type="password"
                            value={tripoKey}
                            onChange={(e) => setTripoKey(e.target.value)}
                            disabled
                            placeholder="Support coming soon..."
                            className="w-full h-10 px-3 rounded-md bg-secondary/20 border border-border/50 text-muted-foreground cursor-not-allowed text-sm"
                        />
                    </div>
                    
                    {/* Hitems3D (Placeholder) */}
                     <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                            Hitems 3D Key
                             <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border border-border">Coming Soon</span>
                        </label>
                        <input 
                            type="password"
                            value={hitemsKey}
                            onChange={(e) => setHitemsKey(e.target.value)}
                            disabled
                            placeholder="Support coming soon..."
                            className="w-full h-10 px-3 rounded-md bg-secondary/20 border border-border/50 text-muted-foreground cursor-not-allowed text-sm"
                        />
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
                    >
                        {status === 'saved' ? 'Saved!' : 'Save Configurations'}
                        {status !== 'saved' && <Save size={16} />}
                    </button>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-start gap-3">
                    <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                        Keys are stored locally in your browser. We never transmit them to our servers, only directly to the AI providers.
                    </p>
                </div>
            </div>
        </div>
    );
}

// Utility to get the key from anywhere
export const getApiKey = (provider: 'meshy' | 'tripo' | 'hitems') => {
    if (typeof window === 'undefined') return '';
    
    switch (provider) {
        case 'meshy':
             return localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || process.env.NEXT_PUBLIC_MESHY_API_KEY || '';
        case 'tripo':
             return localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '';
        case 'hitems':
             return localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        default:
            return '';
    }
};

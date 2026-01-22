'use client';

import { useState, useEffect } from 'react';
import { X, Save, Key, ShieldCheck, AlertCircle, HelpCircle, Server, Cloud, Box } from 'lucide-react';
import HelpPopup from './HelpPopup';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const STORAGE_KEYS = {
    // 3D Services
    MESHY_API_KEY: 'meshy_api_key',
    TRIPO_API_KEY: 'tripo_api_key',
    HITEMS_API_KEY: 'hitems_api_key',
    
    // Image Services
    STABILITY_API_KEY: 'stability_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    GOOGLE_API_KEY: 'google_api_key', // Google Nano/Gemini
    BANANA_API_KEY: 'banana_api_key', // Banana.dev
    
    // Legacy / Others
    IMG_GEN_PROVIDER: 'image-express-provider',
    COMFY_UI_URL: 'image-express-comfy-url',
};

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    // 3D Keys
    const [meshyKey, setMeshyKey] = useState('');
    const [tripoKey, setTripoKey] = useState('');
    const [hitemsKey, setHitemsKey] = useState('');

    // Image Keys
    const [stabilityKey, setStabilityKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [googleKey, setGoogleKey] = useState('');
    const [bananaKey, setBananaKey] = useState('');

    const [status, setStatus] = useState<'idle' | 'saved'>('idle');
    const [helpType, setHelpType] = useState<'comfy' | 'api' | null>(null);

    // Load keys on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setMeshyKey(localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || '');
            setTripoKey(localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '');
            setHitemsKey(localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '');
            
            setStabilityKey(localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
            setOpenaiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
            setGoogleKey(localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
            setBananaKey(localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');
        }
    }, [isOpen]);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEYS.MESHY_API_KEY, meshyKey);
        localStorage.setItem(STORAGE_KEYS.TRIPO_API_KEY, tripoKey);
        localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, hitemsKey);
        
        localStorage.setItem(STORAGE_KEYS.STABILITY_API_KEY, stabilityKey);
        localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, openaiKey);
        localStorage.setItem(STORAGE_KEYS.GOOGLE_API_KEY, googleKey);
        localStorage.setItem(STORAGE_KEYS.BANANA_API_KEY, bananaKey);
        
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


                <div className="flex-1 overflow-y-auto pr-2 space-y-6 max-h-[60vh]">
                    {/* 3D Generation Section */}
                    <div className="space-y-4">
                         <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                             <Box size={16} className="text-indigo-500"/>
                             3D Services
                        </h4>
                        
                        <div className="grid gap-3">
                            {/* Meshy */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Meshy AI</label>
                                <input 
                                    type="password"
                                    value={meshyKey}
                                    onChange={(e) => setMeshyKey(e.target.value)}
                                    placeholder="Enter Meshy API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Tripo */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Tripo AI</label>
                                <input 
                                    type="password"
                                    value={tripoKey}
                                    onChange={(e) => setTripoKey(e.target.value)}
                                    placeholder="Enter Tripo API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Hitems3D (Generic/Placeholder) */}
                             <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <label className="text-xs font-semibold mb-1.5 block">Hitems3D / Hy3D</label>
                                <input 
                                    type="password"
                                    value={hitemsKey}
                                    onChange={(e) => setHitemsKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-border/50" />

                    {/* Image Generation Config */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                             <Cloud size={16} className="text-pink-500"/> 
                             Image & Vision
                        </h4>
                        
                        <div className="grid gap-3">
                            {/* Stability AI */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Stability AI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">SD3 / Core</span>
                                </div>
                                <input 
                                    type="password"
                                    value={stabilityKey}
                                    onChange={(e) => setStabilityKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* OpenAI */}
                             <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">OpenAI</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">DALL-E 3</span>
                                </div>
                                <input 
                                    type="password"
                                    value={openaiKey}
                                    onChange={(e) => setOpenaiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                            {/* Google Nano */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Google Gemini / Vertex</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">Nano / Imagen</span>
                                </div>
                                <input 
                                    type="password"
                                    value={googleKey}
                                    onChange={(e) => setGoogleKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>

                             {/* Banana.dev */}
                            <div className="bg-secondary/20 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors">
                                <div className="flex justify-between mb-1.5">
                                    <label className="text-xs font-semibold">Banana.dev</label>
                                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">GPU Cloud</span>
                                </div>
                                <input 
                                    type="password"
                                    value={bananaKey}
                                    onChange={(e) => setBananaKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>
                        </div>
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
                
                <HelpPopup 
                    isOpen={!!helpType} 
                    onClose={() => setHelpType(null)} 
                    type={helpType || 'comfy'} 
                />

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

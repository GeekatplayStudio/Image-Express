'use client';

import { X, HelpCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface HelpPopupProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'comfy' | 'api';
}

export default function HelpPopup({ isOpen, onClose, type }: HelpPopupProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-secondary/20 flex justify-between items-center">
                    <h3 className="font-semibold flex items-center gap-2">
                        <HelpCircle size={18} className="text-primary" />
                        {type === 'comfy' ? 'How to setup ComfyUI' : 'Getting an API Key'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full transition-colors">
                        <X size={16} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4 text-sm text-foreground/80 overflow-y-auto max-h-[60vh]">
                    {type === 'comfy' ? (
                        <>
                            <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-xs leading-relaxed">
                                <strong>ComfyUI</strong> is a powerful, local node-based interface for Stable Diffusion. It runs on your own computer (GPU recommended).
                            </div>

                            <ol className="list-decimal list-inside space-y-3 marker:font-bold">
                                <li>
                                    <strong>Download ComfyUI:</strong> Go to the <a href="https://github.com/comfyanonymous/ComfyUI" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ComfyUI GitHub</a> release page and download the portable version for your OS.
                                </li>
                                <li>
                                    <strong>Install Models:</strong> Place your checkpoints (like Flux or SDXL) in the <code className="bg-secondary px-1 py-0.5 rounded">ComfyUI/models/checkpoints</code> folder.
                                </li>
                                <li>
                                    <strong>Run It:</strong> Execute <code className="bg-secondary px-1 py-0.5 rounded">run_nvidia_gpu.bat</code> (Windows) or the appropriate script for your system.
                                </li>
                                <li>
                                    <strong>Connect:</strong> By default, it runs at <code className="bg-secondary px-1 py-0.5 rounded text-primary">http://127.0.0.1:8188</code>. Copy this URL into the settings field.
                                </li>
                                <li>
                                    <strong>CORS Issues:</strong> If you see connection errors, launch ComfyUI with the <code className="bg-secondary px-1 py-0.5 rounded">--enable-cors-header</code> argument to allow the browser to talk to it.
                                </li>
                            </ol>
                        </>
                    ) : (
                         <>
                            <p>To use cloud-based generation, you need an API key from a provider.</p>
                            <div className="space-y-4 mt-2">
                                <div className="border border-border rounded-lg p-3">
                                    <h4 className="font-medium text-foreground mb-1">Option A: Meshy (3D)</h4>
                                    <p className="text-xs text-muted-foreground mb-2">Used for generating 3D models from text or images.</p>
                                    <a href="https://www.meshy.ai/" target="_blank" className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded inline-block">Get Meshy Key</a>
                                </div>
                                <div className="border border-border rounded-lg p-3">
                                    <h4 className="font-medium text-foreground mb-1">Option B: Stability AI (2D)</h4>
                                    <p className="text-xs text-muted-foreground mb-2">Used for high-quality 2D image generation (SDXL).</p>
                                    <a href="https://platform.stability.ai/" target="_blank" className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded inline-block">Get Stability Key</a>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 bg-secondary/10 border-t border-border flex justify-end">
                    <button onClick={onClose} className="text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-md transition-colors">
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}

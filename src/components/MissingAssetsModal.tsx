import React from 'react';
import { AlertTriangle, Image as ImageIcon, Replace, X } from 'lucide-react';

interface MissingItem {
    id: string; // Object ID or index
    type: 'image' | 'model';
    originalSrc: string;
}

interface MissingAssetsModalProps {
    isOpen: boolean;
    missingItems: MissingItem[];
    onReplace: (id: string) => void;
    onIgnore: () => void;
    onClose: () => void; // Should probably just be ignore/cancel
}

export default function MissingAssetsModal({ isOpen, missingItems, onReplace, onIgnore }: MissingAssetsModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-[500px] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border bg-destructive/10 flex items-center gap-3">
                    <div className="p-2 bg-destructive/20 rounded-full">
                        <AlertTriangle className="text-destructive h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg text-destructive">Missing Assets Found</h3>
                        <p className="text-muted-foreground text-xs">Some assets used in this template could not be loaded.</p>
                    </div>
                </div>

                <div className="p-4 flex-1 overflow-y-auto max-h-[400px]">
                    <div className="space-y-3">
                        {missingItems.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <div className="flex items-center gap-3 overflow-hidden">
                                     <div className="w-10 h-10 bg-secondary rounded-md flex items-center justify-center text-muted-foreground">
                                         <ImageIcon size={18} />
                                     </div>
                                     <div className="flex flex-col overflow-hidden">
                                         <span className="font-medium text-sm truncate max-w-[200px]">{item.originalSrc.split('/').pop()}</span>
                                         <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{item.originalSrc}</span>
                                     </div>
                                </div>
                                <button 
                                    onClick={() => onReplace(item.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-md text-xs font-medium transition-colors"
                                >
                                    <Replace size={14} />
                                    Replace
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-3">
                    <button 
                        onClick={onIgnore}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors border border-transparent hover:border-border"
                    >
                        Ignore Missing
                    </button>
                    {/* Note: In a real app 'Ignore' might mean 'Load without them' */}
                </div>
            </div>
        </div>
    );
}

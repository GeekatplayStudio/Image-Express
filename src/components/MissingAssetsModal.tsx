import React from 'react';
import { AlertTriangle, Image as ImageIcon, Replace } from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import ModalShell from '@/components/ui/ModalShell';

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
    // Escape and the window's close button both mean "load without them".
    useEscapeKey(onIgnore, { enabled: isOpen });

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onIgnore}
            closeOnEscape={false}
            closeOnBackdrop={false}
            zIndex={50}
            title="Missing Assets Found"
            icon={<AlertTriangle className="text-destructive h-4 w-4" />}
            initialWidth={520}
            initialHeight={460}
            minWidth={360}
            minHeight={240}
            footer={(
                <div className="p-3 flex justify-end gap-3">
                    <button
                        onClick={onIgnore}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors border border-transparent hover:border-border"
                    >
                        Ignore Missing
                    </button>
                </div>
            )}
        >
            <p className="px-4 pt-3 text-muted-foreground text-xs">Some assets used in this template could not be loaded.</p>
            <div className="p-4 space-y-3">
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
        </ModalShell>
    );
}

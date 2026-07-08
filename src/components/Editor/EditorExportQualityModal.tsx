import { Settings } from 'lucide-react';

import { Switch } from '@/components/ui/switch';

type EditorExportQualityModalProps = {
    isOpen: boolean;
    pendingExportFormat: 'png' | 'jpg' | null;
    exportQualityValue: number;
    exportQualitySize: string;
    includeCanvasBackground: boolean;
    onQualityChange: (value: number) => void;
    onIncludeCanvasBackgroundChange: (value: boolean) => void;
    onCancel: () => void;
    onSave: () => void | Promise<void>;
};

export default function EditorExportQualityModal({
    isOpen,
    pendingExportFormat,
    exportQualityValue,
    exportQualitySize,
    includeCanvasBackground,
    onQualityChange,
    onIncludeCanvasBackgroundChange,
    onCancel,
    onSave,
}: EditorExportQualityModalProps) {
    if (!isOpen || !pendingExportFormat) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col gap-4 mx-4">
                <div className="flex items-start gap-4">
                    <div className="p-2 rounded-full shrink-0 bg-primary/10 text-primary">
                        <Settings size={24} />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h3 className="font-semibold text-lg leading-none">Export Quality</h3>
                        <p className="text-muted-foreground text-sm">Adjust quality and review estimated size.</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Quality: {exportQualityValue}</span>
                        <span>Est. size: {exportQualitySize || '--'}</span>
                    </div>
                    <input
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={exportQualityValue}
                        onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            onQualityChange(Number.isFinite(parsed) ? parsed : 100);
                        }}
                        className="w-full accent-primary"
                    />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/20 px-3 py-2">
                    <div className="space-y-0.5">
                        <div className="text-xs font-medium">Canvas background</div>
                        <div className="text-[10px] text-muted-foreground">
                            {pendingExportFormat === 'jpg' ? 'JPG exports always include a background.' : 'Turn off to export transparent PNG.'}
                        </div>
                    </div>
                    <Switch
                        checked={pendingExportFormat === 'jpg' ? true : includeCanvasBackground}
                        onCheckedChange={onIncludeCanvasBackgroundChange}
                        disabled={pendingExportFormat === 'jpg'}
                        aria-label="Include canvas background"
                    />
                </div>

                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            void onSave();
                        }}
                        className="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all text-white bg-primary hover:bg-primary/90"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

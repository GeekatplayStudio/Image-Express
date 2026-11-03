import { Settings } from 'lucide-react';

import ModalShell from '@/components/ui/ModalShell';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/providers/I18nProvider';

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
    const { t } = useI18n();

    return (
        <ModalShell
            isOpen={isOpen && pendingExportFormat !== null}
            onClose={onCancel}
            zIndex={90}
            title={t('exportQ.title')}
            icon={<Settings size={16} className="text-primary" />}
            initialWidth={440}
            initialHeight={360}
            minWidth={320}
            minHeight={280}
            bodyClassName="p-5 flex flex-col gap-4"
            footer={(
                <div className="flex justify-end gap-3 p-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => { void onSave(); }}
                        className="px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all text-white bg-primary hover:bg-primary/90"
                    >
                        {t('common.save')}
                    </button>
                </div>
            )}
        >
            <p className="text-muted-foreground text-sm">{t('exportQ.subtitle')}</p>

            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t('exportQ.quality', { quality: exportQualityValue })}</span>
                    <span>{t('exportQ.estSize', { size: exportQualitySize || '--' })}</span>
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
                    <div className="text-xs font-medium">{t('exportQ.canvasBackground')}</div>
                    <div className="text-[10px] text-muted-foreground">
                        {pendingExportFormat === 'jpg' ? t('exportQ.jpgAlwaysBackground') : t('exportQ.turnOffTransparent')}
                    </div>
                </div>
                <Switch
                    checked={pendingExportFormat === 'jpg' ? true : includeCanvasBackground}
                    onCheckedChange={onIncludeCanvasBackgroundChange}
                    disabled={pendingExportFormat === 'jpg'}
                    aria-label={t('exportQ.includeBackgroundAria')}
                />
            </div>
        </ModalShell>
    );
}

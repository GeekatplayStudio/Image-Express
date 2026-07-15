'use client';
// File > Open...: lists saved designs (same /api/designs/list endpoint the
// Dashboard uses) so the user can load one directly into the current editor
// without leaving for the Hub.
import { useEffect, useState } from 'react';
import { FolderOpen, Image as ImageIcon } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import { useI18n } from '@/providers/I18nProvider';

export type OpenableDesign = {
    id: string;
    name: string;
    thumbnail?: string;
    image?: string;
    data?: string;
    lastModified: string;
};

type OpenDesignModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onOpenDesign: (design: OpenableDesign) => void;
};

export default function OpenDesignModal({ isOpen, onClose, onOpenDesign }: OpenDesignModalProps) {
    const { t } = useI18n();
    const [designs, setDesigns] = useState<OpenableDesign[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        // Reset for this open (an external-fetch lifecycle, not derived-state churn).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setError(null);
        fetch('/api/designs/list')
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to load designs.');
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.toLowerCase().includes('application/json')) {
                    return { designs: [] };
                }
                return res.json() as Promise<{ success?: boolean; designs?: OpenableDesign[] }>;
            })
            .then((json) => {
                if (cancelled) return;
                setDesigns(Array.isArray(json.designs) ? json.designs : []);
            })
            .catch(() => {
                if (!cancelled) setError(t('editor.openDesignError'));
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [isOpen, t]);

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('editor.openDesign')}
            icon={<FolderOpen size={18} />}
            initialWidth={640}
            initialHeight={520}
        >
            <div className="p-4">
                {isLoading && (
                    <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                )}
                {!isLoading && error && (
                    <p className="text-sm text-destructive">{error}</p>
                )}
                {!isLoading && !error && designs.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t('dashboard.noDesigns')}</p>
                )}
                {!isLoading && !error && designs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {designs.map((design) => {
                            const preview = design.thumbnail || design.image || '';
                            return (
                                <button
                                    key={design.id}
                                    onClick={() => {
                                        onOpenDesign(design);
                                        onClose();
                                    }}
                                    className="group text-left rounded-xl border border-border/60 hover:border-primary/40 overflow-hidden transition-all hover:shadow-md"
                                    data-testid={`open-design-${design.id}`}
                                >
                                    <div className="aspect-square bg-secondary/40 flex items-center justify-center overflow-hidden">
                                        {preview ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={preview} alt={design.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={28} className="text-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <h3 className="font-medium text-xs truncate" title={design.name}>{design.name}</h3>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </ModalShell>
    );
}

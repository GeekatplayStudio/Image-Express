'use client';
// Share the active layer with OTHER projects (not just other canvases of the
// current project). Picks target projects, then shareActiveLayerWithProjects
// drops a linked copy into each one's active canvas.
import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import ModalShell from '@/components/ui/ModalShell';
import { useI18n } from '@/providers/I18nProvider';
import type { Project } from '@/lib/multicanvas/projectStore';

type ShareWithProjectsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    /** All other projects the layer could be shared with (current project excluded). */
    otherProjects: Project[];
    onConfirm: (targetProjectIds: string[]) => void;
};

export default function ShareWithProjectsModal({
    isOpen, onClose, otherProjects, onConfirm,
}: ShareWithProjectsModalProps) {
    const { t } = useI18n();
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleConfirm = () => {
        if (selected.size === 0) return;
        onConfirm([...selected]);
        setSelected(new Set());
        onClose();
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('stack.shareWithProjects')}
            icon={<Globe2 size={18} />}
            initialWidth={420}
            initialHeight={420}
            footer={(
                <div className="flex justify-end gap-2 px-4 py-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selected.size === 0}
                        className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-lg shadow-sm transition-colors"
                        data-testid="share-with-projects-confirm"
                    >
                        {t('stack.share')}
                    </button>
                </div>
            )}
        >
            <div className="p-4">
                <p className="text-sm text-muted-foreground mb-3">{t('stack.shareWithProjectsHint')}</p>
                {otherProjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('stack.shareWithProjectsNone')}</p>
                ) : (
                    <div className="space-y-1">
                        {otherProjects.map((project) => (
                            <label
                                key={project.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(project.id)}
                                    onChange={() => toggle(project.id)}
                                    className="accent-primary"
                                    data-testid={`share-with-project-${project.id}`}
                                />
                                <span className="text-sm">{project.name}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </ModalShell>
    );
}

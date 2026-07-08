import { useCallback, useEffect, useState } from 'react';

import type { ToastOptions } from '@/providers/ToastProvider';

type Toast = (options: ToastOptions) => void;

function shouldLogRecoverableEditorIssue() {
    return !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));
}

type UseEditorDesignTitleArgs = {
    designId: string | null;
    designName: string;
    onUpdateDesignInfo: (id: string | null, name: string) => void;
    setIsDirty: (value: boolean) => void;
    toast: Toast;
};

export function useEditorDesignTitle({
    designId,
    designName,
    onUpdateDesignInfo,
    setIsDirty,
    toast,
}: UseEditorDesignTitleArgs) {
    const [isRenamingDesignTitle, setIsRenamingDesignTitle] = useState(false);
    const [designTitleDraft, setDesignTitleDraft] = useState(designName || 'Untitled Design');

    useEffect(() => {
        if (isRenamingDesignTitle) return;
        setDesignTitleDraft(designName || 'Untitled Design');
    }, [designName, isRenamingDesignTitle]);

    const cancelDesignTitleEdit = useCallback(() => {
        setDesignTitleDraft(designName || 'Untitled Design');
        setIsRenamingDesignTitle(false);
    }, [designName]);

    const commitDesignTitle = useCallback(async () => {
        const nextName = (designTitleDraft || '').trim() || 'Untitled Design';
        setIsRenamingDesignTitle(false);

        if (nextName === designName) {
            setDesignTitleDraft(nextName);
            return;
        }

        if (!designId) {
            onUpdateDesignInfo(null, nextName);
            setDesignTitleDraft(nextName);
            setIsDirty(true);
            return;
        }

        try {
            const res = await fetch('/api/designs/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: designId, name: nextName }),
            });
            const data = await res.json();
            if (!res.ok || !data.success || !data.design) {
                throw new Error(data.message || 'Rename failed.');
            }

            onUpdateDesignInfo(data.design.id, data.design.name || nextName);
            setDesignTitleDraft(data.design.name || nextName);
            toast({
                title: 'Design renamed',
                description: `Now editing "${data.design.name || nextName}".`,
                variant: 'success',
            });
        } catch (error) {
            if (shouldLogRecoverableEditorIssue()) {
                console.warn('Design rename fell back to local sync', error);
            }
            onUpdateDesignInfo(designId, nextName);
            setDesignTitleDraft(nextName);
            toast({
                title: 'Rename synced locally',
                description: 'Name updated in the editor; save to persist server-side if needed.',
                variant: 'warning',
            });
        }
    }, [designId, designName, designTitleDraft, onUpdateDesignInfo, setIsDirty, toast]);

    return {
        isRenamingDesignTitle,
        setIsRenamingDesignTitle,
        designTitleDraft,
        setDesignTitleDraft,
        cancelDesignTitleEdit,
        commitDesignTitle,
    };
}

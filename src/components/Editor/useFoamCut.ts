import { useCallback, useState } from 'react';
import type * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import type { ToastOptions } from '@/providers/ToastProvider';
import { recoverVolatileModelSource } from '@/lib/assetLibrary/durableModelSource';
import { downloadFoamCutFiles, planFoamCut } from '@/lib/foamcut/foamCut';
import { placePlanOnCanvas } from '@/components/Editor/usePapercraftUnfold';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Toast = (options: ToastOptions) => void;

type UseFoamCutArgs = {
    canvas: fabric.Canvas | null;
    target: ExtendedFabricObject | null;
    pushHistory: () => void;
    setIsDirty: (value: boolean) => void;
    closeMenu: () => void;
    toast: Toast;
    t: Translate;
    user: string;
};

export type FoamCutContext = {
    isCutting: boolean;
    onFoamCut: () => void;
};

/**
 * The one-click foam workflow: right-click a 3D model, press "Cut from foam",
 * and the cutter files download while a preview of the sheets lands on the
 * canvas. Mirrors usePapercraftUnfold's shape so EditorView wires both the
 * same way; the pipeline behind it is the Foldcraft library.
 */
export function useFoamCut({
    canvas,
    target,
    pushHistory,
    setIsDirty,
    closeMenu,
    toast,
    t,
    user,
}: UseFoamCutArgs): { foamContext?: FoamCutContext } {
    const [isCutting, setIsCutting] = useState(false);
    const modelUrl = target?.is3DModel ? target.modelUrl : undefined;
    const modelName = target?.name?.trim()
        || modelUrl?.split('?')[0].split('/').pop()
        || t('foamcut.defaultModelName');

    const onFoamCut = useCallback(async () => {
        if (!canvas || !target || !modelUrl || isCutting) return;
        setIsCutting(true);
        try {
            const filename = /\.(?:glb|gltf|stl|obj)$/i.test(modelName) ? modelName : `${modelName}.glb`;
            const durableUrl = await recoverVolatileModelSource(modelUrl, filename, user);
            if (durableUrl !== modelUrl) target.modelUrl = durableUrl;
            const response = await fetch(durableUrl);
            if (!response.ok) throw new Error(`MODEL_FETCH_${response.status}`);
            const bytes = await response.arrayBuffer();

            const result = planFoamCut(bytes, modelName);
            await placePlanOnCanvas(
                canvas,
                modelName,
                result.svgs.map((svg) => ({ svg, widthMm: 600, heightMm: 600 })),
            );
            downloadFoamCutFiles(result.files);
            setIsDirty(true);
            pushHistory();
            closeMenu();
            toast({
                title: t('foamcut.success'),
                description: t('foamcut.successDesc', {
                    files: result.files.length,
                    sheets: result.sheetCount,
                    panels: result.panelCount,
                    minutes: Math.max(1, Math.round(result.estimatedMinutes)),
                }),
                variant: 'success',
            });
        } catch (error) {
            console.error('Foam cut failed', error);
            const expiredSource = error instanceof Error && error.message === 'VOLATILE_MODEL_SOURCE_EXPIRED';
            const invalidPlan = error instanceof Error && error.message === 'FOAMCUT_PLAN_INVALID';
            toast(expiredSource ? {
                title: t('modelSource.expired'),
                description: t('modelSource.expiredBody'),
                variant: 'destructive',
            } : {
                title: t('foamcut.error'),
                description: t(invalidPlan ? 'foamcut.invalidDesc' : 'foamcut.errorDesc'),
                variant: 'destructive',
            });
        } finally {
            setIsCutting(false);
        }
    }, [canvas, closeMenu, isCutting, modelName, modelUrl, pushHistory, setIsDirty, t, target, toast, user]);

    return {
        foamContext: modelUrl ? { isCutting, onFoamCut } : undefined,
    };
}

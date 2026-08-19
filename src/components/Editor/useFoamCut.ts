import { useCallback, useState } from 'react';
import type * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import type { ToastOptions } from '@/providers/ToastProvider';
import { recoverVolatileModelSource } from '@/lib/assetLibrary/durableModelSource';
import {
    FOLD_PROGRESS_STAGES,
    downloadFoamCutFiles,
    runFoamCut,
    type FoldProgressEvent,
    type FoldProgressStage,
} from '@/lib/foamcut/foamCut';
import { placePlanOnCanvas } from '@/components/Editor/placePlanOnCanvas';

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
    name: string;
    isCutting: boolean;
    onFoamCut: () => void;
};

export type FoamCutStep = {
    stage: FoldProgressStage;
    status: 'pending' | 'running' | 'done' | 'error';
    stats?: Record<string, number | string>;
    previewSvg?: string;
    /** Why this step is unhappy — shown so a refused plan explains itself. */
    issues?: string[];
};

export type FoamCutProgress = {
    modelName: string;
    steps: FoamCutStep[];
    finished: boolean;
    failed: boolean;
};

const freshSteps = (): FoamCutStep[] => FOLD_PROGRESS_STAGES.map((stage) => ({ stage, status: 'pending' }));

/**
 * The one-click low-poly unfold: right-click a 3D model, press the button,
 * and the cutter files download while a preview of the sheets lands on the
 * canvas. While the Foldcraft pipeline runs, every stage reports into the
 * step monitor at the bottom of the editor — the low-poly conversion and the
 * unfold are shown, not just spun through.
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
}: UseFoamCutArgs): {
    foamContext?: FoamCutContext;
    foamProgress: FoamCutProgress | null;
    dismissFoamProgress: () => void;
} {
    const [isCutting, setIsCutting] = useState(false);
    const [foamProgress, setFoamProgress] = useState<FoamCutProgress | null>(null);
    const modelUrl = target?.is3DModel ? target.modelUrl : undefined;
    const modelName = target?.name?.trim()
        || modelUrl?.split('?')[0].split('/').pop()
        || t('foamcut.defaultModelName');

    const dismissFoamProgress = useCallback(() => setFoamProgress(null), []);

    const applyProgressEvent = useCallback((event: FoldProgressEvent) => {
        setFoamProgress((current) => {
            if (!current) return current;
            return {
                ...current,
                steps: current.steps.map((step) => {
                    if (step.stage !== event.stage) return step;
                    if (event.status === 'start') return { ...step, status: 'running' };
                    const issues = event.issues?.length ? event.issues : undefined;
                    return {
                        ...step,
                        // A stage that finished with reasons against it did not
                        // succeed, however far the pipeline got afterwards.
                        status: issues ? 'error' : 'done',
                        stats: event.stats ?? step.stats,
                        previewSvg: event.previewSvg ?? step.previewSvg,
                        issues: issues ?? step.issues,
                    };
                }),
            };
        });
    }, []);

    const onFoamCut = useCallback(async () => {
        if (!canvas || !target || !modelUrl || isCutting) return;
        setIsCutting(true);
        setFoamProgress({ modelName, steps: freshSteps(), finished: false, failed: false });
        closeMenu();
        try {
            const filename = /\.(?:glb|gltf|stl|obj)$/i.test(modelName) ? modelName : `${modelName}.glb`;
            const durableUrl = await recoverVolatileModelSource(modelUrl, filename, user);
            if (durableUrl !== modelUrl) target.modelUrl = durableUrl;
            const response = await fetch(durableUrl);
            if (!response.ok) throw new Error(`MODEL_FETCH_${response.status}`);
            const bytes = await response.arrayBuffer();

            const result = await runFoamCut(bytes, modelName, { onProgress: applyProgressEvent });
            await placePlanOnCanvas(
                canvas,
                modelName,
                result.svgs.map((svg) => ({ svg, widthMm: 600, heightMm: 600 })),
            );
            downloadFoamCutFiles(result.files);
            setIsDirty(true);
            pushHistory();
            setFoamProgress((current) => (current ? { ...current, finished: true } : current));
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
            const expiredSource = error instanceof Error && error.message === 'VOLATILE_MODEL_SOURCE_EXPIRED';
            const invalidPlan = error instanceof Error && error.message === 'FOAMCUT_PLAN_INVALID';
            const details = (error as { details?: string[] }).details ?? [];
            // A refused plan is a reported outcome, not a crash: the reasons
            // are already on screen in the step monitor.
            if (invalidPlan) console.warn('Low-poly unfold refused the plan', details);
            else console.error('Low-poly unfold failed', error);
            setFoamProgress((current) => {
                if (!current) return current;
                let attached = false;
                const steps = current.steps.map((step) => {
                    if (step.status !== 'running') return step;
                    attached = true;
                    return { ...step, status: 'error' as const, issues: step.issues ?? (details.length ? details : undefined) };
                });
                // Nothing was mid-flight (the pipeline finished, then the gate
                // refused): pin the reasons to the step that judges the plan.
                if (!attached && details.length > 0) {
                    const verify = steps.findIndex((step) => step.stage === 'verify');
                    if (verify >= 0) steps[verify] = { ...steps[verify], status: 'error', issues: steps[verify].issues ?? details };
                }
                return { ...current, failed: true, steps };
            });
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
    }, [applyProgressEvent, canvas, closeMenu, isCutting, modelName, modelUrl, pushHistory, setIsDirty, t, target, toast, user]);

    return {
        foamContext: modelUrl ? { name: modelName, isCutting, onFoamCut } : undefined,
        foamProgress,
        dismissFoamProgress,
    };
}

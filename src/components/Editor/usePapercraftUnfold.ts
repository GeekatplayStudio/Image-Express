import { useCallback, useState } from 'react';
import * as fabric from 'fabric';

import type { ExtendedFabricObject } from '@/types';
import type { CanvasWithArtboard } from '@/components/Editor/editorView.types';
import type { ToastOptions } from '@/providers/ToastProvider';
import { recoverVolatileModelSource } from '@/lib/assetLibrary/durableModelSource';
import { buildPapercraftPlan } from '@/lib/papercraft/papercraftPlan';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Toast = (options: ToastOptions) => void;

type UsePapercraftUnfoldArgs = {
    canvas: fabric.Canvas | null;
    target: ExtendedFabricObject | null;
    pushHistory: () => void;
    setIsDirty: (value: boolean) => void;
    closeMenu: () => void;
    toast: Toast;
    t: Translate;
    user: string;
};

function getObjectName(target: ExtendedFabricObject): string {
    if (target.name?.trim()) return target.name.trim();
    const source = target.modelUrl?.split('?')[0].split('/').pop();
    return source ? decodeURIComponent(source) : '3D model';
}

export async function createSheetGroup(svg: string, left: number, top: number): Promise<fabric.Group> {
    const parsed = await fabric.loadSVGFromString(svg);
    const objects = parsed.objects.filter((object): object is fabric.FabricObject => object !== null);
    if (objects.length === 0) throw new Error('EMPTY_UNFOLD_SHEET');
    return new fabric.Group(objects, { left, top, originX: 'left', originY: 'top' });
}

export async function placePlanOnCanvas(
    canvas: fabric.Canvas,
    modelName: string,
    sheets: Array<{ svg: string; widthMm: number; heightMm: number }>,
): Promise<fabric.Group> {
    if (sheets.length === 0) throw new Error('EMPTY_UNFOLD_PLAN');
    const gap = 18;
    const columns = Math.max(1, Math.ceil(Math.sqrt(sheets.length)));
    const sheetGroups = await Promise.all(sheets.map((sheet, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return createSheetGroup(
            sheet.svg,
            column * (sheet.widthMm + gap),
            row * (sheet.heightMm + gap),
        );
    }));
    const net = new fabric.Group(sheetGroups, { originX: 'left', originY: 'top' });
    const artboard = (canvas as CanvasWithArtboard).artboard ?? {
        width: canvas.width || 800,
        height: canvas.height || 600,
        left: 0,
        top: 0,
    };
    const fitScale = Math.min(
        1,
        (artboard.width * 0.86) / Math.max(1, net.width),
        (artboard.height * 0.86) / Math.max(1, net.height),
    );
    net.set({
        left: artboard.left + (artboard.width - net.width * fitScale) / 2,
        top: artboard.top + (artboard.height - net.height * fitScale) / 2,
        scaleX: fitScale,
        scaleY: fitScale,
    });
    (net as ExtendedFabricObject).name = `${modelName} — Unfold`;
    canvas.add(net);
    canvas.setActiveObject(net);
    canvas.requestRenderAll();
    return net;
}

export function usePapercraftUnfold({
    canvas,
    target,
    pushHistory,
    setIsDirty,
    closeMenu,
    toast,
    t,
    user,
}: UsePapercraftUnfoldArgs) {
    const [isUnfolding, setIsUnfolding] = useState(false);
    const modelUrl = target?.is3DModel ? target.modelUrl : undefined;
    const modelName = target && modelUrl ? getObjectName(target) : undefined;

    const unfold = useCallback(async () => {
        if (!canvas || !target || !modelUrl || isUnfolding) return;
        setIsUnfolding(true);
        try {
            const filename = modelName && /\.(?:glb|gltf)$/i.test(modelName)
                ? modelName
                : `${modelName || 'model'}.glb`;
            const durableUrl = await recoverVolatileModelSource(modelUrl, filename, user);
            if (durableUrl !== modelUrl) target.modelUrl = durableUrl;
            const plan = await buildPapercraftPlan(durableUrl);
            await placePlanOnCanvas(canvas, modelName ?? t('papercraft.defaultModelName'), plan.sheets);
            setIsDirty(true);
            pushHistory();
            closeMenu();
            toast({
                title: t('papercraft.success'),
                description: t('papercraft.successDesc', {
                    sheets: plan.sheets.length,
                    faces: plan.unfoldedFaceCount,
                    confidence: plan.intelligence.foldBackConfidence,
                }),
                variant: 'success',
            });
        } catch (error) {
            console.error('Papercraft unfold failed', error);
            const expiredSource = error instanceof Error
                && error.message === 'VOLATILE_MODEL_SOURCE_EXPIRED';
            toast(expiredSource ? {
                title: t('modelSource.expired'),
                description: t('modelSource.expiredBody'),
                variant: 'destructive',
            } : {
                title: t('papercraft.error'),
                description: t('papercraft.errorDesc'),
                variant: 'destructive',
            });
        } finally {
            setIsUnfolding(false);
        }
    }, [canvas, closeMenu, isUnfolding, modelName, modelUrl, pushHistory, setIsDirty, t, target, toast, user]);

    return {
        modelContext: modelUrl && modelName
            ? { name: modelName, isUnfolding, onUnfold: unfold }
            : undefined,
    };
}

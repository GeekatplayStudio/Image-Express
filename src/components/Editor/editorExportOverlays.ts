import * as fabric from 'fabric';
import type { ExtendedFabricObject } from '@/types';
import type { UserProfileSettings } from '@/lib/profile-utils';

const buildProfileOverlayText = (profile: UserProfileSettings, fallbackUser: string) => {
    const lines: string[] = [];
    if (profile.displayName) lines.push(profile.displayName);
    if (profile.username && profile.username !== fallbackUser) lines.push(`@${profile.username}`);
    if (profile.email) lines.push(profile.email);
    if (profile.info) lines.push(profile.info);
    return lines.join('\n');
};

const isAIGeneratedUsed = (canvas: fabric.Canvas) => (
    canvas.getObjects().some((obj) => (obj as ExtendedFabricObject).aiGenerated)
);

type RunWithExportOverlaysArgs = {
    canvas: fabric.Canvas;
    profileSettings: UserProfileSettings | null;
    fallbackUser: string;
    overlayFrame: fabric.Object | null;
    overlayLabel: fabric.Object | null;
    setIsExporting: (value: boolean) => void;
};

export async function runWithExportOverlays(
    args: RunWithExportOverlaysArgs,
    action: () => void | Promise<void>,
) {
    const {
        canvas,
        profileSettings,
        fallbackUser,
        overlayFrame,
        overlayLabel,
        setIsExporting,
    } = args;

    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const restoreOverlayVisibility = {
        frame: overlayFrame?.visible ?? true,
        label: overlayLabel?.visible ?? true,
    };
    const overlays: fabric.Object[] = [];
    const active = canvas.getActiveObject();

    try {
        if (overlayFrame) overlayFrame.visible = false;
        if (overlayLabel) overlayLabel.visible = false;

        const aiUsed = isAIGeneratedUsed(canvas);
        const profileText = profileSettings?.embedInfo ? buildProfileOverlayText(profileSettings, fallbackUser) : '';
        const padding = 12;
        const canvasStack = canvas as fabric.Canvas & {
            bringToFront?: (obj: fabric.Object) => void;
            moveTo?: (obj: fabric.Object, index: number) => void;
        };

        if (profileText) {
            const width = Math.min(320, Math.max(160, (canvas.width || 0) * 0.35));
            const overlay = new fabric.Textbox(profileText, {
                width,
                fontSize: 12,
                lineHeight: 1.2,
                fill: 'rgba(0,0,0,0.85)',
                backgroundColor: 'rgba(255,255,255,0.6)',
                selectable: false,
                evented: false,
                opacity: 0.9,
            });

            overlay.set({
                left: (canvas.width || 0) - width - padding,
                top: (canvas.height || 0) - (overlay.height || 0) - padding,
            });
            canvas.add(overlay);
            overlays.push(overlay);
        }

        if (aiUsed) {
            const aiOverlay = new fabric.Textbox('AI-generated content used', {
                width: 240,
                fontSize: 11,
                lineHeight: 1.1,
                fill: 'rgba(0,0,0,0.8)',
                backgroundColor: 'rgba(255,255,255,0.6)',
                selectable: false,
                evented: false,
                opacity: 0.9,
            });
            aiOverlay.set({
                left: padding,
                top: (canvas.height || 0) - (aiOverlay.height || 0) - padding,
            });
            canvas.add(aiOverlay);
            overlays.push(aiOverlay);
        }

        overlays.forEach((overlay) => {
            if (canvasStack.bringToFront) {
                canvasStack.bringToFront(overlay);
            } else if (canvasStack.moveTo) {
                canvasStack.moveTo(overlay, canvas.getObjects().length - 1);
            }
        });

        if (overlays.length > 0) {
            canvas.requestRenderAll();
        }

        await action();
    } finally {
        overlays.forEach((overlay) => canvas.remove(overlay));
        if (overlayFrame) overlayFrame.visible = restoreOverlayVisibility.frame;
        if (overlayLabel) overlayLabel.visible = restoreOverlayVisibility.label;
        if (active) {
            canvas.setActiveObject(active);
        }
        canvas.requestRenderAll();
        setIsExporting(false);
    }
}

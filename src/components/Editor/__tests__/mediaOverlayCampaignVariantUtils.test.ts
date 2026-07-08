import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import {
    createEmptyCampaignWorkspace,
    normalizeCampaignWorkspace,
    removeCampaignVariant,
    upsertCampaignVariantFromFrame,
} from '@/components/Editor/mediaOverlayCampaignVariantUtils';

describe('mediaOverlayCampaignVariantUtils', () => {
    const frame: MediaOverlayFrameConfig = {
        id: 'frame-1',
        preset: 'instagram-square',
        includeInBatchExport: true,
        safeAreaPreset: 'title-safe-10',
    };

    const bounds: RectBounds = {
        left: 120,
        top: 80,
        width: 1080,
        height: 1080,
    };

    const snapshot: DesignJson = {
        objects: [{ type: 'rect', left: 12, top: 16 }],
        metadata: { title: 'demo' },
    };

    it('creates a campaign variant snapshot from a media frame', () => {
        const result = upsertCampaignVariantFromFrame({
            workspace: createEmptyCampaignWorkspace(),
            frame,
            frameBounds: bounds,
            snapshot,
            frameIndex: 1,
            now: '2026-03-31T10:00:00.000Z',
        });

        expect(result.didCreate).toBe(true);
        expect(result.workspace.activeVariantId).toBe('campaign-variant-frame-1');
        expect(result.workspace.variants).toHaveLength(1);
        expect(result.variant.name).toBe('Frame 2 - Instagram 1:1');
        expect(result.variant.bounds).toEqual(bounds);
        expect(result.variant.exportProfile).toEqual({ format: 'png', includeBackground: true });

        (snapshot.objects as Array<Record<string, unknown>>)[0].left = 999;
        expect((result.variant.snapshot.objects as Array<Record<string, unknown>>)[0].left).toBe(12);
    });

    it('updates the existing variant for the same frame instead of duplicating it', () => {
        const firstResult = upsertCampaignVariantFromFrame({
            workspace: createEmptyCampaignWorkspace(),
            frame,
            frameBounds: bounds,
            snapshot,
            frameIndex: 0,
            now: '2026-03-31T10:00:00.000Z',
        });

        const nextSnapshot: DesignJson = {
            objects: [{ type: 'circle', radius: 20 }],
        };

        const secondResult = upsertCampaignVariantFromFrame({
            workspace: firstResult.workspace,
            frame: {
                ...frame,
                safeAreaPreset: 'action-safe-20',
            },
            frameBounds: {
                left: 0,
                top: 0,
                width: 1920,
                height: 1080,
            },
            snapshot: nextSnapshot,
            frameIndex: 0,
            now: '2026-03-31T11:00:00.000Z',
        });

        expect(secondResult.didCreate).toBe(false);
        expect(secondResult.workspace.variants).toHaveLength(1);
        expect(secondResult.variant.id).toBe(firstResult.variant.id);
        expect(secondResult.variant.createdAt).toBe('2026-03-31T10:00:00.000Z');
        expect(secondResult.variant.updatedAt).toBe('2026-03-31T11:00:00.000Z');
        expect(secondResult.variant.safeAreaPreset).toBe('action-safe-20');
        expect(secondResult.variant.bounds).toEqual({
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
        });
        expect(secondResult.variant.snapshot.objects).toEqual([{ type: 'circle', radius: 20 }]);
    });

    it('normalizes persisted campaign workspace payloads and repairs active selection', () => {
        const normalized = normalizeCampaignWorkspace({
            activeVariantId: 'missing-id',
            variants: [
                {
                    id: 'campaign-variant-frame-1',
                    name: 'Frame 1 - Instagram 1:1',
                    sourceFrameId: 'frame-1',
                    framePreset: 'instagram-square',
                    safeAreaPreset: 'title-safe-10',
                    bounds,
                    adaptationMode: 'safe-area',
                    exportProfile: { format: 'png', includeBackground: true },
                    snapshot,
                    createdAt: '2026-03-31T10:00:00.000Z',
                    updatedAt: '2026-03-31T10:00:00.000Z',
                },
                {
                    id: 'broken',
                    name: 'Broken',
                },
            ],
        });

        expect(normalized.variants).toHaveLength(1);
        expect(normalized.activeVariantId).toBe('campaign-variant-frame-1');
        expect(normalized.variants[0]?.snapshot).toEqual(snapshot);
    });

    it('removes campaign variants and clears the active selection when needed', () => {
        const populatedWorkspace = normalizeCampaignWorkspace({
            activeVariantId: 'campaign-variant-frame-1',
            variants: [
                {
                    id: 'campaign-variant-frame-1',
                    name: 'Frame 1 - Instagram 1:1',
                    sourceFrameId: 'frame-1',
                    framePreset: 'instagram-square',
                    safeAreaPreset: 'title-safe-10',
                    bounds,
                    adaptationMode: 'safe-area',
                    exportProfile: { format: 'png', includeBackground: true },
                    snapshot,
                    createdAt: '2026-03-31T10:00:00.000Z',
                    updatedAt: '2026-03-31T10:00:00.000Z',
                },
            ],
        });

        expect(removeCampaignVariant(populatedWorkspace, 'campaign-variant-frame-1')).toEqual({
            activeVariantId: null,
            variants: [],
        });
    });
});
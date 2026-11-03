import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import {
    createEmptyCampaignWorkspace,
    duplicateCampaignVariant,
    normalizeCampaignWorkspace,
    removeCampaignVariant,
    renameCampaignVariant,
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

    it('renames a variant, keeps the typed name across a re-snapshot, and duplicates after the source', () => {
        const frame: MediaOverlayFrameConfig = { id: 'frame-1', preset: 'instagram-square', includeInBatchExport: true, safeAreaPreset: 'none' };
        const bounds = { left: 0, top: 0, width: 10, height: 10 };
        const snapshot = { objects: [] } as unknown as DesignJson;
        const first = upsertCampaignVariantFromFrame({ workspace: createEmptyCampaignWorkspace(), frame, frameBounds: bounds, snapshot, frameIndex: 0, now: '2026-11-03T00:00:00.000Z', meta: { designId: null, designName: 'Page', canvasWidth: 20, canvasHeight: 20 } }).workspace;
        const id = first.variants[0].id;

        const renamed = renameCampaignVariant(first, id, '  Hero story  ', '2026-11-03T00:01:00.000Z');
        expect(renamed.variants[0].name).toBe('Hero story');
        expect(renameCampaignVariant(renamed, id, '   ', 'x')).toBe(renamed);

        const resnapped = upsertCampaignVariantFromFrame({ workspace: renamed, frame, frameBounds: bounds, snapshot, frameIndex: 0, now: '2026-11-03T00:02:00.000Z' }).workspace;
        expect(resnapped.variants[0].name).toBe('Hero story');
        expect(resnapped.variants[0].meta?.designName).toBeUndefined();

        const duplicated = duplicateCampaignVariant(resnapped, id, '2026-11-03T00:03:00.000Z');
        expect(duplicated.variants.map((v) => v.name)).toEqual(['Hero story', 'Hero story copy']);
        expect(duplicated.activeVariantId).toBe(duplicated.variants[1].id);
        expect(duplicated.variants[1].sourceFrameId).not.toBe('frame-1');
        const again = duplicateCampaignVariant(duplicated, id, '2026-11-03T00:04:00.000Z');
        expect(again.variants.map((v) => v.name)).toEqual(['Hero story', 'Hero story copy 2', 'Hero story copy']);
        // A copy's snapshot is its own.
        expect(again.variants[1].snapshot).not.toBe(again.variants[0].snapshot);
    });

    it('keeps a thumbnail and metadata through persistence, and drops malformed ones', () => {
        const base = normalizeCampaignWorkspace({ variants: [{
            id: 'v', name: 'n', sourceFrameId: 'f', framePreset: 'instagram-square', safeAreaPreset: 'none',
            bounds: { left: 0, top: 0, width: 1, height: 1 }, snapshot: {}, exportProfile: { format: 'png', includeBackground: true },
            createdAt: 'x', updatedAt: 'x', thumbnail: 'data:image/png;base64,AA==', meta: { designId: 'd1', designName: 'Page', canvasWidth: 10, canvasHeight: 10 },
        }] });
        expect(base.variants[0].thumbnail).toBe('data:image/png;base64,AA==');
        expect(base.variants[0].meta).toEqual({ designId: 'd1', designName: 'Page', canvasWidth: 10, canvasHeight: 10 });

        const bad = normalizeCampaignWorkspace({ variants: [{
            id: 'v', name: 'n', sourceFrameId: 'f', framePreset: 'instagram-square', safeAreaPreset: 'none',
            bounds: { left: 0, top: 0, width: 1, height: 1 }, snapshot: {}, exportProfile: { format: 'png', includeBackground: true },
            createdAt: 'x', updatedAt: 'x', thumbnail: 'javascript:alert(1)', meta: { designName: 5 },
        }] });
        expect(bad.variants[0].thumbnail).toBeUndefined();
        expect(bad.variants[0].meta).toBeUndefined();
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
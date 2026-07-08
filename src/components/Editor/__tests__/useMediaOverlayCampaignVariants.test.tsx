import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { buildCampaignWorkspaceStorageKey } from '@/components/Editor/mediaOverlayCampaignVariantUtils';
import { useMediaOverlayCampaignVariants } from '@/components/Editor/useMediaOverlayCampaignVariants';
import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
import type { MediaOverlayFrameConfig } from '@/components/Editor/mediaOverlayTypes';
import type { ToastOptions } from '@/providers/ToastProvider';

type HarnessProps = {
    storageKey?: string;
    canvas: { toJSON: jest.Mock<DesignJson, [string[]?]> } | null;
    toast: jest.Mock<void, [ToastOptions]>;
};

const mediaOverlayFrame: MediaOverlayFrameConfig = {
    id: 'frame-1',
    preset: 'instagram-square',
    includeInBatchExport: true,
    safeAreaPreset: 'title-safe-10',
};

const frameBounds: RectBounds = {
    left: 100,
    top: 40,
    width: 1080,
    height: 1080,
};

function HookHarness({ storageKey = 'overlay-demo', canvas, toast }: HarnessProps) {
    const {
        campaignVariants,
        activeCampaignVariantId,
        handleConvertActiveMediaOverlayFrameToVariant,
    } = useMediaOverlayCampaignVariants({
        mediaOverlayStorageKey: storageKey,
        canvas,
        customHistoryProps: ['id', 'name'],
        mediaOverlayFrames: [mediaOverlayFrame],
        activeMediaOverlayFrameId: mediaOverlayFrame.id,
        resolveMediaOverlayFrameBounds: () => frameBounds,
        toast,
    });

    return (
        <div>
            <button type="button" onClick={handleConvertActiveMediaOverlayFrameToVariant}>Convert Active</button>
            <div data-testid="variant-count">{campaignVariants.length}</div>
            <div data-testid="active-variant">{activeCampaignVariantId ?? 'none'}</div>
            <div data-testid="variant-names">{campaignVariants.map((variant) => variant.name).join('|')}</div>
        </div>
    );
}

describe('useMediaOverlayCampaignVariants', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('converts the active media overlay frame into a persisted campaign variant snapshot', async () => {
        const toast = jest.fn<void, [ToastOptions]>();
        const canvas = {
            toJSON: jest.fn<DesignJson, [string[]?]>(() => ({
                objects: [{ type: 'rect', left: 12, top: 16 }],
                metadata: { revision: 1 },
            })),
        };

        render(<HookHarness canvas={canvas} toast={toast} />);

        fireEvent.click(screen.getByRole('button', { name: 'Convert Active' }));

        await waitFor(() => {
            expect(screen.getByTestId('variant-count')).toHaveTextContent('1');
        });

        const storageKey = buildCampaignWorkspaceStorageKey('overlay-demo');
        const persisted = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as {
            activeVariantId?: string;
            variants?: Array<{ snapshot?: { metadata?: { revision?: number } } }>;
        };

        expect(canvas.toJSON).toHaveBeenCalledWith(['id', 'name']);
        expect(screen.getByTestId('active-variant')).toHaveTextContent('campaign-variant-frame-1');
        expect(screen.getByTestId('variant-names')).toHaveTextContent('Frame 1 - Instagram 1:1');
        expect(persisted.activeVariantId).toBe('campaign-variant-frame-1');
        expect(persisted.variants?.[0]?.snapshot?.metadata?.revision).toBe(1);
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Variant snapshot created',
            variant: 'success',
        }));
    });

    it('updates the existing variant for the same frame and reloads it from persisted storage', async () => {
        const toast = jest.fn<void, [ToastOptions]>();
        const canvas = {
            toJSON: jest
                .fn<DesignJson, [string[]?]>()
                .mockReturnValueOnce({ objects: [{ type: 'rect' }], metadata: { revision: 1 } })
                .mockReturnValueOnce({ objects: [{ type: 'circle' }], metadata: { revision: 2 } }),
        };

        const { unmount } = render(<HookHarness canvas={canvas} toast={toast} />);

        fireEvent.click(screen.getByRole('button', { name: 'Convert Active' }));
        await waitFor(() => {
            expect(screen.getByTestId('variant-count')).toHaveTextContent('1');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Convert Active' }));
        await waitFor(() => {
            expect(canvas.toJSON).toHaveBeenCalledTimes(2);
        });

        const storageKey = buildCampaignWorkspaceStorageKey('overlay-demo');
        const afterUpdate = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as {
            variants?: Array<{ snapshot?: { metadata?: { revision?: number } } }>;
        };

        expect(afterUpdate.variants).toHaveLength(1);
        expect(afterUpdate.variants?.[0]?.snapshot?.metadata?.revision).toBe(2);

        unmount();
        render(<HookHarness canvas={null} toast={toast} />);

        await waitFor(() => {
            expect(screen.getByTestId('variant-count')).toHaveTextContent('1');
        });

        expect(screen.getByTestId('active-variant')).toHaveTextContent('campaign-variant-frame-1');
        expect(screen.getByTestId('variant-names')).toHaveTextContent('Frame 1 - Instagram 1:1');
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Variant snapshot updated',
            variant: 'success',
        }));
    });
});
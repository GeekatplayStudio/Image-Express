import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

type Deferred = { settings: Record<string, unknown>; resolve: () => void };
const bakes: Deferred[] = [];

jest.mock('@/lib/threeDLayer/modelSettingsBake', () => ({
    EDITOR_LIGHTING_FALLBACKS: { lightIntensity: 1.2, environment: 'city', envIntensity: 0.6 },
    bakeModelWithSettings: jest.fn((_url: string, settings: Record<string, unknown>) => new Promise((resolve) => {
        bakes.push({ settings, resolve: () => resolve({ toDataURL: () => 'data:image/png;base64,x' }) });
    })),
}));
const setLayerElement = jest.fn();
jest.mock('@/lib/threeDLayer/bake', () => ({ setLayerElementPreservingSize: (...args: unknown[]) => setLayerElement(...args) }));
jest.mock('@/components/ThreeDLayerEditor', () => ({
    LIGHT_PRESETS: [],
    vecScaleTo: (v: unknown) => v,
    SectionTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MiniToggle: () => null,
    MiniSlider: ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
        <input aria-label={label} type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    ),
}));

import { ThreeDModelLayerPanel } from '../ThreeDModelLayerPanel';
import type { ExtendedFabricObject } from '@/types';

describe('ThreeDModelLayerPanel', () => {
    beforeEach(() => { jest.useFakeTimers(); bakes.length = 0; setLayerElement.mockClear(); });
    afterEach(() => jest.useRealTimers());

    it('applies an edit made while the first preview render is still running', async () => {
        const canvas = { requestRenderAll: jest.fn(), fire: jest.fn() };
        const layer = { id: 'm1', modelUrl: '/m.glb', threeDSettings: { lightIntensity: 1.2, envIntensity: 0.6 } } as unknown as ExtendedFabricObject;
        render(<ThreeDModelLayerPanel canvas={canvas as never} layer={layer} />);
        expect(bakes).toHaveLength(1); // preview-only first paint, still running

        fireEvent.change(screen.getByLabelText('Intensity'), { target: { value: '2' } });
        act(() => { jest.advanceTimersByTime(300); });
        expect(bakes).toHaveLength(1); // queued behind the preview

        await act(async () => { bakes[0].resolve(); });
        expect(bakes).toHaveLength(2);
        expect(bakes[1].settings.lightIntensity).toBe(2);
        await act(async () => { bakes[1].resolve(); });

        expect(setLayerElement).toHaveBeenCalledTimes(1);
        expect(layer.threeDSettings?.lightIntensity).toBe(2);
        expect(layer.threeDSettings?.envIntensity).toBe(0.6); // the editor's environment light is kept
        expect(canvas.fire).toHaveBeenCalledWith('object:modified', { target: layer });
    });
});

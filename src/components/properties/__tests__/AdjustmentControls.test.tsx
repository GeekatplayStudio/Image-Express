import React from 'react';
import { render, screen } from '@testing-library/react';
import { AdjustmentControls } from '../AdjustmentControls';

describe('AdjustmentControls curves channel appearance', () => {
    it('uses top-left primary and bottom-right complement backdrops for green and blue channels', () => {
        const { rerender } = render(
            <AdjustmentControls
                type="curves"
                settings={{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], channel: 'g' }}
                onChange={jest.fn()}
            />
        );

        expect(screen.getByTestId('curves-surface')).toHaveStyle({
            background: 'linear-gradient(135deg, rgba(22,101,52,0.94) 0%, rgba(34,197,94,0.22) 24%, rgba(17,24,39,0.90) 58%, rgba(190,24,93,0.28) 82%, rgba(131,24,67,0.48) 100%)',
        });

        rerender(
            <AdjustmentControls
                type="curves"
                settings={{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], channel: 'b' }}
                onChange={jest.fn()}
            />
        );

        expect(screen.getByTestId('curves-surface')).toHaveStyle({
            background: 'linear-gradient(135deg, rgba(30,64,175,0.92) 0%, rgba(59,130,246,0.24) 24%, rgba(15,23,42,0.90) 58%, rgba(202,138,4,0.28) 82%, rgba(161,161,11,0.46) 100%)',
        });
    });
});

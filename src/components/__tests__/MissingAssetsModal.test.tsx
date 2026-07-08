import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MissingAssetsModal from '../MissingAssetsModal';

const mockUseEscapeKey = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

describe('MissingAssetsModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when closed', () => {
        const { container } = render(
            <MissingAssetsModal
                isOpen={false}
                missingItems={[]}
                onReplace={jest.fn()}
                onIgnore={jest.fn()}
                onClose={jest.fn()}
            />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders missing assets and replaces selected item', () => {
        const onReplace = jest.fn();
        const items = [
            { id: 'asset-1', type: 'image' as const, originalSrc: '/assets/images/hero.png' },
            { id: 'asset-2', type: 'model' as const, originalSrc: '/assets/models/model.glb' },
        ];

        render(
            <MissingAssetsModal
                isOpen
                missingItems={items}
                onReplace={onReplace}
                onIgnore={jest.fn()}
                onClose={jest.fn()}
            />
        );

        expect(screen.getByText('Missing Assets Found')).toBeInTheDocument();
        expect(screen.getByText('hero.png')).toBeInTheDocument();
        expect(screen.getByText('model.glb')).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: /Replace/i })[1]);
        expect(onReplace).toHaveBeenCalledWith('asset-2');
    });

    it('ignores missing assets via button and escape hook handler', () => {
        const onIgnore = jest.fn();
        render(
            <MissingAssetsModal
                isOpen
                missingItems={[
                    { id: 'asset-1', type: 'image', originalSrc: '/assets/images/hero.png' },
                ]}
                onReplace={jest.fn()}
                onIgnore={onIgnore}
                onClose={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Ignore Missing' }));
        expect(onIgnore).toHaveBeenCalledTimes(1);

        expect(mockUseEscapeKey).toHaveBeenCalled();
        const [handler, options] = mockUseEscapeKey.mock.calls[0];
        expect(options).toEqual({ enabled: true });
        (handler as () => void)();
        expect(onIgnore).toHaveBeenCalledTimes(2);
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import VaultCircularMenu from '@/components/VaultCircularMenu';

jest.mock('@/hooks/useAppTheme', () => ({
    __esModule: true,
    default: () => ({
        circularMenuColors: {
            assets: '#7FAAB0',
            threeD: '#AC9BC4',
            aiZone: '#C4B08B',
        },
    }),
}));

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

describe('VaultCircularMenu', () => {
    it('renders vault menu items when open', () => {
        render(
            <VaultCircularMenu
                x={200}
                y={200}
                isOpen
                onClose={jest.fn()}
                onAction={jest.fn()}
            />,
        );
        expect(screen.getByTestId('vault-circular-menu')).toBeInTheDocument();
        expect(screen.getByTitle('vault.circular.open')).toBeInTheDocument();
        expect(screen.getByTitle('vault.circular.classic')).toBeInTheDocument();
    });

    it('calls onAction when a satellite is clicked', () => {
        const onAction = jest.fn();
        render(
            <VaultCircularMenu
                x={200}
                y={200}
                isOpen
                onClose={jest.fn()}
                onAction={onAction}
            />,
        );
        fireEvent.click(screen.getByTitle('vault.circular.photos'));
        expect(onAction).toHaveBeenCalledWith(
            'vault-photos',
            expect.objectContaining({ type: 'images' }),
        );
    });
});

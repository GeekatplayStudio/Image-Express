import { fireEvent, render, screen } from '@testing-library/react';

import FabricationLibraryModal from '../FabricationLibraryModal';
import { CNC_INVENTORY_STORAGE_KEY } from '@/features/fabrication/application/inventoryState';

describe('FabricationLibraryModal', () => {
    beforeEach(() => window.localStorage.clear());

    it('launches every fabrication workflow from the unified library', () => {
        const onLaunch = jest.fn();
        render(<FabricationLibraryModal onLaunch={onLaunch} onClose={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Cricut cut-file studio/i }));
        expect(onLaunch).toHaveBeenCalledWith('cricut-studio');
    });

    it('filters CNC hardware and persists acquired quantities', () => {
        render(<FabricationLibraryModal initialTab="hardware" onLaunch={jest.fn()} onClose={jest.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Search hardware or specifications'), { target: { value: 'emergency-stop' } });
        expect(screen.getByText('Emergency-stop station')).toBeInTheDocument();
        expect(screen.queryByText('Rear X-axis profile rail')).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
        expect(JSON.parse(window.localStorage.getItem(CNC_INVENTORY_STORAGE_KEY) || '{}')).toEqual({ estop: 1 });
    });
});

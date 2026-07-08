import React from 'react';
import { render, screen } from '@testing-library/react';
import BrandIcon from '../BrandIcon';

describe('BrandIcon', () => {
    it('renders default brand text, sparks, and notification', () => {
        const { container } = render(<BrandIcon />);

        expect(screen.getByText('iEX')).toBeInTheDocument();
        expect(screen.getByText('Creative signal active')).toBeInTheDocument();

        const sparks = container.querySelectorAll('.brand-spark');
        expect(sparks).toHaveLength(7);
    });

    it('renders custom class and notification text', () => {
        const { container } = render(
            <BrandIcon className="custom-brand-root" notificationText="Pipeline synced" />
        );

        expect(screen.getByText('Pipeline synced')).toBeInTheDocument();
        expect(container.firstChild).toHaveClass('custom-brand-root');
    });
});

import { fireEvent, render, screen, within } from '@testing-library/react';

import TechnologyModal from '@/components/about/TechnologyModal';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const open = () => render(<TechnologyModal isOpen onClose={jest.fn()} />);

describe('TechnologyModal', () => {
    it('renders nothing while closed', () => {
        const { container } = render(<TechnologyModal isOpen={false} onClose={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows every technology and its reasoning by default', () => {
        open();
        expect(screen.getByText('Fabric.js')).toBeInTheDocument();
        expect(screen.getByText('node:sqlite')).toBeInTheDocument();
        // The rationale is the part worth presenting, so it must be visible
        // rather than hidden behind an expander.
        expect(screen.getAllByText(/^Why:/).length).toBeGreaterThan(20);
    });

    it('filters on the reasoning, not just names', () => {
        // Someone presenting this gets asked "why not Postgres / better-sqlite3?"
        // — the answer is written down and must be findable.
        open();
        fireEvent.change(screen.getByLabelText('Filter technologies'), {
            target: { value: 'better-sqlite3' },
        });
        expect(screen.getByText('node:sqlite')).toBeInTheDocument();
        expect(screen.queryByText('Fabric.js')).not.toBeInTheDocument();
    });

    it('reports how much is filtered out', () => {
        open();
        const footer = screen.getByText(/technologies$/);
        expect(footer).toHaveTextContent(/^\d+ technologies$/);

        fireEvent.change(screen.getByLabelText('Filter technologies'), {
            target: { value: 'sqlite' },
        });
        expect(screen.getByText(/of \d+ technologies$/)).toBeInTheDocument();
    });

    it('says so plainly when nothing matches', () => {
        open();
        fireEvent.change(screen.getByLabelText('Filter technologies'), {
            target: { value: 'cobol' },
        });
        expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
        // An empty section heading would read as a rendering fault.
        expect(screen.queryByText('Foundation')).not.toBeInTheDocument();
    });

    it('offers a contents rail that targets real sections', () => {
        open();
        const nav = screen.getByRole('navigation');
        const link = within(nav).getByText(/Asset vault/).closest('a');
        expect(link).toHaveAttribute('href', '#tech-vault');
        expect(document.getElementById('tech-vault')).toBeInTheDocument();
    });

    it('closes on the close button', () => {
        const onClose = jest.fn();
        render(<TechnologyModal isOpen onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close'));
        expect(onClose).toHaveBeenCalled();
    });
});

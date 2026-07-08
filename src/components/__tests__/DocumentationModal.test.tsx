import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentationModal from '../DocumentationModal';

const mockUseEscapeKey = jest.fn();

jest.mock('@/hooks/useEscapeKey', () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseEscapeKey(...args),
}));

jest.mock('next/link', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe('DocumentationModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when closed', () => {
        const { container } = render(<DocumentationModal isOpen={false} onClose={jest.fn()} />);
        expect(container.firstChild).toBeNull();
        expect(mockUseEscapeKey).toHaveBeenCalledWith(expect.any(Function), { enabled: false });
    });

    it('renders manual content with chapters and resource links', () => {
        render(<DocumentationModal isOpen onClose={jest.fn()} />);

        expect(screen.getByText('Image Express Manual')).toBeInTheDocument();
        expect(screen.getByText('Guided tour of the dashboard, editor, AI tools, and asset workflow.')).toBeInTheDocument();
        expect(screen.getAllByText('Introduction').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Toolbar Tools').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Productivity Shortcuts').length).toBeGreaterThan(0);
        expect(screen.getByText(/Alt\/Option \+ Drag on a selected layer duplicates it in place/i)).toBeInTheDocument();
        expect(screen.getByText(/Cmd\/Ctrl\+C copy layer\(s\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Cmd\/Ctrl\+Alt\+G clips the selected layer/i)).toBeInTheDocument();

        const chapterLinks = screen.getAllByRole('link').filter((link) => {
            const href = link.getAttribute('href');
            return href?.startsWith('#');
        });
        expect(Array.from(new Set(chapterLinks.map((link) => link.getAttribute('href'))))).toHaveLength(13);
        expect(screen.getAllByRole('link', { name: 'Dashboard Overview' }).every((link) => link.getAttribute('href') === '#dashboard')).toBe(true);
        expect(screen.getByText('Floating chapter options')).toBeInTheDocument();

        const githubLink = screen.getByRole('link', { name: /GitHub/i });
        expect(githubLink).toHaveAttribute('href', 'https://github.com/GeekatplayStudio');
    });

    it('triggers close handlers from buttons and escape hook', () => {
        const onClose = jest.fn();
        render(<DocumentationModal isOpen onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close documentation' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close manual from side panel' }));
        expect(onClose).toHaveBeenCalledTimes(2);

        const [handler, options] = mockUseEscapeKey.mock.calls[0];
        expect(options).toEqual({ enabled: true });
        (handler as () => void)();
        expect(onClose).toHaveBeenCalledTimes(3);
    });
});

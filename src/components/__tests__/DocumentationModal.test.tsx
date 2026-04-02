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
        expect(screen.getByText(/Cmd\/Ctrl\+J duplicates the active selection/i)).toBeInTheDocument();

        const chapterLinks = screen.getAllByRole('link').filter((link) => {
            const href = link.getAttribute('href');
            return href?.startsWith('#');
        });
        expect(chapterLinks).toHaveLength(13);
        expect(screen.getByRole('link', { name: 'Dashboard Overview' })).toHaveAttribute('href', '#dashboard');

        const githubLink = screen.getByRole('link', { name: /GitHub/i });
        expect(githubLink).toHaveAttribute('href', 'https://github.com/GeekatplayStudio');
    });

    it('triggers close handlers from buttons and escape hook', () => {
        const onClose = jest.fn();
        render(<DocumentationModal isOpen onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close documentation' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close Manual' }));
        expect(onClose).toHaveBeenCalledTimes(2);

        const [handler, options] = mockUseEscapeKey.mock.calls[0];
        expect(options).toEqual({ enabled: true });
        (handler as () => void)();
        expect(onClose).toHaveBeenCalledTimes(3);
    });
});

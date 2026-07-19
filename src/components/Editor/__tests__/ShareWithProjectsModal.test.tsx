import { render, screen, fireEvent } from '@testing-library/react';
import ShareWithProjectsModal from '@/components/Editor/ShareWithProjectsModal';
import type { Project } from '@/lib/multicanvas/projectStore';

const makeProject = (id: string, name: string): Project => ({
    id,
    name,
    activeCanvasId: `${id}-canvas`,
    canvases: [{ id: `${id}-canvas`, name: 'Canvas 1', width: 100, height: 100, json: null }],
});

describe('ShareWithProjectsModal', () => {
    it('shows an empty state when there are no other albums', () => {
        render(
            <ShareWithProjectsModal isOpen otherProjects={[]} onClose={jest.fn()} onConfirm={jest.fn()} />
        );
        expect(screen.getByText(/don't have any other albums/i)).toBeInTheDocument();
    });

    it('confirm is disabled until a project is selected, then calls onConfirm with the selected ids', () => {
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(
            <ShareWithProjectsModal
                isOpen
                otherProjects={[makeProject('p2', 'Campaign'), makeProject('p3', 'Landing Page')]}
                onClose={onClose}
                onConfirm={onConfirm}
            />
        );

        const confirmBtn = screen.getByTestId('share-with-projects-confirm');
        expect(confirmBtn).toBeDisabled();

        fireEvent.click(screen.getByTestId('share-with-project-p3'));
        expect(confirmBtn).not.toBeDisabled();

        fireEvent.click(confirmBtn);
        expect(onConfirm).toHaveBeenCalledWith(['p3']);
        expect(onClose).toHaveBeenCalled();
    });

    it('supports selecting multiple projects', () => {
        const onConfirm = jest.fn();
        render(
            <ShareWithProjectsModal
                isOpen
                otherProjects={[makeProject('p2', 'Campaign'), makeProject('p3', 'Landing Page')]}
                onClose={jest.fn()}
                onConfirm={onConfirm}
            />
        );

        fireEvent.click(screen.getByTestId('share-with-project-p2'));
        fireEvent.click(screen.getByTestId('share-with-project-p3'));
        fireEvent.click(screen.getByTestId('share-with-projects-confirm'));

        expect(onConfirm).toHaveBeenCalledWith(['p2', 'p3']);
    });
});

import { fireEvent, render, screen } from '@testing-library/react';

import CritiqueReportView from '@/components/CritiqueReportView';
import { parseCritiqueResponse } from '@/lib/critique/critiqueReport';
import { runCritiqueJump } from '@/lib/critique/critiqueJump';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const REPLY = JSON.stringify({
    summary: 'A clean poster with a weak headline.',
    score: 68,
    criteria: [{ name: 'Hierarchy', score: 55 }, { name: 'Legibility', score: 80 }],
    issues: [{ severity: 'high', title: 'Headline too small', detail: 'It does not read first.' }],
    actions: [
        { title: 'Enlarge the headline', detail: 'Roughly double it.', jump: 'text' },
        { title: 'Reconsider the concept', detail: '', jump: 'none' },
    ],
});

describe('CritiqueReportView', () => {
    it('shows the score, every profile criterion, the issues and the actions', () => {
        render(<CritiqueReportView report={parseCritiqueResponse(REPLY, 'typography')} onJump={jest.fn()} />);
        expect(screen.getByText('68')).toBeTruthy();
        // All five typography criteria are listed, scored or not.
        for (const name of ['Hierarchy', 'Legibility', 'Font pairing', 'Sizing', 'Line spacing']) {
            expect(screen.getByText(name)).toBeTruthy();
        }
        expect(screen.getByText('Headline too small')).toBeTruthy();
        expect(screen.getByText('critique.report.severity.high')).toBeTruthy();
        expect(screen.getByText('Enlarge the headline')).toBeTruthy();
    });

    it('offers a jump only for actions that have somewhere to go', () => {
        const onJump = jest.fn();
        render(<CritiqueReportView report={parseCritiqueResponse(REPLY, 'typography')} onJump={onJump} />);
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(1);
        fireEvent.click(buttons[0]);
        expect(onJump).toHaveBeenCalledWith('text');
    });

    it('hides the jump buttons when nothing can handle them', () => {
        render(<CritiqueReportView report={parseCritiqueResponse(REPLY, 'typography')} />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('shows a plain-text reply as text and says why there are no scores', () => {
        render(<CritiqueReportView report={parseCritiqueResponse('Summary\nThe layout is busy.', 'general')} />);
        expect(screen.getByText(/The layout is busy\./)).toBeTruthy();
        expect(screen.getByText('critique.report.unstructured')).toBeTruthy();
        expect(screen.queryByText('critique.report.actions')).toBeNull();
    });
});

describe('runCritiqueJump', () => {
    const layer = (type: string, extra: Record<string, unknown> = {}) => ({ type, visible: true, ...extra });

    const makeTargets = (objects: Array<Record<string, unknown>>, active: Record<string, unknown> | null = null) => {
        let current = active;
        const canvas = {
            getObjects: () => objects,
            getActiveObject: () => current,
            setActiveObject: jest.fn((object: Record<string, unknown>) => { current = object; }),
            requestRenderAll: jest.fn(),
        };
        const setActiveTool = jest.fn();
        const openPanel = jest.fn();
        return { targets: { canvas: canvas as never, setActiveTool, openPanel }, canvas, setActiveTool, openPanel };
    };

    it('opens the crop tool for a framing action', () => {
        const { targets, setActiveTool, openPanel } = makeTargets([]);
        runCritiqueJump('crop', targets);
        expect(setActiveTool).toHaveBeenCalledWith('crop');
        expect(openPanel).not.toHaveBeenCalled();
    });

    it('selects the topmost visible text layer for a type action', () => {
        const body = layer('i-text');
        const hidden = layer('textbox', { visible: false });
        const { targets, canvas, setActiveTool, openPanel } = makeTargets([layer('rect'), body, layer('image'), hidden]);
        runCritiqueJump('text', targets);
        expect(canvas.setActiveObject).toHaveBeenCalledWith(body);
        expect(setActiveTool).toHaveBeenCalledWith('select');
        expect(openPanel).toHaveBeenCalledWith('properties');
    });

    it('keeps the text layer the user already has selected', () => {
        const chosen = layer('i-text');
        const { targets, canvas } = makeTargets([chosen, layer('i-text')], chosen);
        runCritiqueJump('text', targets);
        expect(canvas.setActiveObject).not.toHaveBeenCalled();
    });

    it('opens layers for layout and properties for color, without touching the selection', () => {
        const layout = makeTargets([layer('rect')]);
        runCritiqueJump('layout', layout.targets);
        expect(layout.openPanel).toHaveBeenCalledWith('layers');
        expect(layout.canvas.setActiveObject).not.toHaveBeenCalled();

        const color = makeTargets([layer('rect')]);
        runCritiqueJump('color', color.targets);
        expect(color.openPanel).toHaveBeenCalledWith('properties');
    });

    it('still navigates when there is no canvas or no text to select', () => {
        const setActiveTool = jest.fn();
        expect(() => runCritiqueJump('text', { canvas: null, setActiveTool })).not.toThrow();
        expect(setActiveTool).toHaveBeenCalledWith('select');

        const { targets, canvas } = makeTargets([layer('rect')]);
        runCritiqueJump('text', targets);
        expect(canvas.setActiveObject).not.toHaveBeenCalled();
    });
});

/**
 * The step monitor is the answer to "we need to see the steps, with outputs".
 * Its harder job is the unhappy path: when a plan is refused, the reason has
 * to be on screen. A refusal that shows only "fail" sends the user to the
 * browser console, which is exactly what happened with the soda can.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import FoamCutStepsPanel from '../FoamCutStepsPanel';
import type { FoamCutProgress } from '../useFoamCut';

const progress = (overrides: Partial<FoamCutProgress> = {}): FoamCutProgress => ({
    modelName: 'soda-can.glb',
    finished: false,
    failed: false,
    steps: [
        { stage: 'load', status: 'done', stats: { faces: 1996408, usedFaces: 46580 }, previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
        { stage: 'lowpoly', status: 'done', stats: { faces: 46580, flatFaces: 2024 } },
        { stage: 'unfold', status: 'running' },
        { stage: 'grooves', status: 'pending' },
        { stage: 'layout', status: 'pending' },
        { stage: 'verify', status: 'pending' },
    ],
    ...overrides,
});

describe('FoamCutStepsPanel', () => {
    it('renders nothing until a run starts', () => {
        const { container } = render(<FoamCutStepsPanel progress={null} onDismiss={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('names every step and shows the numbers each one produced', () => {
        render(<FoamCutStepsPanel progress={progress()} onDismiss={jest.fn()} />);

        expect(screen.getByText('Read model')).toBeInTheDocument();
        expect(screen.getByText('Convert to low poly')).toBeInTheDocument();
        expect(screen.getByText('Unfold flat')).toBeInTheDocument();
        expect(screen.getByText('Plan fold grooves')).toBeInTheDocument();
        expect(screen.getByText('Lay out sheets')).toBeInTheDocument();
        expect(screen.getByText('Check the plan')).toBeInTheDocument();

        // Counts are formatted for reading, not dumped raw.
        expect(screen.getByText('1,996,408 triangles read, 46,580 kept')).toBeInTheDocument();
        expect(screen.getByText('46,580 faces → 2,024 flat faces')).toBeInTheDocument();
    });

    it('shows the visual preview a stage produced', () => {
        render(<FoamCutStepsPanel progress={progress()} onDismiss={jest.fn()} />);
        const preview = screen.getByAltText('Read model') as HTMLImageElement;
        expect(preview.src).toContain('data:image/svg+xml');
    });

    it('shows why a plan was refused, on the step that judged it', () => {
        const refused = progress({
            failed: true,
            steps: [
                { stage: 'load', status: 'done' },
                { stage: 'lowpoly', status: 'done' },
                { stage: 'unfold', status: 'done' },
                { stage: 'grooves', status: 'done' },
                { stage: 'layout', status: 'done' },
                {
                    stage: 'verify',
                    status: 'error',
                    stats: { verdict: 'fail', refoldMaxErrorMm: 4.4, signConsistency: 1 },
                    issues: ['Panel P1: faces 1214 and 1252 overlap.'],
                },
            ],
        });
        render(<FoamCutStepsPanel progress={refused} onDismiss={jest.fn()} />);

        expect(screen.getByText('Panel P1: faces 1214 and 1252 overlap.')).toBeInTheDocument();
    });

    it('counts the reasons it does not list rather than hiding them', () => {
        const many = Array.from({ length: 9 }, (_, index) => `Panel P${index + 1}: faces overlap.`);
        const refused = progress({
            failed: true,
            steps: [{ stage: 'verify', status: 'error', issues: many }],
        });
        render(<FoamCutStepsPanel progress={refused} onDismiss={jest.fn()} />);

        expect(screen.getByText(many[0])).toBeInTheDocument();
        expect(screen.getByText('+5 more')).toBeInTheDocument();
    });
});

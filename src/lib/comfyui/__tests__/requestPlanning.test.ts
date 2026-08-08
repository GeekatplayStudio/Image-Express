/**
 * @jest-environment node
 */

import {
    COMFY_AGENTIC_EDIT_WORKFLOW_4B,
    COMFY_AGENTIC_EDIT_WORKFLOW_9B,
    buildComfyMissingRequirementSummary,
    formatComfyRequirementDetails,
    getPreferredComfyAgenticWorkflow,
    isComfyConnectionFailureMessage,
    readPreparedComfyText,
    resolveAdaptiveComfyDimensions,
    resolveComfyQualityProfile,
    resolveFluxModelFromWorkflowId,
    snapToComfyGrid,
    truncateComfyPromptForStatus,
} from '@/lib/comfyui/requestPlanning';
import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registry';

const model = (name: string, directory = 'checkpoints'): ComfyWorkflowInstallableModel => ({
    name,
    directory,
} as ComfyWorkflowInstallableModel);

describe('snapToComfyGrid', () => {
    it('rounds to the nearest multiple of 64', () => {
        expect(snapToComfyGrid(1000)).toBe(1024);
        expect(snapToComfyGrid(1050)).toBe(1024);
        expect(snapToComfyGrid(1060)).toBe(1088);
    });

    it('never returns below one tile, even for zero or negative input', () => {
        expect(snapToComfyGrid(0)).toBe(64);
        expect(snapToComfyGrid(-500)).toBe(64);
    });
});

describe('resolveAdaptiveComfyDimensions', () => {
    it('keeps a square canvas square', () => {
        expect(resolveAdaptiveComfyDimensions(2048, 2048, 1024)).toEqual({ width: 1024, height: 1024 });
    });

    it('scales a landscape canvas down to the max side', () => {
        const { width, height } = resolveAdaptiveComfyDimensions(4000, 2000, 1024);
        expect(width).toBe(1024);
        expect(height).toBeGreaterThanOrEqual(512);
        expect(width % 64).toBe(0);
        expect(height % 64).toBe(0);
    });

    it('never leaves the long edge over the cap after rescuing the short edge', () => {
        // An extreme ratio pushes the short edge under the minimum; the rescue
        // scales both back up, which is exactly what can push the long edge
        // back over the cap. The final clamp is what this pins.
        const { width, height } = resolveAdaptiveComfyDimensions(8000, 600, 1024, 512);
        expect(Math.max(width, height)).toBeLessThanOrEqual(1024);
    });

    it('falls back to 1024 for a zero dimension rather than collapsing', () => {
        const { width, height } = resolveAdaptiveComfyDimensions(0, 0, 1024);
        expect(width).toBeGreaterThanOrEqual(64);
        expect(height).toBeGreaterThanOrEqual(64);
    });

    it('treats a max side below the minimum as the minimum', () => {
        const { width, height } = resolveAdaptiveComfyDimensions(2048, 2048, 128, 512);
        expect(Math.max(width, height)).toBe(512);
    });
});

describe('resolveComfyQualityProfile', () => {
    it('uses low CFG for flux workflows, which burn at SD-style values', () => {
        const profile = resolveComfyQualityProfile('image_flux2_klein_9b', '', 1024, 1024, 'generate');
        expect(profile.cfg).toBe(3.5);
        expect(profile.steps).toBe(42);
        expect(Math.max(profile.width, profile.height)).toBeLessThanOrEqual(1024);
    });

    it('detects flux from the model preset when the workflow id does not say so', () => {
        expect(resolveComfyQualityProfile('custom', 'FLUX-dev', 1024, 1024, 'generate').cfg).toBe(3.5);
    });

    it('uses fewer steps for the 4B variant than the 9B', () => {
        const nine = resolveComfyQualityProfile('flux2_klein_9b', '', 1024, 1024, 'generate');
        const four = resolveComfyQualityProfile('flux2_klein_4b', '', 1024, 1024, 'generate');
        expect(four.steps).toBeLessThan(nine.steps);
    });

    it('cuts steps when upscaling, since the workflow does the enlarging', () => {
        expect(resolveComfyQualityProfile('anything', '', 1024, 1024, 'upscale').steps).toBe(16);
    });

    it('raises the cap when upscaling rather than enlarging a small canvas', () => {
        // Worth pinning because it is easy to misread: the profile never scales
        // a canvas *up*. A 1024 source stays 1024; the higher cap only means a
        // large source is not shrunk as far before the upscale workflow runs.
        expect(resolveComfyQualityProfile('sd', '', 1024, 1024, 'upscale').width).toBe(1024);

        const large = resolveComfyQualityProfile('sd', '', 4096, 4096, 'upscale');
        const normal = resolveComfyQualityProfile('sd', '', 4096, 4096, 'generate');
        expect(large.width).toBeGreaterThan(normal.width);
    });

    it('applies a gentler strength for img2img than for generate', () => {
        const img2img = resolveComfyQualityProfile('sd', '', 1024, 1024, 'img2img');
        const generate = resolveComfyQualityProfile('sd', '', 1024, 1024, 'generate');
        expect(img2img.strength).toBeLessThan(generate.strength);
    });

    it('produces a seed inside the 32-bit signed range', () => {
        for (let i = 0; i < 20; i++) {
            const { seed } = resolveComfyQualityProfile('sd', '', 1024, 1024, 'generate');
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThan(2147483647);
        }
    });
});

describe('buildComfyMissingRequirementSummary', () => {
    it('returns null when every workflow is satisfied', () => {
        expect(buildComfyMissingRequirementSummary([
            { workflowId: 'a', missingNodeTypes: [], missingModels: [], canAutoUpdateInstall: true },
        ])).toBeNull();
    });

    it('returns null when the only gap cannot be auto-installed', () => {
        // Nothing actionable means no prompt, rather than an empty one.
        expect(buildComfyMissingRequirementSummary([
            { workflowId: 'a', missingNodeTypes: ['X'], missingModels: [], canAutoUpdateInstall: false },
        ])).toBeNull();
    });

    it('deduplicates the same model requested by two workflows', () => {
        const summary = buildComfyMissingRequirementSummary([
            { workflowId: 'a', missingNodeTypes: [], missingModels: [model('SDXL.safetensors')], canAutoUpdateInstall: false },
            { workflowId: 'b', missingNodeTypes: [], missingModels: [model('sdxl.SAFETENSORS')], canAutoUpdateInstall: false },
        ]);
        expect(summary?.models).toHaveLength(1);
        expect(summary?.workflows.sort()).toEqual(['a', 'b']);
    });

    it('keeps same-named models in different directories apart', () => {
        const summary = buildComfyMissingRequirementSummary([
            {
                workflowId: 'a',
                missingNodeTypes: [],
                missingModels: [model('m.safetensors', 'checkpoints'), model('m.safetensors', 'loras')],
                canAutoUpdateInstall: false,
            },
        ]);
        expect(summary?.models).toHaveLength(2);
    });

    it('flags an install update only when nodes are missing', () => {
        expect(buildComfyMissingRequirementSummary([
            { workflowId: 'a', missingNodeTypes: [], missingModels: [model('m')], canAutoUpdateInstall: true },
        ])?.updateInstall).toBe(false);
    });
});

describe('formatComfyRequirementDetails', () => {
    it('marks compatible workflows and caps the listed items at three', () => {
        expect(formatComfyRequirementDetails([
            { workflowId: 'ok', compatible: true, missingNodeTypes: [], missingModels: [] },
            {
                workflowId: 'bad',
                compatible: false,
                missingNodeTypes: ['A', 'B', 'C', 'D'],
                missingModels: [],
            },
        ])).toBe('ok:ok | bad:missing nodes A, B, C');
    });

    it('says "requirements" when incompatible with no detail to give', () => {
        expect(formatComfyRequirementDetails([
            { workflowId: 'x', compatible: false, missingNodeTypes: [], missingModels: [] },
        ])).toBe('x:missing requirements');
    });
});

describe('isComfyConnectionFailureMessage', () => {
    it.each([
        'Could not reach local ComfyUI',
        'Local ComfyUI responded with HTTP 502',
        'Local ComfyUI check /x returned a Next.js 404 page instead of the ComfyUI API',
    ])('recognises %s', (message) => {
        expect(isComfyConnectionFailureMessage(message)).toBe(true);
    });

    it('does not claim a model error is a connection error', () => {
        expect(isComfyConnectionFailureMessage('Model sdxl.safetensors was not found')).toBe(false);
    });
});

describe('readPreparedComfyText', () => {
    it('takes the first non-blank string and trims it', () => {
        expect(readPreparedComfyText([null, '   ', '  a cat  ', 'later'])).toBe('a cat');
    });

    it('returns empty for undefined, empty, or all-blank input', () => {
        expect(readPreparedComfyText(undefined)).toBe('');
        expect(readPreparedComfyText([])).toBe('');
        expect(readPreparedComfyText(['  ', 42, null])).toBe('');
    });
});

describe('truncateComfyPromptForStatus', () => {
    it('leaves a short prompt alone', () => {
        expect(truncateComfyPromptForStatus('  a cat  ')).toBe('a cat');
    });

    it('truncates to the limit including the ellipsis', () => {
        const result = truncateComfyPromptForStatus('x'.repeat(200), 20);
        expect(result).toHaveLength(20);
        expect(result.endsWith('...')).toBe(true);
    });
});

describe('agentic workflow selection', () => {
    it('prefers 9B, then 4B, then whatever is installed', () => {
        expect(getPreferredComfyAgenticWorkflow(['other', COMFY_AGENTIC_EDIT_WORKFLOW_4B, COMFY_AGENTIC_EDIT_WORKFLOW_9B]))
            .toBe(COMFY_AGENTIC_EDIT_WORKFLOW_9B);
        expect(getPreferredComfyAgenticWorkflow(['other', COMFY_AGENTIC_EDIT_WORKFLOW_4B]))
            .toBe(COMFY_AGENTIC_EDIT_WORKFLOW_4B);
        expect(getPreferredComfyAgenticWorkflow(['other'])).toBe('other');
    });

    it('returns empty rather than undefined when nothing is installed', () => {
        expect(getPreferredComfyAgenticWorkflow([])).toBe('');
    });

    it('maps each edit workflow to its flux model, defaulting to kontext', () => {
        expect(resolveFluxModelFromWorkflowId(COMFY_AGENTIC_EDIT_WORKFLOW_4B)).toBe('flux.2-klein-4b');
        expect(resolveFluxModelFromWorkflowId(COMFY_AGENTIC_EDIT_WORKFLOW_9B)).toBe('flux.2-klein-9b');
        expect(resolveFluxModelFromWorkflowId('something-else')).toBe('flux-kontext');
    });
});

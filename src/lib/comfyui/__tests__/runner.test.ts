import { prepareComfyTask } from '@/lib/comfyui/runner';
import { comfyWorkflowRegistry, type RegisteredWorkflow } from '@/lib/comfyui/registry';

const mockResolveAvailableComfyTransport = jest.fn();
const mockGetObjectInfoSnapshot = jest.fn();

jest.mock('@/lib/comfyui/connection', () => ({
    __esModule: true,
    resolveAvailableComfyTransport: (...args: unknown[]) => mockResolveAvailableComfyTransport(...args),
}));

jest.mock('@/lib/comfyui/client', () => ({
    __esModule: true,
    ComfyUIClient: class MockComfyUIClient {
        getObjectInfoSnapshot = (...args: unknown[]) => mockGetObjectInfoSnapshot(...args);
    },
}));

const MISSING_WORKFLOW_ID = 'runner-test-edit-missing';
const COMPATIBLE_WORKFLOW_ID = 'runner-test-edit-compatible';

const registerWorkflow = (workflow: RegisteredWorkflow) => {
    comfyWorkflowRegistry.register(workflow);
};

describe('prepareComfyTask', () => {
    beforeAll(() => {
        registerWorkflow({
            id: MISSING_WORKFLOW_ID,
            task: 'edit',
            name: 'Runner Test Missing Workflow',
            description: 'Workflow that requires a missing node type.',
            loadBlueprint: () => ({
                '1': {
                    class_type: 'RunnerTestMissingNode',
                    inputs: {},
                },
                '2': {
                    class_type: 'SaveImage',
                    inputs: {
                        images: ['1', 0],
                    },
                },
            }),
            inputBindings: [],
            outputNodeIds: ['2'],
            modelPresetIds: ['default'],
            defaultModelPresetId: 'default',
        });

        registerWorkflow({
            id: COMPATIBLE_WORKFLOW_ID,
            task: 'edit',
            name: 'Runner Test Compatible Workflow',
            description: 'Workflow that should be selected as the automatic fallback.',
            loadBlueprint: () => ({
                '1': {
                    class_type: 'LoadImage',
                    inputs: {
                        image: 'input.png',
                    },
                },
                '2': {
                    class_type: 'SaveImage',
                    inputs: {
                        images: ['1', 0],
                    },
                },
            }),
            inputBindings: [],
            outputNodeIds: ['2'],
            modelPresetIds: ['default'],
            defaultModelPresetId: 'default',
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockResolveAvailableComfyTransport.mockResolvedValue({
            kind: 'local',
            baseUrl: 'http://localhost:8188',
            apiBasePath: '',
            historyPathBase: '/history',
            healthCheckPath: '/system_stats',
            defaultHeaders: {},
        });
        mockGetObjectInfoSnapshot.mockResolvedValue({
            LoadImage: {},
            SaveImage: {},
        });
    });

    it('keeps an explicitly selected workflow instead of silently falling back to another one', async () => {
        await expect(prepareComfyTask({
            connection: {
                mode: 'local',
                localUrl: 'http://localhost:8188',
            },
            task: 'edit',
            workflowId: MISSING_WORKFLOW_ID,
            modelPresetId: 'default',
            params: {},
        })).rejects.toThrow(`Selected ComfyUI workflow "${MISSING_WORKFLOW_ID}" requires missing node types: RunnerTestMissingNode.`);
    });

    it('can still auto-fallback when no workflow was explicitly requested', async () => {
        const prepared = await prepareComfyTask({
            connection: {
                mode: 'local',
                localUrl: 'http://localhost:8188',
            },
            task: 'edit',
            params: {},
        });

        expect(prepared.workflow.id).toBe(COMPATIBLE_WORKFLOW_ID);
    });
});
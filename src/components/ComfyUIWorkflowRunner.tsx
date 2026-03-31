import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { executeComfyTask } from '@/lib/comfyui/runner';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { ensureComfyWorkflowCatalogRegistered } from '@/lib/comfyui/workflows/catalog';
import useSingleFlight from '@/hooks/useSingleFlight';

export const ComfyUIWorkflowRunner: React.FC = () => {
    const [availableWorkflows, setAvailableWorkflows] = useState<string[]>([]);
    const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
    const [resultImage, setResultImage] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const runSingleFlight = useSingleFlight();

    useEffect(() => {
        ensureComfyWorkflowCatalogRegistered();

        const workflows = comfyWorkflowRegistry.getAllWorkflows();
        const ids = workflows.map((workflow) => workflow.id);
        setAvailableWorkflows(ids);

        if (ids.length > 0) {
            setSelectedWorkflow(ids[0]);
        }
    }, []);

    const runWorkflow = async () => {
        await runSingleFlight(async () => {
            if (!selectedWorkflow) {
                return;
            }

            const workflow = comfyWorkflowRegistry.getWorkflow(selectedWorkflow);
            if (!workflow) {
                return;
            }

            setLoading(true);

            try {
                const execution = await executeComfyTask({
                    task: workflow.task,
                    workflowId: selectedWorkflow,
                    params: {
                        prompt: 'A modern product shot on a clean background',
                        negativePrompt: 'blurry, low quality, distorted',
                        width: 1024,
                        height: 1024,
                    },
                });

                if (execution.result.dataUrl) {
                    setResultImage(execution.result.dataUrl);
                }
            } catch (error) {
                console.error('ComfyUI workflow execution failed', error);
            } finally {
                setLoading(false);
            }
        });
    };

    return (
        <div className="space-y-3 rounded-md border border-border bg-secondary/10 p-4">
            <h4 className="text-sm font-semibold">ComfyUI Workflow Runner</h4>
            <select
                value={selectedWorkflow}
                onChange={(event) => setSelectedWorkflow(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
                {availableWorkflows.map((workflowId) => (
                    <option key={workflowId} value={workflowId}>
                        {workflowId}
                    </option>
                ))}
            </select>
            <button
                onClick={runWorkflow}
                disabled={loading}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary"
            >
                {loading ? <Loader2 className="animate-spin" size={12} /> : 'Run Workflow'}
            </button>
            {resultImage && (
                <img src={resultImage} alt="ComfyUI result" className="mt-2 max-w-full rounded-md" />
            )}
        </div>
    );
};

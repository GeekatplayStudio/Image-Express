import React, { useState, useEffect } from 'react';
import { ComfyUIClient } from '@/lib/comfyui/client';
import { comfyWorkflowRegistry } from '@/lib/comfyui/registry';
import { Loader2 } from 'lucide-react';

export const ComfyUIWorkflowRunner: React.FC = () => {
    const [availableWorkflows, setAvailableWorkflows] = useState<string[]>([]);
    const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
    const [resultImage, setResultImage] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Retrieve workflow IDs from the registry
        const workflows = comfyWorkflowRegistry.getAllWorkflows();
        const ids = workflows.map(w => w.id);
        setAvailableWorkflows(ids);
        if (ids.length) setSelectedWorkflow(ids[0]);
    }, []);

    const runWorkflow = async () => {
        if (!selectedWorkflow) return;
        setLoading(true);
        try {
            const client = new ComfyUIClient();
            const workflow = comfyWorkflowRegistry.getWorkflow(selectedWorkflow);
            if (!workflow) {
                console.error('Workflow not found:', selectedWorkflow);
                return;
            }
            const blueprint = await workflow.loadBlueprint();
            const injected = workflow.injectVariables(blueprint, { model: 'default' });
            const result = await client.executeWorkflow(injected, workflow.outputNodeIds);
            if (result?.dataUrl) setResultImage(result.dataUrl);
        } catch (e) {
            console.error('ComfyUI workflow execution failed', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3 p-4 border border-border rounded-md bg-secondary/10">
            <h4 className="font-semibold text-sm">ComfyUI Workflow Runner</h4>
            <select
                value={selectedWorkflow}
                onChange={e => setSelectedWorkflow(e.target.value)}
                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs"
            >
                {availableWorkflows.map(id => (
                    <option key={id} value={id}>
                        {id}
                    </option>
                ))}
            </select>
            <button
                onClick={runWorkflow}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-semibold border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={12} /> : 'Run Workflow'}
            </button>
            {resultImage && (
                <img src={resultImage} alt="ComfyUI result" className="max-w-full rounded-md mt-2" />
            )}
        </div>
    );
};

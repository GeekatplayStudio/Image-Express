import React, { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import {
    Bot,
    CheckCircle,
    CheckCircle2,
    Clock,
    Cpu,
    Loader2,
    Plus,
    Play,
    Sparkles,
    Wand2,
    X,
} from 'lucide-react';
import useEscapeKey from '@/hooks/useEscapeKey';
import {
    AgentExecutionPlan,
    CustomAgentDefinition,
    DEFAULT_SOCIAL_AGENT,
    DEFAULT_SUPER_AGENT,
    executeAgentStepOnCanvas,
    generateSuperAgentPlan,
    loadCustomAgents,
    pushCustomAgentToServer,
    saveCustomAgent,
    syncCustomAgentsFromServer,
} from '@/lib/agent/superAgentEngine';
import { getActiveBrandProfile } from '@/lib/brand/brandProfile';
import { loadLocalAiPreferences } from '@/lib/localAiPreferences';
import { loadGenerativePreferences } from '@/lib/generative-preferences';
import { useI18n } from '@/providers/I18nProvider';

interface SuperAgentModalProps {
    isOpen?: boolean;
    canvas?: fabric.Canvas | null;
    onClose: () => void;
}

export default function SuperAgentModal({
    isOpen = true,
    canvas,
    onClose,
}: SuperAgentModalProps) {
    const { t } = useI18n();
    const [agents, setAgents] = useState<CustomAgentDefinition[]>([DEFAULT_SUPER_AGENT, DEFAULT_SOCIAL_AGENT]);
    const [selectedAgent, setSelectedAgent] = useState<CustomAgentDefinition>(DEFAULT_SUPER_AGENT);

    const [userPrompt, setUserPrompt] = useState('');
    const [plan, setPlan] = useState<AgentExecutionPlan | null>(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(-1);
    const [errorMessage, setErrorMessage] = useState('');

    // Agent Creator Drawer/State
    const [showCreateAgent, setShowCreateAgent] = useState(false);
    const [newAgentName, setNewAgentName] = useState('');
    const [newAgentDescription, setNewAgentDescription] = useState('');
    const [newAgentPrompt, setNewAgentPrompt] = useState('');
    const [newAgentWidth, setNewAgentWidth] = useState(1080);
    const [newAgentHeight, setNewAgentHeight] = useState(1080);
    const [newAgentModel, setNewAgentModel] = useState('');

    useEscapeKey(onClose, { enabled: isOpen });

    useEffect(() => {
        if (!isOpen) return;
        const loaded = loadCustomAgents();
        setAgents(loaded);
        if (loaded.length > 0) {
            setSelectedAgent(loaded[0]);
        }

        // Server store (shared with MCP) is source of truth once reachable
        let cancelled = false;
        void syncCustomAgentsFromServer().then((synced) => {
            if (!synced || cancelled) return;
            setAgents(synced);
            setSelectedAgent((current) => synced.find((a) => a.id === current.id) || synced[0]);
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const handleGeneratePlan = async () => {
        if (!userPrompt.trim()) {
            setErrorMessage('Enter a prompt describing what you want the Super Agent to design.');
            return;
        }

        setIsPlanning(true);
        setErrorMessage('');
        setPlan(null);
        setCurrentStepIndex(-1);

        try {
            const brandProfile = getActiveBrandProfile();
            const prefs = loadLocalAiPreferences();
            const generative = loadGenerativePreferences();
            const externalProvider = generative.defaultProvider === 'openai' || generative.defaultProvider === 'google'
                ? generative.defaultProvider
                : null;
            const externalKey = externalProvider ? localStorage.getItem(`${externalProvider}_api_key`) || '' : '';

            const response = await fetch('/api/ai/super-agent/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userPrompt,
                    agent: selectedAgent,
                    brandProfile,
                    baseUrl: prefs.ollamaBaseUrl,
                    model: selectedAgent.preferredModel || undefined,
                    ...(externalProvider && externalKey
                        ? { provider: externalProvider, apiKey: externalKey }
                        : {}),
                }),
            });

            const data = await response.json() as { success?: boolean; plan?: AgentExecutionPlan; message?: string };
            if (!response.ok || !data.success || !data.plan) {
                // Fallback to local plan generator
                const localPlan = generateSuperAgentPlan(userPrompt, selectedAgent, brandProfile);
                setPlan(localPlan);
            } else {
                setPlan(data.plan);
            }
        } catch {
            const brandProfile = getActiveBrandProfile();
            const localPlan = generateSuperAgentPlan(userPrompt, selectedAgent, brandProfile);
            setPlan(localPlan);
        } finally {
            setIsPlanning(false);
        }
    };

    const handleExecutePlan = async () => {
        if (!canvas || !plan) {
            setErrorMessage('Canvas or plan is not ready.');
            return;
        }

        setIsExecuting(true);
        setErrorMessage('');

        const updatedSteps = [...plan.steps];
        const brandProfile = getActiveBrandProfile();

        for (let i = 0; i < updatedSteps.length; i++) {
            setCurrentStepIndex(i);
            updatedSteps[i].status = 'running';
            setPlan({ ...plan, steps: [...updatedSteps], status: 'executing' });

            try {
                await executeAgentStepOnCanvas(updatedSteps[i], canvas, brandProfile);
                updatedSteps[i].status = 'completed';
            } catch (err) {
                updatedSteps[i].status = 'failed';
                updatedSteps[i].error = err instanceof Error ? err.message : 'Step failed';
                setPlan({ ...plan, steps: [...updatedSteps], status: 'failed' });
                setErrorMessage(`Execution failed at step: ${updatedSteps[i].description}`);
                setIsExecuting(false);
                return;
            }

            // Brief delay for visual step animation
            await new Promise((res) => setTimeout(res, 350));
        }

        setPlan({ ...plan, steps: [...updatedSteps], status: 'completed' });
        setIsExecuting(false);
    };

    const handleSaveNewAgent = () => {
        if (!newAgentName.trim()) {
            setErrorMessage('Agent name is required.');
            return;
        }

        const created: CustomAgentDefinition = {
            id: `custom-agent-${Date.now()}`,
            name: newAgentName.trim(),
            description: newAgentDescription.trim() || 'Custom user agent definition.',
            systemPrompt: newAgentPrompt.trim() || 'You are a specialized graphics agent.',
            role: 'Specialized Sub-Agent',
            defaultWidth: Number(newAgentWidth) || 1080,
            defaultHeight: Number(newAgentHeight) || 1080,
            preferredModel: newAgentModel.trim() || undefined,
            enabledTools: ['set_canvas_size', 'add_text', 'add_shape', 'set_background', 'generate_ai_background'],
            updatedAt: new Date().toISOString(),
        };

        const updated = saveCustomAgent(created);
        pushCustomAgentToServer(created);
        setAgents(updated);
        setSelectedAgent(created);
        setShowCreateAgent(false);
        setNewAgentName('');
        setNewAgentDescription('');
        setNewAgentPrompt('');
        setNewAgentModel('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-foreground">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-muted/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Bot size={22} />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">Super Agent & Sub-Agents</h2>
                            <p className="text-xs text-muted-foreground">
                                Autonomous multi-step creation engine with custom agent creation & tool delegation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title={t('common.close') || 'Close'}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {errorMessage && (
                        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                            {errorMessage}
                        </div>
                    )}

                    {/* Agent Selection Header */}
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card/60">
                        <div className="space-y-1 flex-1">
                            <label className="text-xs font-medium text-muted-foreground">Active Agent:</label>
                            <select
                                value={selectedAgent.id}
                                onChange={(e) => {
                                    const match = agents.find((a) => a.id === e.target.value);
                                    if (match) setSelectedAgent(match);
                                }}
                                className="w-full text-xs font-semibold bg-background border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                                {agents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name} ({a.defaultWidth}x{a.defaultHeight}px)
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {selectedAgent.description}
                            </p>
                        </div>

                        <button
                            onClick={() => setShowCreateAgent(!showCreateAgent)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition-colors shrink-0"
                        >
                            <Plus size={14} />
                            <span>Create Agent</span>
                        </button>
                    </div>

                    {/* Custom Agent Creator Drawer */}
                    {showCreateAgent && (
                        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-200">
                            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">
                                Create New Sub-Agent
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div>
                                    <label className="block text-muted-foreground mb-1">Agent Name</label>
                                    <input
                                        type="text"
                                        value={newAgentName}
                                        onChange={(e) => setNewAgentName(e.target.value)}
                                        className="w-full bg-background border border-border rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="e.g. Minimalist Poster Agent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-muted-foreground mb-1">Target Dimension (W x H)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            value={newAgentWidth}
                                            onChange={(e) => setNewAgentWidth(Number(e.target.value))}
                                            className="w-1/2 bg-background border border-border rounded px-2 py-1.5"
                                        />
                                        <input
                                            type="number"
                                            value={newAgentHeight}
                                            onChange={(e) => setNewAgentHeight(Number(e.target.value))}
                                            className="w-1/2 bg-background border border-border rounded px-2 py-1.5"
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-muted-foreground mb-1">Role / Description</label>
                                    <input
                                        type="text"
                                        value={newAgentDescription}
                                        onChange={(e) => setNewAgentDescription(e.target.value)}
                                        className="w-full bg-background border border-border rounded px-3 py-1.5"
                                        placeholder="e.g. Specializes in typography layouts with subtle background gradients"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-muted-foreground mb-1">System Prompt (agent personality & instructions)</label>
                                    <textarea
                                        value={newAgentPrompt}
                                        onChange={(e) => setNewAgentPrompt(e.target.value)}
                                        rows={3}
                                        className="w-full bg-background border border-border rounded px-3 py-1.5 resize-y"
                                        placeholder="e.g. You are a minimalist poster designer. Prefer generous whitespace, one bold headline, and at most two colors."
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-muted-foreground mb-1">Preferred LLM Model (optional, for planning)</label>
                                    <input
                                        type="text"
                                        value={newAgentModel}
                                        onChange={(e) => setNewAgentModel(e.target.value)}
                                        className="w-full bg-background border border-border rounded px-3 py-1.5"
                                        placeholder="e.g. llama3.2, qwen2.5-coder (defaults to llama3.2)"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setShowCreateAgent(false)}
                                    className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveNewAgent}
                                    className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground font-medium"
                                >
                                    Save Sub-Agent
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Prompt Bar */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Single Prompt Task Definition
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={userPrompt}
                                onChange={(e) => setUserPrompt(e.target.value)}
                                placeholder="e.g. Create a 1080x1080 coffee shop discount promo banner with brown palette and bold title"
                                className="flex-1 text-xs bg-background border border-border rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <button
                                onClick={handleGeneratePlan}
                                disabled={isPlanning || isExecuting}
                                className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm shrink-0"
                            >
                                {isPlanning ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Planning...</span>
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={14} />
                                        <span>Generate Plan</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Execution Timeline */}
                    {plan && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/60">
                                <div>
                                    <h4 className="text-xs font-semibold">Step Execution Plan ({plan.steps.length} steps)</h4>
                                    <p className="text-[11px] text-muted-foreground">{plan.summary}</p>
                                </div>
                                <button
                                    onClick={handleExecutePlan}
                                    disabled={isExecuting || plan.status === 'completed'}
                                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    {isExecuting ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Executing...</span>
                                        </>
                                    ) : plan.status === 'completed' ? (
                                        <>
                                            <CheckCircle2 size={14} />
                                            <span>Completed</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play size={14} />
                                            <span>Execute On Canvas</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="space-y-2">
                                {plan.steps.map((step, idx) => (
                                    <div
                                        key={step.id}
                                        className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                                            step.status === 'completed'
                                                ? 'border-emerald-500/40 bg-emerald-500/5 text-foreground'
                                                : step.status === 'running'
                                                ? 'border-primary bg-primary/10 text-foreground'
                                                : step.status === 'failed'
                                                ? 'border-destructive bg-destructive/10 text-destructive'
                                                : 'border-border/60 bg-card/40 text-muted-foreground'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            {step.status === 'completed' ? (
                                                <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                                            ) : step.status === 'running' ? (
                                                <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                                            ) : (
                                                <Clock size={16} className="text-muted-foreground shrink-0" />
                                            )}
                                            <div>
                                                <span className="font-medium">Step {idx + 1}: {step.description}</span>
                                                {step.error && <p className="text-[10px] text-destructive mt-0.5">{step.error}</p>}
                                            </div>
                                        </div>

                                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted">
                                            {step.action}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

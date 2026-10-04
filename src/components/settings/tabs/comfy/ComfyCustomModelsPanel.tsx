'use client';

import { useMemo, useState } from 'react';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import {
    createCustomModel,
    loadComfyCustomModels,
    saveComfyCustomModels,
    validateCustomModel,
    type ComfyCustomModel,
    type CustomModelIssue,
} from '@/lib/comfyui/customModels';
import { syncComfyCustomModels } from '@/lib/comfyui/workflows/catalog';
import { modalSectionClass } from '../../settingsTypes';

interface ComfyCustomModelsPanelProps {
    /**
     * Checkpoint files the connected ComfyUI server reports, or null when the
     * connection has not been verified — in which case a filename cannot be
     * checked against the server and is accepted on its form alone.
     */
    availableCheckpoints: string[] | null;
}

const ISSUE_KEYS: Record<CustomModelIssue, string> = {
    'name-required': 'comfyCustom.issue.nameRequired',
    'file-required': 'comfyCustom.issue.fileRequired',
    'file-is-path': 'comfyCustom.issue.fileIsPath',
    'file-extension': 'comfyCustom.issue.fileExtension',
    duplicate: 'comfyCustom.issue.duplicate',
    'file-not-on-server': 'comfyCustom.issue.fileNotOnServer',
};

/** Register your own checkpoint files so they appear in the model picker. */
export default function ComfyCustomModelsPanel({ availableCheckpoints }: ComfyCustomModelsPanelProps) {
    const { t } = useI18n();
    const [models, setModels] = useState<ComfyCustomModel[]>(() => loadComfyCustomModels());
    const [name, setName] = useState('');
    const [checkpointFile, setCheckpointFile] = useState('');
    const [issues, setIssues] = useState<CustomModelIssue[]>([]);

    // Offer only files that are not registered yet.
    const suggestions = useMemo(() => {
        const taken = new Set(models.map((model) => model.checkpointFile.toLowerCase()));
        return (availableCheckpoints ?? []).filter((file) => !taken.has(file.toLowerCase()));
    }, [availableCheckpoints, models]);

    const commit = (next: ComfyCustomModel[]) => {
        setModels(next);
        saveComfyCustomModels(next);
        // The picker reads the workflow registry, so it has to hear about this.
        syncComfyCustomModels();
    };

    const handleAdd = () => {
        const draft = { name, checkpointFile };
        const found = validateCustomModel(draft, models, availableCheckpoints);
        setIssues(found);
        if (found.length > 0) return;
        commit([...models, createCustomModel(draft)]);
        setName('');
        setCheckpointFile('');
    };

    return (
        <section className={`${modalSectionClass} xl:col-span-12`} data-testid="comfy-custom-models">
            <div>
                <h5 className="text-xs font-semibold flex items-center gap-1.5"><Boxes size={13} /> {t('comfyCustom.title')}</h5>
                <p className="text-[11px] text-muted-foreground mt-1">{t('comfyCustom.intro')}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
                <label className="text-[11px] font-semibold block">
                    {t('comfyCustom.name')}
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('comfyCustom.namePlaceholder')}
                        className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-normal"
                    />
                </label>
                <label className="text-[11px] font-semibold block">
                    {t('comfyCustom.file')}
                    <input
                        value={checkpointFile}
                        onChange={(event) => setCheckpointFile(event.target.value)}
                        list="comfy-custom-checkpoints"
                        placeholder="myModel.safetensors"
                        className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs font-normal"
                    />
                    <datalist id="comfy-custom-checkpoints">
                        {suggestions.map((file) => <option key={file} value={file} />)}
                    </datalist>
                </label>
                <button
                    type="button"
                    onClick={handleAdd}
                    className="h-8 px-3 text-[11px] font-semibold rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                >
                    <Plus size={13} /> {t('comfyCustom.add')}
                </button>
            </div>

            {issues.length > 0 && (
                <ul className="space-y-1 text-[11px] text-destructive" role="alert">
                    {issues.map((issue) => <li key={issue}>{t(ISSUE_KEYS[issue])}</li>)}
                </ul>
            )}
            {availableCheckpoints === null && (
                <p className="text-[11px] text-muted-foreground">{t('comfyCustom.unverified')}</p>
            )}

            <div className="space-y-1.5">
                {models.map((model) => (
                    <div key={model.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                        <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">{model.name}</div>
                            <div className="truncate font-mono text-[10px] text-muted-foreground">{model.checkpointFile}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => commit(models.filter((entry) => entry.id !== model.id))}
                            title={t('comfyCustom.remove')}
                            aria-label={`${t('comfyCustom.remove')}: ${model.name}`}
                            className="shrink-0 rounded border border-border/60 p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                {models.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-[11px] text-muted-foreground">
                        {t('comfyCustom.empty')}
                    </div>
                )}
            </div>
        </section>
    );
}

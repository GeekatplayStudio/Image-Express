'use client';

import Image from 'next/image';
import {
    HITEMS_FORMAT_OPTIONS,
    HITEMS_MODEL_OPTIONS,
    HITEMS_PRESET_OPTIONS,
    HITEMS_REQUEST_TYPE_OPTIONS,
    getHitemsAllowedResolutions,
    hitemsSupportsTextureStage,
    type HitemsPresetKey,
} from '@/lib/hitemsOptions';
import type { HitemsImageViewMode, HitemsSetupStatus, LayerImageOption } from './types';

const HITEMS_RESOLUTION_LABELS: Record<string, string> = {
    '512': '512³ · Eco',
    '1024': '1024³ · Balanced',
    '1536': '1536P³ · High precision · Complex topology · Fine detail',
    '1536pro': '1536P³pro · Flagship · Commercial · Print-ready',
};

interface HitemsPanelProps {
    hasSavedKey: boolean;
    hitemsAk: string;
    hitemsSk: string;
    onHitemsAkChange: (value: string) => void;
    onHitemsSkChange: (value: string) => void;
    onOpenSettings?: () => void;
    onValidateSetup: () => void;
    isValidatingHitems: boolean;
    hitemsSetupStatus: HitemsSetupStatus;
    recoverJobId: string;
    onRecoverJobIdChange: (value: string) => void;
    onRecoverJob: () => void;
    hitemsPreset: HitemsPresetKey | 'custom';
    activePresetDescription: string;
    onPresetClick: (presetKey: HitemsPresetKey) => void;
    hitemsModel: string;
    hitemsResolution: string;
    hitemsRequestType: string;
    hitemsFormat: string;
    hitemsFace: string;
    hitemsMeshUrl: string;
    hitemsImageViewMode: HitemsImageViewMode;
    hitemsFrontLayerId: string;
    hitemsBackLayerId: string;
    hitemsLeftLayerId: string;
    hitemsRightLayerId: string;
    normalizedLayerImageOptions: LayerImageOption[];
    frontImageUrl: string;
    resolveLayerImageUrl: (layerId: string) => string;
    onModelChange: (value: string) => void;
    onResolutionChange: (value: string) => void;
    onRequestTypeChange: (value: string) => void;
    onFormatChange: (value: string) => void;
    onFaceChange: (value: string) => void;
    onMeshUrlChange: (value: string) => void;
    onImageViewModeChange: (value: HitemsImageViewMode) => void;
    onFrontLayerChange: (value: string) => void;
    onBackLayerChange: (value: string) => void;
    onLeftLayerChange: (value: string) => void;
    onRightLayerChange: (value: string) => void;
}

export default function HitemsPanel(props: HitemsPanelProps) {
    const {
        hasSavedKey,
        hitemsAk,
        hitemsSk,
        onHitemsAkChange,
        onHitemsSkChange,
        onOpenSettings,
        onValidateSetup,
        isValidatingHitems,
        hitemsSetupStatus,
        recoverJobId,
        onRecoverJobIdChange,
        onRecoverJob,
        hitemsPreset,
        activePresetDescription,
        onPresetClick,
        hitemsModel,
        hitemsResolution,
        hitemsRequestType,
        hitemsFormat,
        hitemsFace,
        hitemsMeshUrl,
        hitemsImageViewMode,
        hitemsFrontLayerId,
        hitemsBackLayerId,
        hitemsLeftLayerId,
        hitemsRightLayerId,
        normalizedLayerImageOptions,
        frontImageUrl,
        resolveLayerImageUrl,
        onModelChange,
        onResolutionChange,
        onRequestTypeChange,
        onFormatChange,
        onFaceChange,
        onMeshUrlChange,
        onImageViewModeChange,
        onFrontLayerChange,
        onBackLayerChange,
        onLeftLayerChange,
        onRightLayerChange,
    } = props;

    return (
        <>
            {!hasSavedKey && (
                <div className="space-y-2">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">App ID (ak_...)</label>
                        <input type="text" value={hitemsAk} onChange={(event) => onHitemsAkChange(event.target.value)} placeholder="ak_xxxxxxxx" className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm font-mono" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">App Secret (sk_...)</label>
                        <input type="password" value={hitemsSk} onChange={(event) => onHitemsSkChange(event.target.value)} placeholder="sk_xxxxxxxx" className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm font-mono" />
                    </div>
                </div>
            )}

            <div className="space-y-2 rounded-md border border-border/60 bg-secondary/30 p-3">
                <div className="space-y-2 rounded-md border border-border/40 bg-background/60 p-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase text-muted-foreground">Setup Checklist</p>
                        <div className="flex items-center gap-1">
                            <span className={`px-2 py-1 text-[10px] rounded border ${hitemsSetupStatus.isReady ? 'border-border bg-secondary/50 text-foreground' : 'border-border bg-secondary/50 text-destructive'}`}>{hitemsSetupStatus.label}</span>
                            {onOpenSettings && <button onClick={onOpenSettings} className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary" type="button">Open Settings</button>}
                            <button onClick={onValidateSetup} disabled={isValidatingHitems} className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary disabled:opacity-50" type="button">{isValidatingHitems ? 'Validating...' : 'Validate Setup'}</button>
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">1) Save `hitems_api_key` (token or `ak:sk`) in Settings.</p>
                    <p className="text-[10px] text-muted-foreground">2) If auth fails or responses look empty, set `hitems_appid` in Settings.</p>
                    <p className="text-[10px] text-muted-foreground">3) For staged texturing (Task 2), provide a public mesh URL.</p>
                    <div className="pt-1 space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Recover Existing Job ID</label>
                        <div className="flex items-center gap-1">
                            <input type="text" value={recoverJobId} onChange={(event) => onRecoverJobIdChange(event.target.value)} placeholder="task_id..." className="flex-1 px-2 py-1 bg-secondary/50 rounded border border-border text-[11px] font-mono" />
                            <button onClick={onRecoverJob} className="px-2 py-1 text-[10px] rounded border border-border bg-secondary/50 hover:bg-secondary" type="button">Recover</button>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">One-Click Presets</label>
                    <div className="grid grid-cols-2 gap-1">
                        {HITEMS_PRESET_OPTIONS.map((preset) => <button key={preset.key} onClick={() => onPresetClick(preset.key)} className={`px-2 py-1 rounded text-[10px] border transition-colors ${hitemsPreset === preset.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border hover:bg-secondary'}`} type="button">{preset.label}</button>)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{activePresetDescription}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Model</label>
                        <select value={hitemsModel} onChange={(event) => onModelChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border">{HITEMS_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Resolution</label>
                        <select value={hitemsResolution} onChange={(event) => onResolutionChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border">{getHitemsAllowedResolutions(hitemsModel).map((value) => <option key={value} value={value}>{HITEMS_RESOLUTION_LABELS[value] || value}</option>)}</select>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Image View Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onImageViewModeChange('single')} className={`px-2 py-2 rounded text-[10px] border transition-colors ${hitemsImageViewMode === 'single' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border hover:bg-secondary'}`}>Single Image</button>
                        <button type="button" onClick={() => onImageViewModeChange('multi')} className={`px-2 py-2 rounded text-[10px] border transition-colors ${hitemsImageViewMode === 'multi' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border hover:bg-secondary'}`}>Multi-view (Front/Back/Sides)</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">Front Preview</p>
                            <div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">{frontImageUrl ? <Image src={frontImageUrl} alt="Front layer preview" fill sizes="128px" className="object-contain" unoptimized /> : <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">No front layer</div>}</div>
                        </div>
                        {hitemsImageViewMode === 'multi' && <div className="space-y-1"><p className="text-[10px] text-muted-foreground">Back Preview</p><div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">{resolveLayerImageUrl(hitemsBackLayerId) ? <Image src={resolveLayerImageUrl(hitemsBackLayerId)} alt="Back layer preview" fill sizes="128px" className="object-contain" unoptimized /> : <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>}</div></div>}
                    </div>
                    <div className="grid grid-cols-1 gap-1 pt-1">
                        <label className="text-[10px] text-muted-foreground">Front Layer</label>
                        <select value={hitemsFrontLayerId} onChange={(event) => onFrontLayerChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border">{normalizedLayerImageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                    </div>
                    {hitemsImageViewMode === 'multi' && (
                        <div className="grid grid-cols-1 gap-1 pt-1">
                            <p className="text-[10px] text-muted-foreground">Assign document layers for Back / Left / Right views. At least one extra view is required.</p>
                            <div className="grid grid-cols-2 gap-2 pb-1">
                                <div className="space-y-1"><p className="text-[10px] text-muted-foreground">Left Preview</p><div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">{resolveLayerImageUrl(hitemsLeftLayerId) ? <Image src={resolveLayerImageUrl(hitemsLeftLayerId)} alt="Left layer preview" fill sizes="128px" className="object-contain" unoptimized /> : <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>}</div></div>
                                <div className="space-y-1"><p className="text-[10px] text-muted-foreground">Right Preview</p><div className="relative h-16 rounded border border-border/50 bg-black/10 overflow-hidden">{resolveLayerImageUrl(hitemsRightLayerId) ? <Image src={resolveLayerImageUrl(hitemsRightLayerId)} alt="Right layer preview" fill sizes="128px" className="object-contain" unoptimized /> : <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">Not set</div>}</div></div>
                            </div>
                            <select value={hitemsBackLayerId} onChange={(event) => onBackLayerChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"><option value="">Back: Not set</option>{normalizedLayerImageOptions.map((option) => <option key={`back-${option.id}`} value={option.id}>{option.label}</option>)}</select>
                            <select value={hitemsLeftLayerId} onChange={(event) => onLeftLayerChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"><option value="">Left: Not set</option>{normalizedLayerImageOptions.map((option) => <option key={`left-${option.id}`} value={option.id}>{option.label}</option>)}</select>
                            <select value={hitemsRightLayerId} onChange={(event) => onRightLayerChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border"><option value="">Right: Not set</option>{normalizedLayerImageOptions.map((option) => <option key={`right-${option.id}`} value={option.id}>{option.label}</option>)}</select>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Task</label>
                        <select value={hitemsRequestType} onChange={(event) => onRequestTypeChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border">{HITEMS_REQUEST_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === '2' && !hitemsSupportsTextureStage(hitemsModel)}>{option.label}</option>)}</select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">Format</label>
                        <select value={hitemsFormat} onChange={(event) => onFormatChange(event.target.value)} className="w-full text-xs p-2 rounded bg-secondary/50 border border-border">{HITEMS_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">Face Count (Optional)</label>
                    <input type="number" value={hitemsFace} onChange={(event) => onFaceChange(event.target.value)} min={100000} max={2000000} step={1000} placeholder="100000 - 2000000" className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm" />
                </div>
                {hitemsRequestType === '2' && <div className="space-y-1"><label className="text-[10px] font-medium text-muted-foreground uppercase">Mesh URL (Required for staged texture)</label><input type="url" value={hitemsMeshUrl} onChange={(event) => onMeshUrlChange(event.target.value)} placeholder="https://.../input-mesh.glb" className="w-full px-3 py-2 bg-secondary/50 rounded-md border border-border/50 text-sm" /></div>}
                <p className="text-[10px] text-muted-foreground">Tip: portrait models are best for faces, General v2.0 is segmentation-aware, and geometry-only mode is useful for relief/base-mesh workflows.</p>
            </div>
        </>
    );
}

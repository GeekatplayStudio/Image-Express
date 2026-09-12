/**
 * 3D Stamp Tool - Controls Sidebar
 * Tabbed controls coordinating Artwork, Structure, Relief, and Export.
 */

import React, { useState } from 'react';
import {
    Type,
    Box,
    Layers,
    Download,
} from 'lucide-react';
import {
    StampArtworkConfig,
    StampConfig,
    StampExportFormat,
    StampExportTarget,
} from '../domain/stampTypes';
import StampArtworkTab from './StampArtworkTab';
import StampStructureTab from './StampStructureTab';

interface StampControlsProps {
    config: StampConfig;
    onChange: (updated: StampConfig) => void;
    onExport: (format: StampExportFormat, target: StampExportTarget) => void;
    onApplyPreset: (presetId: string) => void;
    onUseCanvasSelection?: () => void;
    isExporting: boolean;
    imprintDataUrl?: string;
}

type TabKey = 'artwork' | 'structure' | 'relief' | 'export';

export default function StampControls({
    config,
    onChange,
    onExport,
    onApplyPreset,
    onUseCanvasSelection,
    isExporting,
    imprintDataUrl,
}: StampControlsProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('artwork');
    const [exportFormat, setExportFormat] = useState<StampExportFormat>('stl-binary');
    const [exportTarget, setExportTarget] = useState<StampExportTarget>('complete');

    const updateArtwork = (patch: Partial<StampArtworkConfig>) => {
        onChange({
            ...config,
            artwork: { ...config.artwork, ...patch },
        });
    };

    const updateDimensions = (patch: Partial<StampConfig['dimensions']>) => {
        onChange({
            ...config,
            dimensions: { ...config.dimensions, ...patch },
        });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            updateArtwork({ mode: 'image', imageUrl: dataUrl });
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col h-full bg-card border-l border-border text-xs select-none">
            {/* Tab Headers */}
            <div className="grid grid-cols-4 border-b border-border text-center font-medium">
                <button
                    type="button"
                    onClick={() => setActiveTab('artwork')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'artwork'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Type size={13} />
                    Artwork
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('structure')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'structure'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Box size={13} />
                    Podium
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('relief')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'relief'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Layers size={13} />
                    Relief
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('export')}
                    className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        activeTab === 'export'
                            ? 'border-primary text-foreground font-semibold bg-secondary/30'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Download size={13} />
                    Export
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. ARTWORK TAB */}
                {activeTab === 'artwork' && (
                    <StampArtworkTab
                        config={config}
                        updateArtwork={updateArtwork}
                        onApplyPreset={onApplyPreset}
                        onUseCanvasSelection={onUseCanvasSelection}
                        handleFileUpload={handleFileUpload}
                        imprintDataUrl={imprintDataUrl}
                    />
                )}

                {/* 2. STRUCTURE TAB */}
                {activeTab === 'structure' && (
                    <StampStructureTab
                        config={config}
                        onChange={onChange}
                        updateDimensions={updateDimensions}
                        mode="structure"
                    />
                )}

                {/* 3. RELIEF & EXTRUSION TAB */}
                {activeTab === 'relief' && (
                    <StampStructureTab
                        config={config}
                        onChange={onChange}
                        updateDimensions={updateDimensions}
                        mode="relief"
                        updateArtwork={updateArtwork}
                    />
                )}

                {/* 4. EXPORT TAB */}
                {activeTab === 'export' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                Export Target
                            </label>
                            <div className="space-y-1.5">
                                {(
                                    [
                                        {
                                            id: 'complete',
                                            label: 'Complete Stamp Assembly',
                                            desc: 'Handle + Backing Podium + Extruded Die',
                                        },
                                        {
                                            id: 'die-plate',
                                            label: 'Die Plate Only (No Handle)',
                                            desc: 'Ideal for mounting on existing handles or dual-material prints',
                                        },
                                        {
                                            id: 'handle',
                                            label: 'Handle Only',
                                            desc: 'Print the turned handle separately',
                                        },
                                    ] as const
                                ).map((t) => (
                                    <label
                                        key={t.id}
                                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer ${
                                            exportTarget === t.id
                                                ? 'bg-primary/10 border-primary'
                                                : 'border-border hover:bg-secondary/40'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="exportTarget"
                                            value={t.id}
                                            checked={exportTarget === t.id}
                                            onChange={() => setExportTarget(t.id)}
                                            className="mt-0.5 accent-primary"
                                        />
                                        <div>
                                            <div className="font-semibold text-foreground text-[11px]">
                                                {t.label}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                                3D File Format
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {(
                                    [
                                        {
                                            id: 'stl-binary',
                                            label: 'STL (Binary)',
                                            badge: 'Recommended for 3D Slicers',
                                        },
                                        { id: 'stl-ascii', label: 'STL (ASCII)', badge: 'Standard CAD' },
                                        { id: 'obj', label: 'Wavefront OBJ', badge: 'Mesh + Normals' },
                                        { id: 'glb', label: 'GLTF / GLB', badge: 'PBR Colors & Materials' },
                                    ] as const
                                ).map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setExportFormat(f.id)}
                                        className={`p-2 rounded-md border text-left ${
                                            exportFormat === f.id
                                                ? 'bg-primary/10 border-primary text-primary'
                                                : 'border-border text-muted-foreground hover:bg-secondary'
                                        }`}
                                    >
                                        <div className="font-semibold text-foreground text-[11px]">
                                            {f.label}
                                        </div>
                                        <div className="text-[9px] text-muted-foreground">{f.badge}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => onExport(exportFormat, exportTarget)}
                            disabled={isExporting}
                            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Download size={14} />
                            {isExporting ? 'Generating 3D File...' : `Download ${exportFormat.toUpperCase()}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

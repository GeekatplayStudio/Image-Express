import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import * as opentype from 'opentype.js';
import { TOP_TEXT_FONT_FAMILIES, TOP_TEXT_FONT_STYLES, TYPOGRAPHY_PRESETS } from '@/lib/typography';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type PathOption = {
    id: string;
    label: string;
};

interface TextPropertiesProps {
    textContent: string;
    fontFamily: string;
    fontWeight: string;
    curveStrength: number;
    curveCenter: number;
    curveSpan?: number;
    spellcheckEnabled: boolean;
    pathOptions?: PathOption[];
    selectedPathId?: string | null;
    hasAttachedPath?: boolean;
    onFontFamilyChange: (font: string) => void;
    onFontWeightChange: (weight: string) => void;
    onTextContentChange: (text: string) => void;
    onCurveChange: (strength: number, center?: number, span?: number) => void;
    onSpellcheckChange: (enabled: boolean) => void;
    onAttachPath?: (pathId: string) => void;
    onDetachPath?: () => void;
}

export function TextProperties({
    textContent,
    fontFamily,
    fontWeight,
    curveStrength,
    curveCenter,
    curveSpan,
    spellcheckEnabled,
    pathOptions = [],
    selectedPathId = null,
    hasAttachedPath = false,
    onFontFamilyChange,
    onFontWeightChange,
    onTextContentChange,
    onCurveChange,
    onSpellcheckChange,
    onAttachPath,
    onDetachPath
}: TextPropertiesProps) {
    const [customFonts, setCustomFonts] = useState<string[]>([]);
    const [fontUploadMessage, setFontUploadMessage] = useState<string>('');
    const onTextContentChangeRef = useRef(onTextContentChange);

    useEffect(() => {
        onTextContentChangeRef.current = onTextContentChange;
    }, [onTextContentChange]);

    const fallbackCurveSpan = useMemo(() => {
        const strength = Math.min(Math.abs(curveStrength), 100);
        const minSpan = 1;
        const maxSpan = 359;
        return Math.round(minSpan + ((maxSpan - minSpan) * (strength / 100)));
    }, [curveStrength]);

    const activeCurveSpan = curveSpan ?? fallbackCurveSpan;

    const allFontOptions = useMemo(() => {
        const combined = [...TOP_TEXT_FONT_FAMILIES, ...customFonts];
        return [...new Set(combined)];
    }, [customFonts]);

    const toEditorDoc = useCallback((value: string) => {
        const normalized = value.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');
        return {
            type: 'doc',
            content: lines.map((line) => ({
                type: 'paragraph',
                content: line ? [{ type: 'text', text: line }] : []
            }))
        };
    }, []);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
                orderedList: false,
                bulletList: false,
                listItem: false,
                code: false,
            }),
            Placeholder.configure({
                placeholder: 'Type text… Press Enter for new lines.',
            }),
        ],
        content: toEditorDoc(textContent),
        editorProps: {
            attributes: {
                class: 'min-h-[104px] w-full rounded-md border border-border bg-transparent px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-primary',
                'aria-label': 'Text content',
                spellcheck: String(spellcheckEnabled),
            },
        },
        onUpdate({ editor: currentEditor }) {
            const next = currentEditor.getText({ blockSeparator: '\n' });
            onTextContentChangeRef.current(next);
        },
    }, [spellcheckEnabled, toEditorDoc]);

    useEffect(() => {
        if (!editor) return;
        const current = editor.getText({ blockSeparator: '\n' });
        if (current !== textContent) {
            editor.commands.setContent(toEditorDoc(textContent), { emitUpdate: false });
        }
    }, [editor, textContent, toEditorDoc]);

    const handleFontUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const rawBuffer = await file.arrayBuffer();
            const parsed = opentype.parse(rawBuffer);
            const fontFamilyName = String(
                parsed.names.fontFamily?.en
                || parsed.names.fullName?.en
                || file.name.replace(/\.[^/.]+$/, '')
            ).trim();

            if (!fontFamilyName) {
                setFontUploadMessage('Font loaded but no family name was found.');
                return;
            }

            const blob = new Blob([rawBuffer], { type: file.type || 'font/ttf' });
            const url = URL.createObjectURL(blob);
            const fontFace = new FontFace(fontFamilyName, `url(${url})`);
            await fontFace.load();
            document.fonts.add(fontFace);
            URL.revokeObjectURL(url);

            setCustomFonts((previous) => previous.includes(fontFamilyName) ? previous : [...previous, fontFamilyName]);
            onFontFamilyChange(fontFamilyName);
            setFontUploadMessage(`Loaded font: ${fontFamilyName}`);
        } catch {
            setFontUploadMessage('Could not load this font file. Please use a valid .ttf or .otf file.');
        } finally {
            event.target.value = '';
        }
    }, [onFontFamilyChange]);

    // Helper to describe curve type for UI feedback
    const getCurveDescription = (): string => {
        if (curveStrength === 0) return 'Flat';
        if (curveStrength > 0) {
            if (curveStrength > 50) return 'Strong Arc Up';
            return 'Arc Up';
        }
        if (curveStrength < -50) return 'Strong Arc Down';
        return 'Arc Down';
    };

    return (
        <div className="p-4 space-y-4 border-b border-border/50">
            <h3 className="font-medium text-sm">Text Style</h3>
            
            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] text-muted-foreground">Text</label>
                        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={spellcheckEnabled}
                                onChange={(event) => onSpellcheckChange(event.target.checked)}
                            />
                            Spellcheck
                        </label>
                    </div>
                    <EditorContent editor={editor} />
                </div>

                <div className="space-y-2 rounded-md border border-border/50 bg-secondary/20 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Typography Presets</div>
                    <div className="grid grid-cols-2 gap-1">
                        {TYPOGRAPHY_PRESETS.map((preset) => {
                            const isActive = preset.fontFamily === fontFamily && String(preset.fontWeight) === String(fontWeight);
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => {
                                        onFontFamilyChange(preset.fontFamily);
                                        onFontWeightChange(preset.fontWeight);
                                    }}
                                    aria-pressed={isActive}
                                    className={`rounded border px-2 py-1.5 text-left text-[10px] transition-colors ${isActive
                                        ? 'border-primary bg-primary/10 text-foreground'
                                        : 'border-border/60 bg-background/50 hover:bg-secondary'}`}
                                    style={{ fontFamily: preset.fontFamily, fontWeight: Number.isNaN(Number(preset.fontWeight)) ? preset.fontWeight as React.CSSProperties['fontWeight'] : Number(preset.fontWeight) }}
                                >
                                    {preset.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Font Family</label>
                    <Select value={fontFamily} onValueChange={onFontFamilyChange}>
                        <SelectTrigger className="w-full text-xs" style={{ fontFamily }}>
                            <SelectValue placeholder="Font family" />
                        </SelectTrigger>
                        <SelectContent>
                            {allFontOptions.map((fontOption) => (
                                <SelectItem key={fontOption} value={fontOption}>{fontOption}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded border border-border/60 bg-secondary/40 px-1.5 py-0.5">Upload .ttf/.otf</span>
                        <input
                            type="file"
                            accept=".ttf,.otf,font/ttf,font/otf"
                            className="hidden"
                            onChange={handleFontUpload}
                        />
                    </label>
                    {fontUploadMessage && (
                        <div className="text-[10px] text-muted-foreground">{fontUploadMessage}</div>
                    )}
                </div>
                
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Weight</label>
                    <select
                        value={fontWeight}
                        onChange={(e) => onFontWeightChange(e.target.value)}
                        className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {TOP_TEXT_FONT_STYLES.map((weightOption) => <option key={weightOption} value={weightOption} className="bg-card text-foreground">{weightOption}</option>)}
                    </select>
                </div>

                <div className="pt-2 border-t border-border/30">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Text Path / Curve</label>
                    
                    <div className="space-y-3">
                        <div className="space-y-2 pb-2 border-b border-border/30">
                            <div className="text-[10px] text-muted-foreground">Align to existing pen path</div>
                            <select
                                value={selectedPathId || ''}
                                onChange={(e) => {
                                    const nextId = e.target.value;
                                    if (nextId) onAttachPath?.(nextId);
                                }}
                                className="w-full text-xs bg-transparent border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                disabled={pathOptions.length === 0}
                            >
                                <option value="" className="bg-card text-foreground">
                                    {pathOptions.length === 0 ? 'No pen paths on canvas' : 'Select a pen path'}
                                </option>
                                {pathOptions.map((path) => (
                                    <option key={path.id} value={path.id} className="bg-card text-foreground">
                                        {path.label}
                                    </option>
                                ))}
                            </select>
                            {hasAttachedPath && (
                                <button
                                    onClick={onDetachPath}
                                    className="w-full px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary transition-colors"
                                >
                                    Detach Path
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Bend</span>
                                <span className="flex items-center gap-2">
                                    <span className="text-primary/70">{getCurveDescription()}</span>
                                    <span className="font-mono">{curveStrength}</span>
                                </span>
                            </div>
                            <input
                                type="range"
                                min="-100"
                                max="100"
                                value={curveStrength}
                                onChange={(e) => onCurveChange(parseInt(e.target.value), curveCenter, activeCurveSpan)}
                                onDoubleClick={() => onCurveChange(0, 0, activeCurveSpan)}
                                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                title="Double-click to reset"
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                <span>↓ Down</span>
                                <span>Flat</span>
                                <span>Up ↑</span>
                            </div>
                        </div>

                        {curveStrength !== 0 && (
                            <div className="space-y-2 animate-in fade-in-50 duration-200">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Curve Center</span>
                                    <span className="font-mono">{curveCenter}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    value={curveCenter}
                                    onChange={(e) => onCurveChange(curveStrength, parseInt(e.target.value), activeCurveSpan)}
                                    onDoubleClick={() => onCurveChange(curveStrength, 0, activeCurveSpan)}
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    title="Double-click to reset"
                                />
                                <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                    <span>← Left</span>
                                    <span>Center</span>
                                    <span>Right →</span>
                                </div>

                                <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                                    <span>Arc Span</span>
                                    <span className="font-mono">{activeCurveSpan}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="15"
                                    max="359"
                                    value={activeCurveSpan}
                                    onChange={(e) => onCurveChange(curveStrength, curveCenter, parseInt(e.target.value))}
                                    onDoubleClick={() => onCurveChange(curveStrength, curveCenter, 180)}
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    title="Double-click to reset span to 180°"
                                />
                                <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                    <span>Narrow</span>
                                    <span>Half Circle</span>
                                    <span>Full Circle</span>
                                </div>
                            </div>
                        )}
                        
                        {/* Quick presets */}
                        <div className="flex gap-1 pt-1">
                            <button 
                                onClick={() => onCurveChange(0, 0, activeCurveSpan)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Flat
                            </button>
                            <button 
                                onClick={() => onCurveChange(50, 0, 180)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Arc ↑
                            </button>
                            <button 
                                onClick={() => onCurveChange(-50, 0, 180)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === -50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Arc ↓
                            </button>
                            <button 
                                onClick={() => onCurveChange(100, 0, 359)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${(curveStrength === 100 && activeCurveSpan >= 350) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                Circle
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

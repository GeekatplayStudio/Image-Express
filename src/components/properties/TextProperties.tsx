import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import * as opentype from 'opentype.js';
import { TOP_TEXT_FONT_FAMILIES, TOP_TEXT_FONT_STYLES, TYPOGRAPHY_PRESETS } from '@/lib/typography';
import { useI18n } from '@/providers/I18nProvider';
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
    textBgEnabled?: boolean;
    textBgColor?: string;
    textBgPadding?: number;
    textBgCorners?: number;
    textBgStyle?: 'rect' | 'pill' | 'speech';
    pathOptions?: PathOption[];
    selectedPathId?: string | null;
    hasAttachedPath?: boolean;
    onFontFamilyChange: (font: string) => void;
    onFontWeightChange: (weight: string) => void;
    onTextContentChange: (text: string) => void;
    onCurveChange: (strength: number, center?: number, span?: number) => void;
    onSpellcheckChange: (enabled: boolean) => void;
    onTextBgEnabledChange?: (enabled: boolean) => void;
    onTextBgColorChange?: (color: string) => void;
    onTextBgPaddingChange?: (padding: number) => void;
    onTextBgCornersChange?: (corners: number) => void;
    onTextBgStyleChange?: (style: 'rect' | 'pill' | 'speech') => void;
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
    textBgEnabled = false,
    textBgColor = '#ff0000',
    textBgPadding = 10,
    textBgCorners = 0,
    textBgStyle = 'rect',
    pathOptions = [],
    selectedPathId = null,
    hasAttachedPath = false,
    onFontFamilyChange,
    onFontWeightChange,
    onTextContentChange,
    onCurveChange,
    onSpellcheckChange,
    onTextBgEnabledChange,
    onTextBgColorChange,
    onTextBgPaddingChange,
    onTextBgCornersChange,
    onTextBgStyleChange,
    onAttachPath,
    onDetachPath
}: TextPropertiesProps) {
    const { t } = useI18n();
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
                placeholder: t('text.placeholder'),
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
            <h3 className="font-medium text-sm">{t('text.style')}</h3>
            
            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] text-muted-foreground">{t('text.text')}</label>
                        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={spellcheckEnabled}
                                onChange={(event) => onSpellcheckChange(event.target.checked)}
                            />
                            {t('text.spellcheck')}
                        </label>
                    </div>
                    <EditorContent editor={editor} />
                </div>

                <div className="space-y-2 rounded-md border border-border/50 bg-secondary/20 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('text.typographyPresets')}</div>
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
                                    {t(preset.labelKey)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">{t('text.fontFamily')}</label>
                    <Select value={fontFamily} onValueChange={onFontFamilyChange}>
                        <SelectTrigger className="w-full text-xs" style={{ fontFamily }}>
                            <SelectValue placeholder={t('text.fontFamilyPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {allFontOptions.map((fontOption) => (
                                <SelectItem key={fontOption} value={fontOption}>{fontOption}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded border border-border/60 bg-secondary/40 px-1.5 py-0.5">{t('text.uploadFont')}</span>
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
                    <label className="text-[10px] text-muted-foreground">{t('text.weight')}</label>
                    <Select value={fontWeight} onValueChange={onFontWeightChange}>
                        <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder={t('text.weightPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {TOP_TEXT_FONT_STYLES.map((weightOption) => (
                                <SelectItem key={weightOption} value={weightOption}>{weightOption}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="pt-2 border-t border-border/30">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">{t('text.pathCurve')}</label>
                    
                    <div className="space-y-3">
                        <div className="space-y-2 pb-2 border-b border-border/30">
                            <div className="text-[10px] text-muted-foreground">{t('text.alignToPenPath')}</div>
                            <Select
                                value={selectedPathId || 'none'}
                                onValueChange={(val) => {
                                    if (val && val !== 'none') onAttachPath?.(val);
                                }}
                                disabled={pathOptions.length === 0}
                            >
                                <SelectTrigger className="w-full text-xs">
                                    <SelectValue placeholder={t('text.selectPenPath')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        {pathOptions.length === 0 ? 'No pen paths on canvas' : 'Select a pen path'}
                                    </SelectItem>
                                    {pathOptions.map((path) => (
                                        <SelectItem key={path.id} value={path.id}>
                                            {path.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {hasAttachedPath && (
                                <button
                                    onClick={onDetachPath}
                                    className="w-full px-2 py-1 text-[10px] rounded border border-border hover:bg-secondary transition-colors"
                                >
                                    {t('text.detachPath')}
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                             <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>{t('text.bend')}</span>
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
                                title={t('text.doubleClickReset')}
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                <span>{t('text.nudgeDown')}</span>
                                <span>{t('text.flat')}</span>
                                <span>{t('text.nudgeUp')}</span>
                            </div>
                        </div>

                        {curveStrength !== 0 && (
                            <div className="space-y-2 animate-in fade-in-50 duration-200">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>{t('text.curveCenter')}</span>
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
                                    title={t('text.doubleClickReset')}
                                />
                                <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                    <span>{t('text.nudgeLeft')}</span>
                                    <span>{t('text.center')}</span>
                                    <span>{t('text.nudgeRight')}</span>
                                </div>

                                <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                                    <span>{t('text.arcSpan')}</span>
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
                                    title={t('text.resetSpan')}
                                />
                                <div className="flex justify-between text-[9px] text-muted-foreground/50">
                                    <span>{t('text.narrow')}</span>
                                    <span>{t('text.halfCircle')}</span>
                                    <span>{t('text.fullCircle')}</span>
                                </div>
                            </div>
                        )}
                        
                        {/* Quick presets */}
                        <div className="flex gap-1 pt-1">
                            <button 
                                onClick={() => onCurveChange(0, 0, activeCurveSpan)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('text.flat')}
                            </button>
                            <button 
                                onClick={() => onCurveChange(50, 0, 180)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === 50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('text.arcUp')}
                            </button>
                            <button 
                                onClick={() => onCurveChange(-50, 0, 180)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${curveStrength === -50 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('text.arcDown')}
                            </button>
                            <button 
                                onClick={() => onCurveChange(100, 0, 359)}
                                className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${(curveStrength === 100 && activeCurveSpan >= 350) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
                            >
                                {t('text.circle')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Text Background Shape */}
                <div className="pt-2 mt-2 border-t border-border/30">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('text.backgroundShape')}</label>
                        <input
                            type="checkbox"
                            checked={textBgEnabled}
                            onChange={(e) => onTextBgEnabledChange?.(e.target.checked)}
                            className="h-3 w-3 accent-primary cursor-pointer"
                        />
                    </div>

                    {textBgEnabled && (
                        <div className="space-y-3 animate-in fade-in-50 duration-200">
                            {/* Color & Shape Preset Row */}
                            <div className="flex gap-2 items-center">
                                <div className="space-y-1 flex-1">
                                    <label className="text-[9px] text-muted-foreground">{t('text.backgroundColor')}</label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="color"
                                            value={textBgColor}
                                            onChange={(e) => onTextBgColorChange?.(e.target.value)}
                                            className="h-6 w-8 rounded border border-border cursor-pointer bg-transparent"
                                        />
                                        <span className="text-[10px] font-mono uppercase text-muted-foreground">{textBgColor}</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-1 flex-1">
                                    <label className="text-[9px] text-muted-foreground">{t('text.styleLabel')}</label>
                                    <Select 
                                        value={textBgStyle} 
                                        onValueChange={(val) => onTextBgStyleChange?.(val as 'rect' | 'pill' | 'speech')}
                                    >
                                        <SelectTrigger className="w-full text-xs">
                                            <SelectValue placeholder={t('text.stylePlaceholder')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="rect">{t('text.rectangle')}</SelectItem>
                                            <SelectItem value="pill">{t('text.pill')}</SelectItem>
                                            <SelectItem value="speech">{t('text.bubble')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Padding Slider */}
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>{t('text.padding')}</span>
                                    <span className="font-mono">{textBgPadding}px</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="80"
                                    value={textBgPadding}
                                    onChange={(e) => onTextBgPaddingChange?.(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>

                            {/* Corner Roundness Slider */}
                            {textBgStyle !== 'pill' && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>{t('text.roundness')}</span>
                                        <span className="font-mono">{textBgCorners}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="60"
                                        value={textBgCorners}
                                        onChange={(e) => onTextBgCornersChange?.(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

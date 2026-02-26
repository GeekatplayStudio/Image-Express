import React from 'react';
import { Check, SpellCheck } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type TextQuickBarProps = {
    visible: boolean;
    left: number;
    top: number;
    textOptions: {
        fontFamily: string;
        fontFamilies: string[];
        fontStyle: string;
        fontStyles: string[];
        fontSize: number;
        color: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        align: 'left' | 'center' | 'right' | 'justify';
        spellcheck: boolean;
    };
    onTextFontFamilyChange: (fontFamily: string) => void;
    onTextFontStyleChange: (fontStyle: string) => void;
    onTextFontSizeChange: (fontSize: number) => void;
    onTextColorChange: (color: string) => void;
    onTextBoldChange: (enabled: boolean) => void;
    onTextItalicChange: (enabled: boolean) => void;
    onTextUnderlineChange: (enabled: boolean) => void;
    onTextAlignChange: (align: 'left' | 'center' | 'right' | 'justify') => void;
    onTextSpellcheckChange: (enabled: boolean) => void;
};

export default function TextQuickBar({
    visible,
    left,
    top,
    textOptions,
    onTextFontFamilyChange,
    onTextFontStyleChange,
    onTextFontSizeChange,
    onTextColorChange,
    onTextBoldChange,
    onTextItalicChange,
    onTextUnderlineChange,
    onTextAlignChange,
    onTextSpellcheckChange,
}: TextQuickBarProps) {
    if (!visible) return null;

    return (
        <div
            className="fixed z-40 pointer-events-auto"
            style={{ left: `${left}px`, top: `${top}px`, transform: 'translateX(-50%)' }}
            data-testid="text-quick-bar"
        >
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
                <Select value={textOptions.fontFamily} onValueChange={onTextFontFamilyChange}>
                    <SelectTrigger
                        aria-label="Quick text font family"
                        className="h-8 min-w-[150px] rounded-lg border border-border/60 bg-secondary/30 px-2 text-xs"
                        style={{ fontFamily: textOptions.fontFamily }}
                    >
                        <SelectValue placeholder="Font" />
                    </SelectTrigger>
                    <SelectContent>
                        {textOptions.fontFamilies.map((font) => (
                            <SelectItem key={font} value={font}>{font}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <input
                    aria-label="Quick text font size"
                    type="number"
                    min={8}
                    max={240}
                    value={textOptions.fontSize}
                    onChange={(event) => onTextFontSizeChange(Number(event.target.value))}
                    className="h-8 w-20 rounded-lg border border-border/60 bg-secondary/30 px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />

                <select
                    aria-label="Quick text font style"
                    value={textOptions.fontStyle}
                    onChange={(event) => onTextFontStyleChange(event.target.value)}
                    className="h-8 w-[88px] rounded-lg border border-border/60 bg-secondary/30 px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                    {textOptions.fontStyles.map((style) => (
                        <option key={style} value={style}>{style}</option>
                    ))}
                </select>

                <input
                    aria-label="Quick text color"
                    type="color"
                    value={textOptions.color}
                    onChange={(event) => onTextColorChange(event.target.value)}
                    className="h-8 w-9 rounded-lg border border-border/60 bg-transparent p-0"
                />

                <div className="flex items-center overflow-hidden rounded-lg border border-border/60 bg-secondary/30">
                    <button
                        onClick={() => onTextBoldChange(!textOptions.bold)}
                        className={`h-8 w-8 text-xs font-bold ${textOptions.bold ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                        aria-label="Quick text bold"
                    >
                        B
                    </button>
                    <button
                        onClick={() => onTextItalicChange(!textOptions.italic)}
                        className={`h-8 w-8 border-l border-border/50 text-xs italic ${textOptions.italic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                        aria-label="Quick text italic"
                    >
                        I
                    </button>
                    <button
                        onClick={() => onTextUnderlineChange(!textOptions.underline)}
                        className={`h-8 w-8 border-l border-border/50 text-xs underline ${textOptions.underline ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                        aria-label="Quick text underline"
                    >
                        U
                    </button>
                </div>

                <select
                    aria-label="Quick text align"
                    value={textOptions.align}
                    onChange={(event) => onTextAlignChange(event.target.value as 'left' | 'center' | 'right' | 'justify')}
                    className="h-8 w-[84px] rounded-lg border border-border/60 bg-secondary/30 px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justify">Justify</option>
                </select>

                <button
                    onClick={() => onTextSpellcheckChange(!textOptions.spellcheck)}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs ${textOptions.spellcheck ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border/60 bg-secondary/30 text-muted-foreground'}`}
                    aria-label="Quick text spellcheck"
                    title="Spellcheck"
                >
                    <SpellCheck size={14} />
                    {textOptions.spellcheck && <Check size={12} />}
                </button>
            </div>
        </div>
    );
}

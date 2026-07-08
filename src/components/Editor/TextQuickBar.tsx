import React from 'react';

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

/**
 * Floating quick bar shown next to selected text. Intentionally minimal —
 * size, color, and emphasis only. Font family/style, alignment, and the rest
 * live in the top tool options bar and the properties panel, so repeating
 * them here just duplicated the UI in three places.
 */
export default function TextQuickBar({
    visible,
    left,
    top,
    textOptions,
    onTextFontSizeChange,
    onTextColorChange,
    onTextBoldChange,
    onTextItalicChange,
    onTextUnderlineChange,
}: TextQuickBarProps) {
    if (!visible) return null;

    return (
        <div
            className="fixed z-40 pointer-events-auto"
            style={{ left: `${left}px`, top: `${top}px`, transform: 'translateX(-50%)' }}
            data-testid="text-quick-bar"
        >
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
                <input
                    aria-label="Quick text font size"
                    type="number"
                    min={8}
                    max={240}
                    value={textOptions.fontSize}
                    onChange={(event) => onTextFontSizeChange(Number(event.target.value))}
                    className="h-8 w-16 rounded-lg border border-border/60 bg-secondary/30 px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />

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
            </div>
        </div>
    );
}

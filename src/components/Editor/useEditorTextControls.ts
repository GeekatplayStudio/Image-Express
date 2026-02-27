import { useCallback, useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';

import { normalizeColorValue, parseColorWithAlpha } from '@/lib/fabric-utils';
import { TOP_TEXT_FONT_FAMILIES, TOP_TEXT_FONT_STYLES } from '@/lib/typography';
import type { ExtendedFabricObject } from '@/types';

const TOP_TEXT_DEFAULT_SIZE = 40;

type TextAlign = 'left' | 'center' | 'right' | 'justify';

type UseEditorTextControlsArgs = {
    canvas: fabric.Canvas | null;
};

export function useEditorTextControls({ canvas }: UseEditorTextControlsArgs) {
    const [textTopFontFamily, setTextTopFontFamily] = useState(TOP_TEXT_FONT_FAMILIES[0]);
    const [textTopFontStyle, setTextTopFontStyle] = useState(TOP_TEXT_FONT_STYLES[0]);
    const [textTopFontSize, setTextTopFontSize] = useState(TOP_TEXT_DEFAULT_SIZE);
    const [textTopColor, setTextTopColor] = useState('#000000');
    const [textTopBold, setTextTopBold] = useState(false);
    const [textTopItalic, setTextTopItalic] = useState(false);
    const [textTopUnderline, setTextTopUnderline] = useState(false);
    const [textTopAlign, setTextTopAlign] = useState<TextAlign>('left');
    const [textTopSpellcheck, setTextTopSpellcheck] = useState(true);
    const [textQuickBarPos, setTextQuickBarPos] = useState<{ visible: boolean; left: number; top: number }>({
        visible: false,
        left: 0,
        top: 0,
    });

    useEffect(() => {
        if (!canvas) return;

        const toViewportPoint = (point: fabric.Point) => {
            const transform = canvas.viewportTransform || [1, 0, 0, 1, 0, 0] as fabric.TMat2D;
            return (fabric.util as unknown as { transformPoint: (p: fabric.Point, t: fabric.TMat2D) => fabric.Point }).transformPoint(point, transform);
        };

        const syncTextQuickBar = () => {
            const active = canvas.getActiveObject() as (fabric.Object & { type?: string }) | null;
            const isTextObject = active?.type === 'i-text' || active?.type === 'text' || active?.type === 'textbox';
            if (!active || !isTextObject) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const canvasElement = canvas.lowerCanvasEl;
            if (!canvasElement) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const coords = typeof active.getCoords === 'function' ? active.getCoords() : [];
            if (!Array.isArray(coords) || coords.length === 0) {
                setTextQuickBarPos({ visible: false, left: 0, top: 0 });
                return;
            }

            const viewportPoints = coords.map((coord) => toViewportPoint(new fabric.Point(coord.x, coord.y)));
            const minX = Math.min(...viewportPoints.map((point) => point.x));
            const maxX = Math.max(...viewportPoints.map((point) => point.x));
            const maxY = Math.max(...viewportPoints.map((point) => point.y));

            const canvasRect = canvasElement.getBoundingClientRect();
            const desiredLeft = canvasRect.left + ((minX + maxX) / 2);
            const desiredTop = canvasRect.top + maxY + 16;
            const clampedLeft = Math.max(190, Math.min(window.innerWidth - 190, desiredLeft));
            const clampedTop = Math.max(84, Math.min(window.innerHeight - 84, desiredTop));

            setTextQuickBarPos({ visible: true, left: clampedLeft, top: clampedTop });
        };

        syncTextQuickBar();

        canvas.on('selection:created', syncTextQuickBar);
        canvas.on('selection:updated', syncTextQuickBar);
        canvas.on('selection:cleared', syncTextQuickBar);
        canvas.on('object:modified', syncTextQuickBar);
        canvas.on('object:moving', syncTextQuickBar);
        canvas.on('object:scaling', syncTextQuickBar);
        canvas.on('object:rotating', syncTextQuickBar);

        const syncOnWindow = () => syncTextQuickBar();
        window.addEventListener('resize', syncOnWindow);
        window.addEventListener('scroll', syncOnWindow, true);

        return () => {
            canvas.off('selection:created', syncTextQuickBar);
            canvas.off('selection:updated', syncTextQuickBar);
            canvas.off('selection:cleared', syncTextQuickBar);
            canvas.off('object:modified', syncTextQuickBar);
            canvas.off('object:moving', syncTextQuickBar);
            canvas.off('object:scaling', syncTextQuickBar);
            canvas.off('object:rotating', syncTextQuickBar);
            window.removeEventListener('resize', syncOnWindow);
            window.removeEventListener('scroll', syncOnWindow, true);
            setTextQuickBarPos({ visible: false, left: 0, top: 0 });
        };
    }, [canvas]);

    useEffect(() => {
        if (!canvas) return;

        const syncTextFontFamily = () => {
            const active = canvas.getActiveObject() as (fabric.Object & {
                type?: string;
                fontFamily?: string;
                fontWeight?: string | number;
                fontStyle?: string;
                underline?: boolean;
                textAlign?: TextAlign;
                fill?: unknown;
            }) | null;
            if (!active) {
                setTextTopFontFamily(TOP_TEXT_FONT_FAMILIES[0]);
                setTextTopFontStyle(TOP_TEXT_FONT_STYLES[0]);
                setTextTopFontSize(TOP_TEXT_DEFAULT_SIZE);
                setTextTopColor('#000000');
                setTextTopBold(false);
                setTextTopItalic(false);
                setTextTopUnderline(false);
                setTextTopAlign('left');
                setTextTopSpellcheck(true);
                return;
            }
            const activeType = active.type;
            const isTextObject = activeType === 'i-text' || activeType === 'text' || activeType === 'textbox';
            if (!isTextObject) return;
            if (typeof active.fontFamily === 'string' && active.fontFamily.trim().length > 0) {
                setTextTopFontFamily(active.fontFamily);
            }
            if (typeof active.fontWeight === 'string' || typeof active.fontWeight === 'number') {
                setTextTopFontStyle(String(active.fontWeight));
                const normalizedWeight = String(active.fontWeight).toLowerCase();
                const numericWeight = Number(normalizedWeight);
                setTextTopBold(normalizedWeight === 'bold' || (!Number.isNaN(numericWeight) && numericWeight >= 600));
            }
            const activeWithFontSize = active as unknown as { fontSize?: number };
            if (typeof activeWithFontSize.fontSize === 'number') {
                setTextTopFontSize(Math.max(8, Math.round(activeWithFontSize.fontSize)));
            }
            if (typeof active.fill === 'string' && active.fill.trim().length > 0) {
                const { color } = parseColorWithAlpha(active.fill);
                const normalizedColor = normalizeColorValue(color);
                if (typeof normalizedColor === 'string' && normalizedColor.startsWith('#') && normalizedColor.length === 7) {
                    setTextTopColor(normalizedColor);
                }
            }
            setTextTopItalic(active.fontStyle === 'italic');
            setTextTopUnderline(Boolean(active.underline));
            if (active.textAlign) {
                setTextTopAlign(active.textAlign);
            }
            const activeExt = active as ExtendedFabricObject;
            setTextTopSpellcheck(activeExt.textSpellcheck !== false);
        };

        syncTextFontFamily();
        canvas.on('selection:created', syncTextFontFamily);
        canvas.on('selection:updated', syncTextFontFamily);
        canvas.on('selection:cleared', syncTextFontFamily);
        canvas.on('object:modified', syncTextFontFamily);
        return () => {
            canvas.off('selection:created', syncTextFontFamily);
            canvas.off('selection:updated', syncTextFontFamily);
            canvas.off('selection:cleared', syncTextFontFamily);
            canvas.off('object:modified', syncTextFontFamily);
        };
    }, [canvas]);

    const withActiveTextObject = useCallback((mutate: (active: fabric.Object & ExtendedFabricObject & {
        set: (props: unknown) => void;
        hiddenTextarea?: HTMLTextAreaElement;
    }) => void) => {
        if (!canvas) return;
        const active = canvas.getActiveObject() as (fabric.Object & ExtendedFabricObject & {
            type?: string;
            set: (props: unknown) => void;
            hiddenTextarea?: HTMLTextAreaElement;
        }) | null;
        if (!active) return;
        const isTextObject = active.type === 'i-text' || active.type === 'text' || active.type === 'textbox';
        if (!isTextObject) return;
        mutate(active);
        canvas.requestRenderAll();
        (canvas as unknown as { fire: (eventName: string, payload?: unknown) => void }).fire('object:modified', { target: active });
    }, [canvas]);

    const handleTextFontFamilyChange = useCallback((fontFamily: string) => {
        setTextTopFontFamily(fontFamily);
        withActiveTextObject((active) => {
            active.set({ fontFamily });
        });
    }, [withActiveTextObject]);

    const handleTextFontStyleChange = useCallback((fontStyle: string) => {
        setTextTopFontStyle(fontStyle);
        const normalizedWeight = String(fontStyle).toLowerCase();
        const numericWeight = Number(normalizedWeight);
        setTextTopBold(normalizedWeight === 'bold' || (!Number.isNaN(numericWeight) && numericWeight >= 600));
        withActiveTextObject((active) => {
            active.set({ fontWeight: fontStyle });
        });
    }, [withActiveTextObject]);

    const handleTextFontSizeChange = useCallback((fontSize: number) => {
        const normalizedSize = Math.max(8, Math.min(240, Math.round(fontSize)));
        setTextTopFontSize(normalizedSize);
        withActiveTextObject((active) => {
            active.set({ fontSize: normalizedSize });
        });
    }, [withActiveTextObject]);

    const handleTextColorChange = useCallback((color: string) => {
        const normalizedColor = normalizeColorValue(color);
        if (!normalizedColor || !normalizedColor.startsWith('#')) return;
        setTextTopColor(normalizedColor);
        withActiveTextObject((active) => {
            active.set({ fill: normalizedColor });
        });
    }, [withActiveTextObject]);

    const handleTextBoldChange = useCallback((enabled: boolean) => {
        setTextTopBold(enabled);
        const nextWeight = enabled ? 'bold' : 'normal';
        setTextTopFontStyle(nextWeight);
        withActiveTextObject((active) => {
            active.set({ fontWeight: nextWeight });
        });
    }, [withActiveTextObject]);

    const handleTextItalicChange = useCallback((enabled: boolean) => {
        setTextTopItalic(enabled);
        withActiveTextObject((active) => {
            active.set({ fontStyle: enabled ? 'italic' : 'normal' });
        });
    }, [withActiveTextObject]);

    const handleTextUnderlineChange = useCallback((enabled: boolean) => {
        setTextTopUnderline(enabled);
        withActiveTextObject((active) => {
            active.set({ underline: enabled });
        });
    }, [withActiveTextObject]);

    const handleTextAlignChange = useCallback((align: TextAlign) => {
        setTextTopAlign(align);
        withActiveTextObject((active) => {
            active.set({ textAlign: align });
        });
    }, [withActiveTextObject]);

    const handleTextSpellcheckChange = useCallback((enabled: boolean) => {
        setTextTopSpellcheck(enabled);
        withActiveTextObject((active) => {
            active.textSpellcheck = enabled;
            active.set({ textSpellcheck: enabled });
            if (active.hiddenTextarea) {
                active.hiddenTextarea.spellcheck = enabled;
            }
        });
    }, [withActiveTextObject]);

    const textOptions = useMemo(() => ({
        fontFamily: textTopFontFamily,
        fontFamilies: TOP_TEXT_FONT_FAMILIES,
        fontStyle: textTopFontStyle,
        fontStyles: TOP_TEXT_FONT_STYLES,
        fontSize: textTopFontSize,
        color: textTopColor,
        bold: textTopBold,
        italic: textTopItalic,
        underline: textTopUnderline,
        align: textTopAlign,
        spellcheck: textTopSpellcheck,
    }), [
        textTopAlign,
        textTopBold,
        textTopColor,
        textTopFontFamily,
        textTopFontSize,
        textTopFontStyle,
        textTopItalic,
        textTopSpellcheck,
        textTopUnderline,
    ]);

    const setSampledTextColor = useCallback((color: string) => {
        setTextTopColor(color);
    }, []);

    return {
        textQuickBarPos,
        textOptions,
        setSampledTextColor,
        handleTextFontFamilyChange,
        handleTextFontStyleChange,
        handleTextFontSizeChange,
        handleTextColorChange,
        handleTextBoldChange,
        handleTextItalicChange,
        handleTextUnderlineChange,
        handleTextAlignChange,
        handleTextSpellcheckChange,
    };
}

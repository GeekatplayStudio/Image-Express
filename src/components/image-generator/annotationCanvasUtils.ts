import type { AnnotationRecord } from '@/lib/agentic-edit/types';

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const wrapCanvasText = (
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] => {
    const rawLines = text.split(/\r?\n/);
    const wrapped: string[] = [];

    for (const rawLine of rawLines) {
        const words = rawLine.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            wrapped.push('');
            continue;
        }

        let current = words[0];
        for (let index = 1; index < words.length; index += 1) {
            const next = `${current} ${words[index]}`;
            if (context.measureText(next).width <= maxWidth) {
                current = next;
            } else {
                wrapped.push(current);
                current = words[index];
            }
        }
        wrapped.push(current);
    }

    return wrapped.length > 0 ? wrapped : [''];
};

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
};

export const readBoxGeometry = (geometry: AnnotationRecord['geometry']): { x: number; y: number; w: number; h: number } => {
    if ('w' in geometry && 'h' in geometry) {
        return {
            x: clamp01(typeof geometry.x === 'number' ? geometry.x : 0),
            y: clamp01(typeof geometry.y === 'number' ? geometry.y : 0),
            w: clamp01(typeof geometry.w === 'number' ? geometry.w : 1),
            h: clamp01(typeof geometry.h === 'number' ? geometry.h : 1),
        };
    }

    if ('points' in geometry && Array.isArray(geometry.points) && geometry.points.length > 0) {
        const xs = geometry.points.map((point) => clamp01(point.x));
        const ys = geometry.points.map((point) => clamp01(point.y));
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return {
            x: minX,
            y: minY,
            w: clamp01(maxX - minX),
            h: clamp01(maxY - minY),
        };
    }

    if ('x' in geometry && 'y' in geometry) {
        return {
            x: clamp01(typeof geometry.x === 'number' ? geometry.x : 0.5),
            y: clamp01(typeof geometry.y === 'number' ? geometry.y : 0.5),
            w: 0.12,
            h: 0.12,
        };
    }

    return { x: 0, y: 0, w: 1, h: 1 };
};

export const renderAnnotationShape = (
    context: CanvasRenderingContext2D,
    annotation: AnnotationRecord,
    width: number,
    height: number,
    options: { fillStyle: string; strokeStyle: string; lineWidth: number },
) => {
    const lineWidth = Math.max(1, options.lineWidth);
    context.lineWidth = lineWidth;
    context.strokeStyle = options.strokeStyle;
    context.fillStyle = options.fillStyle;

    if (annotation.type === 'point') {
        const point = annotation.geometry as { x: number; y: number };
        const x = clamp01(point.x) * width;
        const y = clamp01(point.y) * height;
        const radius = Math.max(4, Math.round(Math.min(width, height) * 0.01));
        const tail = Math.max(16, Math.round(Math.min(width, height) * 0.04));

        context.beginPath();
        context.moveTo(x - tail, y - tail);
        context.lineTo(x - radius * 0.6, y - radius * 0.6);
        context.stroke();

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - radius * 1.7, y - radius * 0.7);
        context.lineTo(x - radius * 0.7, y - radius * 1.7);
        context.closePath();
        context.fill();
        context.stroke();

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        return;
    }

    if (annotation.type === 'polygon' || annotation.type === 'pose') {
        const points = (annotation.geometry as { points: Array<{ x: number; y: number }> }).points || [];
        if (points.length === 0) {
            return;
        }

        context.beginPath();
        context.moveTo(clamp01(points[0].x) * width, clamp01(points[0].y) * height);
        for (let index = 1; index < points.length; index += 1) {
            context.lineTo(clamp01(points[index].x) * width, clamp01(points[index].y) * height);
        }
        if (annotation.type === 'polygon') {
            context.closePath();
            context.fill();
        }
        context.stroke();
        return;
    }

    if (annotation.type === 'brush') {
        const brush = annotation.geometry as { strokes?: Array<{ points: Array<{ x: number; y: number }>; size: number }> };
        const strokes = brush.strokes || [];
        for (const stroke of strokes) {
            if (!stroke.points || stroke.points.length === 0) continue;
            context.lineWidth = Math.max(2, Math.round(stroke.size * Math.min(width, height)));
            context.beginPath();
            context.moveTo(clamp01(stroke.points[0].x) * width, clamp01(stroke.points[0].y) * height);
            for (let index = 1; index < stroke.points.length; index += 1) {
                context.lineTo(clamp01(stroke.points[index].x) * width, clamp01(stroke.points[index].y) * height);
            }
            context.stroke();
        }
        return;
    }

    const box = readBoxGeometry(annotation.geometry);
    const x = box.x * width;
    const y = box.y * height;
    const w = Math.max(1, box.w * width);
    const h = Math.max(1, box.h * height);
    context.fillRect(x, y, w, h);
    context.strokeRect(x, y, w, h);
};

export const buildAnnotationLayerArtifacts = async (
    annotations: AnnotationRecord[],
    width: number,
    height: number,
): Promise<{ notesOverlayFile: File; combinedMaskFile: File }> => {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));

    const notesCanvas = document.createElement('canvas');
    notesCanvas.width = safeWidth;
    notesCanvas.height = safeHeight;
    const notesContext = notesCanvas.getContext('2d');
    if (!notesContext) {
        throw new Error('Failed to create notes overlay context.');
    }

    notesContext.clearRect(0, 0, safeWidth, safeHeight);

    const enabled = annotations.filter((annotation) => annotation.enabled);
    for (let index = 0; index < enabled.length; index += 1) {
        const annotation = enabled[index];
        renderAnnotationShape(notesContext, annotation, safeWidth, safeHeight, {
            fillStyle: 'rgba(255, 64, 64, 0.20)',
            strokeStyle: 'rgba(255, 64, 64, 0.95)',
            lineWidth: 2,
        });

        const box = readBoxGeometry(annotation.geometry);
        const labelX = Math.max(8, Math.round(box.x * safeWidth) + 4);
        const labelY = Math.max(12, Math.round(box.y * safeHeight) + 12);
        notesContext.fillStyle = 'rgba(255, 255, 255, 0.95)';
        notesContext.font = '12px sans-serif';
        notesContext.fillText(`${index + 1}`, labelX, labelY);
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = safeWidth;
    maskCanvas.height = safeHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) {
        throw new Error('Failed to create combined mask context.');
    }

    maskContext.fillStyle = '#000000';
    maskContext.fillRect(0, 0, safeWidth, safeHeight);

    for (const annotation of enabled) {
        renderAnnotationShape(maskContext, annotation, safeWidth, safeHeight, {
            fillStyle: '#ffffff',
            strokeStyle: '#ffffff',
            lineWidth: 3,
        });
    }

    return {
        notesOverlayFile: await dataUrlToFile(notesCanvas.toDataURL('image/png'), `notes-overlay-${Date.now()}.png`),
        combinedMaskFile: await dataUrlToFile(maskCanvas.toDataURL('image/png'), `combined-mask-${Date.now()}.png`),
    };
};

export const buildAnnotatedReferenceLayerDataUrl = async (
    baseImageDataUrl: string,
    annotations: AnnotationRecord[],
    width: number,
    height: number,
): Promise<string> => {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));

    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to load base image for reference notes layer.'));
        image.src = baseImageDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to create reference layer canvas context.');
    }

    context.clearRect(0, 0, safeWidth, safeHeight);
    context.drawImage(image, 0, 0, safeWidth, safeHeight);

    const activeAnnotations = annotations.filter((annotation) => annotation.enabled);
    activeAnnotations.forEach((annotation, index) => {
        renderAnnotationShape(context, annotation, safeWidth, safeHeight, {
            fillStyle: 'rgba(47, 126, 255, 0.22)',
            strokeStyle: 'rgba(47, 126, 255, 0.98)',
            lineWidth: 3,
        });

        const box = readBoxGeometry(annotation.geometry);
        const labelX = Math.max(10, Math.round(box.x * safeWidth) + 6);
        const labelY = Math.max(18, Math.round(box.y * safeHeight) + 18);
        const noteTitle = `${index + 1}. ${annotation.instruction.trim() || annotation.type}`;

        context.font = '12px sans-serif';
        const maxLabelWidth = Math.max(140, Math.round(safeWidth * 0.42));
        const wrappedLines = wrapCanvasText(context, noteTitle, maxLabelWidth);
        const longestLineWidth = wrappedLines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
        const lineHeight = 14;
        const paddingX = 6;
        const paddingY = 5;
        const boxWidth = Math.max(32, Math.min(safeWidth - 12, Math.round(longestLineWidth + paddingX * 2)));
        const boxHeight = Math.max(20, wrappedLines.length * lineHeight + paddingY * 2);

        context.fillStyle = 'rgba(12, 15, 26, 0.82)';
        context.fillRect(labelX - 4, labelY - 14, boxWidth, boxHeight);

        context.fillStyle = 'rgba(255, 255, 255, 0.98)';
        wrappedLines.forEach((line, lineIndex) => {
            context.fillText(line, labelX, labelY + lineIndex * lineHeight);
        });
    });

    return canvas.toDataURL('image/png');
};
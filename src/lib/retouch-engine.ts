import * as fabric from 'fabric';

export type RetouchBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type RetouchProfileMode =
    | 'clone'
    | 'healing'
    | 'spot-healing'
    | 'remove'
    | 'history'
    | 'blur'
    | 'sharpen'
    | 'dodge'
    | 'burn'
    | 'sponge';

type RetouchBrushProfileInput = {
    mode: RetouchProfileMode;
    size: number;
    hardness?: number;
    strength?: number;
    exposure?: number;
    protectTones?: boolean;
};

export type RetouchBrushProfile = {
    size: number;
    opacity: number;
    maskHardness: number;
    spacing: number;
    blurPx: number;
    sharpenAmount: number;
    compositeOperation: GlobalCompositeOperation;
    secondaryPass: {
        opacity: number;
        blurPx: number;
        compositeOperation: GlobalCompositeOperation;
    } | null;
};

const normalizePercent = (value: number | undefined, fallback: number) => (
    clamp(Number.isFinite(value) ? Number(value) : fallback, 0, 100) / 100
);

export const computeRetouchBrushProfile = ({
    mode,
    size,
    hardness,
    strength,
    exposure,
    protectTones = false,
}: RetouchBrushProfileInput): RetouchBrushProfile => {
    const normalizedSize = Math.max(1, Number.isFinite(size) ? Number(size) : 1);
    const normalizedHardness = normalizePercent(hardness, 50);
    const normalizedStrength = normalizePercent(strength, 50);
    const normalizedExposure = normalizePercent(exposure, 30);

    if (mode === 'clone') {
        const sizeDamping = clamp(1 - (Math.log2(Math.max(1, normalizedSize / 24)) * 0.06), 0.78, 1);
        const opacity = (0.18 + (0.8 * Math.pow(normalizedHardness, 0.85))) * sizeDamping;
        const maskHardness = 24 + (normalizedHardness * 76);
        return {
            size: normalizedSize,
            opacity,
            maskHardness,
            spacing: Math.max(1, normalizedSize * 0.24),
            blurPx: 0,
            sharpenAmount: 0,
            compositeOperation: 'source-over',
            secondaryPass: null,
        };
    }

    if (mode === 'healing' || mode === 'spot-healing' || mode === 'remove') {
        const sizeSoftening = clamp((normalizedSize - 24) / 180, 0, 0.35);
        const opacity = (0.22 + (0.66 * Math.pow(normalizedHardness, 0.7))) * (1 - (sizeSoftening * 0.28));
        const softness = 1 - normalizedHardness;
        const blurPx = 0.85 + (softness * 4.4) + (sizeSoftening * 1.4);
        const maskHardness = 16 + (normalizedHardness * 70);
        const detailOpacity = clamp(opacity * (0.34 + (normalizedHardness * 0.18)), 0, 0.45);
        return {
            size: normalizedSize,
            opacity,
            maskHardness,
            spacing: Math.max(1, normalizedSize * (0.18 + (softness * 0.2))),
            blurPx,
            sharpenAmount: 0,
            compositeOperation: 'source-over',
            secondaryPass: {
                opacity: detailOpacity,
                blurPx: 0.25 + (softness * 0.75),
                compositeOperation: 'soft-light',
            },
        };
    }

    if (mode === 'history') {
        const opacity = 0.2 + (0.7 * Math.pow(normalizedHardness, 0.75));
        const maskHardness = 20 + (normalizedHardness * 72);
        return {
            size: normalizedSize,
            opacity,
            maskHardness,
            spacing: Math.max(1, normalizedSize * 0.24),
            blurPx: 0,
            sharpenAmount: 0,
            compositeOperation: 'source-over',
            secondaryPass: null,
        };
    }

    if (mode === 'blur') {
        const opacity = 0.1 + (0.62 * Math.pow(normalizedStrength, 0.7));
        const blurPx = 1 + (7.6 * Math.pow(normalizedStrength, 1.12));
        const maskHardness = 22 + ((1 - normalizedStrength) * 44);
        return {
            size: normalizedSize,
            opacity,
            maskHardness,
            spacing: Math.max(1, normalizedSize * (0.12 + ((1 - normalizedStrength) * 0.22))),
            blurPx,
            sharpenAmount: 0,
            compositeOperation: 'source-over',
            secondaryPass: null,
        };
    }

    if (mode === 'sharpen') {
        const sizeAttenuation = clamp(1 - (Math.log2(Math.max(1, normalizedSize / 28)) * 0.14), 0.65, 1);
        const opacity = (0.14 + (0.64 * Math.pow(normalizedStrength, 0.72))) * sizeAttenuation;
        const sharpenAmount = (0.35 + (normalizedStrength * 2.65)) * sizeAttenuation;
        const maskHardness = 34 + (normalizedStrength * 46);
        return {
            size: normalizedSize,
            opacity,
            maskHardness,
            spacing: Math.max(1, normalizedSize * (0.17 + ((1 - normalizedStrength) * 0.09))),
            blurPx: 0,
            sharpenAmount,
            compositeOperation: 'source-over',
            secondaryPass: null,
        };
    }

    const dodgeOpacityBase = 0.08 + (0.4 * Math.pow(normalizedExposure, 0.82));
    const opacity = protectTones ? dodgeOpacityBase * 0.62 : dodgeOpacityBase;
    const maskHardness = protectTones ? 68 : 42;
    return {
        size: normalizedSize,
        opacity,
        maskHardness,
        spacing: Math.max(1, normalizedSize * (protectTones ? 0.28 : 0.22)),
        blurPx: 0,
        sharpenAmount: 0,
        compositeOperation: mode === 'burn' ? 'multiply' : (mode === 'sponge' ? 'source-over' : 'screen'),
        secondaryPass: null,
    };
};

export const toLocalRetouchPoint = (scenePoint: fabric.Point, bounds: RetouchBounds) => (
    new fabric.Point(scenePoint.x - bounds.left, scenePoint.y - bounds.top)
);

export const isLocalPointInsideBounds = (point: fabric.Point, bounds: RetouchBounds) => (
    point.x >= 0
    && point.y >= 0
    && point.x <= bounds.width
    && point.y <= bounds.height
);

export const interpolateStrokePoints = (from: fabric.Point, to: fabric.Point, spacing: number) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const normalizedSpacing = Math.max(0.5, spacing);

    if (distance <= normalizedSpacing) {
        return [to];
    }

    const steps = Math.max(1, Math.ceil(distance / normalizedSpacing));
    const points: fabric.Point[] = [];
    for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        points.push(new fabric.Point(from.x + (dx * t), from.y + (dy * t)));
    }
    return points;
};

export const createSoftBrushMask = (size: number, hardness: number) => {
    const diameter = Math.max(2, Math.round(size));
    const mask = document.createElement('canvas');
    mask.width = diameter;
    mask.height = diameter;

    const ctx = mask.getContext('2d');
    if (!ctx) return null;

    const radius = diameter / 2;
    const edgeFalloff = clamp(hardness, 0, 100) / 100;
    const innerRadius = radius * edgeFalloff;
    const gradient = ctx.createRadialGradient(radius, radius, innerRadius, radius, radius, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();
    return mask;
};

type StampSourceParams = {
    sourceCanvas: HTMLCanvasElement;
    destinationCtx: CanvasRenderingContext2D;
    sourcePoint: fabric.Point;
    destinationPoint: fabric.Point;
    size: number;
    opacity: number;
    blurPx?: number;
    maskCanvas?: HTMLCanvasElement | null;
    compositeOperation?: GlobalCompositeOperation;
};

export const stampFromSource = ({
    sourceCanvas,
    destinationCtx,
    sourcePoint,
    destinationPoint,
    size,
    opacity,
    blurPx = 0,
    maskCanvas,
    compositeOperation = 'source-over',
}: StampSourceParams) => {
    const diameter = Math.max(2, Math.round(size));
    const radius = diameter / 2;

    const temp = document.createElement('canvas');
    temp.width = diameter;
    temp.height = diameter;
    const tempCtx = temp.getContext('2d');
    if (!tempCtx) return false;

    const sourceX = sourcePoint.x - radius;
    const sourceY = sourcePoint.y - radius;

    if (blurPx > 0) {
        tempCtx.filter = `blur(${blurPx}px)`;
    }
    tempCtx.drawImage(sourceCanvas, sourceX, sourceY, diameter, diameter, 0, 0, diameter, diameter);
    tempCtx.filter = 'none';

    if (maskCanvas) {
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(maskCanvas, 0, 0, diameter, diameter, 0, 0, diameter, diameter);
        tempCtx.globalCompositeOperation = 'source-over';
    }

    destinationCtx.save();
    destinationCtx.globalCompositeOperation = compositeOperation;
    destinationCtx.globalAlpha = clamp(opacity, 0, 1);
    destinationCtx.drawImage(temp, destinationPoint.x - radius, destinationPoint.y - radius);
    destinationCtx.restore();
    return true;
};

type DodgeStampParams = {
    destinationCtx: CanvasRenderingContext2D;
    destinationPoint: fabric.Point;
    size: number;
    opacity: number;
    protectTones: boolean;
    maskCanvas?: HTMLCanvasElement | null;
};

export const stampDodge = ({
    destinationCtx,
    destinationPoint,
    size,
    opacity,
    protectTones,
    maskCanvas,
}: DodgeStampParams) => {
    const diameter = Math.max(2, Math.round(size));
    const radius = diameter / 2;
    const temp = document.createElement('canvas');
    temp.width = diameter;
    temp.height = diameter;
    const tempCtx = temp.getContext('2d');
    if (!tempCtx) return false;

    const gradient = tempCtx.createRadialGradient(radius, radius, radius * 0.25, radius, radius, radius);
    const coreOpacity = clamp(opacity, 0, 1);
    const edgeOpacity = protectTones ? coreOpacity * 0.12 : coreOpacity * 0.22;
    gradient.addColorStop(0, `rgba(255,255,255,${coreOpacity})`);
    gradient.addColorStop(1, `rgba(255,255,255,${edgeOpacity})`);

    tempCtx.fillStyle = gradient;
    tempCtx.beginPath();
    tempCtx.arc(radius, radius, radius, 0, Math.PI * 2);
    tempCtx.fill();

    if (maskCanvas) {
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(maskCanvas, 0, 0, diameter, diameter, 0, 0, diameter, diameter);
        tempCtx.globalCompositeOperation = 'source-over';
    }

    destinationCtx.save();
    destinationCtx.globalCompositeOperation = 'screen';
    destinationCtx.drawImage(temp, destinationPoint.x - radius, destinationPoint.y - radius);
    destinationCtx.restore();
    return true;
};

type SharpenStampParams = {
    sourceCanvas: HTMLCanvasElement;
    destinationCtx: CanvasRenderingContext2D;
    sourcePoint: fabric.Point;
    destinationPoint: fabric.Point;
    size: number;
    opacity: number;
    amount?: number;
    maskCanvas?: HTMLCanvasElement | null;
};

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const stampSharpen = ({
    sourceCanvas,
    destinationCtx,
    sourcePoint,
    destinationPoint,
    size,
    opacity,
    amount = 1,
    maskCanvas,
}: SharpenStampParams) => {
    const diameter = Math.max(2, Math.round(size));
    const radius = diameter / 2;
    const sharpenAmount = Math.max(0, amount);

    const original = document.createElement('canvas');
    original.width = diameter;
    original.height = diameter;
    const originalCtx = original.getContext('2d');
    if (!originalCtx) return false;

    const sourceX = sourcePoint.x - radius;
    const sourceY = sourcePoint.y - radius;
    originalCtx.drawImage(sourceCanvas, sourceX, sourceY, diameter, diameter, 0, 0, diameter, diameter);

    const blurred = document.createElement('canvas');
    blurred.width = diameter;
    blurred.height = diameter;
    const blurredCtx = blurred.getContext('2d');
    if (!blurredCtx) return false;

    const blurPx = Math.max(0.8, 0.9 + (sharpenAmount * 0.2));
    blurredCtx.filter = `blur(${blurPx}px)`;
    blurredCtx.drawImage(original, 0, 0);
    blurredCtx.filter = 'none';

    const output = document.createElement('canvas');
    output.width = diameter;
    output.height = diameter;
    const outputCtx = output.getContext('2d');
    if (!outputCtx) return false;

    try {
        const originalData = originalCtx.getImageData(0, 0, diameter, diameter);
        const blurredData = blurredCtx.getImageData(0, 0, diameter, diameter);
        const outData = outputCtx.createImageData(diameter, diameter);
        const strength = 1 + sharpenAmount;

        for (let i = 0; i < originalData.data.length; i += 4) {
            const r = originalData.data[i] ?? 0;
            const g = originalData.data[i + 1] ?? 0;
            const b = originalData.data[i + 2] ?? 0;
            const a = originalData.data[i + 3] ?? 0;

            const br = blurredData.data[i] ?? 0;
            const bg = blurredData.data[i + 1] ?? 0;
            const bb = blurredData.data[i + 2] ?? 0;

            outData.data[i] = clampChannel((r * strength) - (br * sharpenAmount));
            outData.data[i + 1] = clampChannel((g * strength) - (bg * sharpenAmount));
            outData.data[i + 2] = clampChannel((b * strength) - (bb * sharpenAmount));
            outData.data[i + 3] = a;
        }

        outputCtx.putImageData(outData, 0, 0);
    } catch {
        return false;
    }

    if (maskCanvas) {
        outputCtx.globalCompositeOperation = 'destination-in';
        outputCtx.drawImage(maskCanvas, 0, 0, diameter, diameter, 0, 0, diameter, diameter);
        outputCtx.globalCompositeOperation = 'source-over';
    }

    destinationCtx.save();
    destinationCtx.globalAlpha = clamp(opacity, 0, 1);
    destinationCtx.drawImage(output, destinationPoint.x - radius, destinationPoint.y - radius);
    destinationCtx.restore();
    return true;
};

type ResolveNextCloneSourcePointParams = {
    aligned: boolean;
    strokeMutated: boolean;
    endPoint: fabric.Point | null;
    cloneOffset: fabric.Point | null;
};

export const resolveNextCloneSourcePoint = ({
    aligned,
    strokeMutated,
    endPoint,
    cloneOffset,
}: ResolveNextCloneSourcePointParams): fabric.Point | null => {
    if (!aligned || !strokeMutated || !endPoint || !cloneOffset) {
        return null;
    }
    return new fabric.Point(endPoint.x + cloneOffset.x, endPoint.y + cloneOffset.y);
};

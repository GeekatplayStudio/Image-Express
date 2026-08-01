import * as fabric from 'fabric';
import { BrandProfile } from './brandProfile';

export interface BoundingBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface BrandViolation {
    id: string;
    category: 'typography' | 'color' | 'layout' | 'logo' | 'asset';
    severity: 'high' | 'medium' | 'low';
    message: string;
    suggestion: string;
    layerId?: string;
    layerName?: string;
    boundingBox?: BoundingBox;
}

export interface BrandAuditReport {
    timestamp: string;
    profileName: string;
    overallScore: number; // 0 - 100
    status: 'pass' | 'warning' | 'fail';
    violations: BrandViolation[];
    summary: string;
}

export interface CanvasLayerSummary {
    id: string;
    name?: string;
    type: string;
    left: number;
    top: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    fontFamily?: string;
    fontSize?: number;
    text?: string;
}

export interface CanvasMetadataSummary {
    canvasWidth: number;
    canvasHeight: number;
    layerCount: number;
    layers: CanvasLayerSummary[];
}

export function extractCanvasMetadata(canvas: fabric.Canvas): CanvasMetadataSummary {
    const objects = canvas.getObjects();
    const artboard = (canvas as unknown as { artboard?: { width: number; height: number } }).artboard;
    const width = artboard?.width || canvas.getWidth() || 800;
    const height = artboard?.height || canvas.getHeight() || 600;

    const layers: CanvasLayerSummary[] = objects.map((obj, index) => {
        const bounds = obj.getBoundingRect();
        const customObj = obj as fabric.Object & {
            id?: string;
            name?: string;
            text?: string;
            fontFamily?: string;
            fontSize?: number;
            fill?: string | fabric.TFiller;
            stroke?: string;
        };

        const fillStr = typeof customObj.fill === 'string' ? customObj.fill : undefined;

        return {
            id: customObj.id || `layer-${index + 1}`,
            name: customObj.name || `${obj.type} #${index + 1}`,
            type: obj.type || 'object',
            left: Math.round(bounds.left),
            top: Math.round(bounds.top),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            fill: fillStr,
            stroke: typeof customObj.stroke === 'string' ? customObj.stroke : undefined,
            fontFamily: customObj.fontFamily,
            fontSize: customObj.fontSize,
            text: customObj.text,
        };
    });

    return {
        canvasWidth: width,
        canvasHeight: height,
        layerCount: layers.length,
        layers,
    };
}

function normalizeHexColor(color?: string): string | null {
    if (!color || typeof color !== 'string') return null;
    const cleaned = color.trim().toLowerCase();
    if (cleaned.startsWith('#')) {
        if (cleaned.length === 4) {
            return `#${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}${cleaned[3]}${cleaned[3]}`;
        }
        return cleaned;
    }
    if (cleaned.startsWith('rgb')) {
        // Simple RGB parser if needed
        return cleaned;
    }
    return cleaned;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
    const normalized = normalizeHexColor(color);
    if (!normalized || !normalized.startsWith('#') || normalized.length !== 7) return null;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b };
}

/** WCAG relative luminance; null for non-hex inputs. */
export function relativeLuminance(color: string): number | null {
    const rgb = hexToRgb(color);
    if (!rgb) return null;
    const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio between two hex colors; null when either is not hex. */
export function contrastRatio(colorA: string, colorB: string): number | null {
    const la = relativeLuminance(colorA);
    const lb = relativeLuminance(colorB);
    if (la === null || lb === null) return null;
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Closest allowed brand color by RGB distance; falls back to the first allowed color. */
export function nearestPaletteColor(color: string, allowedColors: string[]): string {
    const target = hexToRgb(color);
    const candidates = allowedColors
        .map((c) => ({ hex: c, rgb: hexToRgb(c) }))
        .filter((c): c is { hex: string; rgb: { r: number; g: number; b: number } } => c.rgb !== null);
    if (!target || candidates.length === 0) return allowedColors[0] || '#000000';

    let best = candidates[0];
    let bestDistance = Infinity;
    for (const candidate of candidates) {
        const distance =
            (candidate.rgb.r - target.r) ** 2 +
            (candidate.rgb.g - target.g) ** 2 +
            (candidate.rgb.b - target.b) ** 2;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    }
    return best.hex;
}

export function runHeuristicBrandAudit(
    metadata: CanvasMetadataSummary,
    profile: BrandProfile
): BrandAuditReport {
    const violations: BrandViolation[] = [];
    const { typography, palette, layout } = profile;

    const allowedFontsLower = (typography.allowedFonts || []).map((f) => f.toLowerCase());
    const allowedColorsNormalized = (palette.allowedColors || [])
        .map((c) => normalizeHexColor(c))
        .filter((c): c is string => c !== null);

    metadata.layers.forEach((layer) => {
        const box: BoundingBox = {
            left: layer.left,
            top: layer.top,
            width: layer.width,
            height: layer.height,
        };

        // 1. Typography checks
        if (layer.fontFamily) {
            const fontLower = layer.fontFamily.toLowerCase();
            const fontMatched = allowedFontsLower.some((af) => fontLower.includes(af));
            if (!fontMatched) {
                violations.push({
                    id: `viol-font-${layer.id}`,
                    category: 'typography',
                    severity: 'medium',
                    message: `Font "${layer.fontFamily}" on layer "${layer.name}" is not an approved brand font.`,
                    suggestion: `Switch to approved font "${typography.primaryFont}" or "${typography.secondaryFont}".`,
                    layerId: layer.id,
                    layerName: layer.name,
                    boundingBox: box,
                });
            }
        }

        if (layer.fontSize && layer.fontSize < typography.minBodySize) {
            violations.push({
                id: `viol-fontsize-${layer.id}`,
                category: 'typography',
                severity: 'low',
                message: `Text size (${layer.fontSize}px) on "${layer.name}" is below minimum body font size (${typography.minBodySize}px).`,
                suggestion: `Increase font size to at least ${typography.minBodySize}px.`,
                layerId: layer.id,
                layerName: layer.name,
                boundingBox: box,
            });
        }

        // 2. Color palette checks
        if (layer.fill && allowedColorsNormalized.length > 0) {
            const normFill = normalizeHexColor(layer.fill);
            if (normFill && normFill.startsWith('#')) {
                const colorMatched = allowedColorsNormalized.some((ac) => ac === normFill);
                if (!colorMatched) {
                    violations.push({
                        id: `viol-color-${layer.id}`,
                        category: 'color',
                        severity: 'medium',
                        message: `Color "${layer.fill}" on layer "${layer.name}" is outside the approved palette.`,
                        suggestion: `Use brand primary (${palette.primary}), secondary (${palette.secondary}), or accent (${palette.accent}).`,
                        layerId: layer.id,
                        layerName: layer.name,
                        boundingBox: box,
                    });
                }
            }
        }

        // 3. Margin checks
        if (layout.minMargin > 0) {
            if (
                layer.left < layout.minMargin ||
                layer.top < layout.minMargin ||
                layer.left + layer.width > metadata.canvasWidth - layout.minMargin ||
                layer.top + layer.height > metadata.canvasHeight - layout.minMargin
            ) {
                violations.push({
                    id: `viol-margin-${layer.id}`,
                    category: 'layout',
                    severity: 'low',
                    message: `Layer "${layer.name}" breaches minimum outer margin (${layout.minMargin}px).`,
                    suggestion: `Move layer inward to maintain at least ${layout.minMargin}px margin from canvas edge.`,
                    layerId: layer.id,
                    layerName: layer.name,
                    boundingBox: box,
                });
            }
        }

        // 4. Contrast check for text layers against the brand background color
        if (layer.text !== undefined && layer.fill && layout.contrastRatioMin > 0) {
            const ratio = contrastRatio(layer.fill, profile.palette.background);
            if (ratio !== null && ratio < layout.contrastRatioMin) {
                violations.push({
                    id: `viol-contrast-${layer.id}`,
                    category: 'layout',
                    severity: 'high',
                    message: `Text "${layer.name}" has contrast ratio ${ratio.toFixed(1)}:1 against the brand background — below the required ${layout.contrastRatioMin}:1.`,
                    suggestion: `Use a higher-contrast fill such as ${relativeLuminance(profile.palette.background)! > 0.5 ? profile.palette.secondary : '#ffffff'}.`,
                    layerId: layer.id,
                    layerName: layer.name,
                    boundingBox: box,
                });
            }
        }

        // 5. Logo placement rules for layers named like a logo
        if ((layer.name || '').toLowerCase().includes('logo')) {
            const { requiredPosition, minWidth } = profile.logo;
            if (minWidth > 0 && layer.width < minWidth) {
                violations.push({
                    id: `viol-logo-size-${layer.id}`,
                    category: 'logo',
                    severity: 'medium',
                    message: `Logo "${layer.name}" is ${layer.width}px wide — below the minimum logo width of ${minWidth}px.`,
                    suggestion: `Scale the logo to at least ${minWidth}px wide.`,
                    layerId: layer.id,
                    layerName: layer.name,
                    boundingBox: box,
                });
            }
            if (requiredPosition !== 'any') {
                const centerX = layer.left + layer.width / 2;
                const centerY = layer.top + layer.height / 2;
                const inLeft = centerX < metadata.canvasWidth / 2;
                const inTop = centerY < metadata.canvasHeight / 2;
                const actual = `${inTop ? 'top' : 'bottom'}-${inLeft ? 'left' : 'right'}`;
                if (actual !== requiredPosition) {
                    violations.push({
                        id: `viol-logo-pos-${layer.id}`,
                        category: 'logo',
                        severity: 'medium',
                        message: `Logo "${layer.name}" sits in the ${actual} quadrant but brand rules require ${requiredPosition}.`,
                        suggestion: `Move the logo to the ${requiredPosition} corner with at least ${profile.logo.minPadding}px padding.`,
                        layerId: layer.id,
                        layerName: layer.name,
                        boundingBox: box,
                    });
                }
            }
        }
    });

    let overallScore = 100 - violations.reduce((acc, v) => {
        if (v.severity === 'high') return acc + 25;
        if (v.severity === 'medium') return acc + 15;
        return acc + 8;
    }, 0);

    overallScore = Math.max(0, Math.min(100, overallScore));
    const status: 'pass' | 'warning' | 'fail' =
        overallScore >= 85 ? 'pass' : overallScore >= 60 ? 'warning' : 'fail';

    const summary = violations.length === 0
        ? `Design perfectly complies with brand profile "${profile.name}".`
        : `Found ${violations.length} compliance issue(s) against brand profile "${profile.name}". Overall compliance rating is ${overallScore}%.`;

    return {
        timestamp: new Date().toISOString(),
        profileName: profile.name,
        overallScore,
        status,
        violations,
        summary,
    };
}

function findLayerObject(canvas: fabric.Canvas, layerId?: string): fabric.Object | null {
    if (!layerId) return null;
    const objects = canvas.getObjects();
    const byId = objects.find((o) => (o as fabric.Object & { id?: string }).id === layerId);
    if (byId) return byId;
    // extractCanvasMetadata falls back to positional ids: "layer-<index+1>"
    const positional = layerId.match(/^layer-(\d+)$/);
    if (positional) {
        const index = parseInt(positional[1], 10) - 1;
        if (index >= 0 && index < objects.length) return objects[index];
    }
    return null;
}

/**
 * Mechanically corrects a violation on the canvas. Returns true when a fix
 * was applied; false when the violation type has no automatic remedy or the
 * layer could not be found.
 */
export function autoFixViolationOnCanvas(
    violation: BrandViolation,
    canvas: fabric.Canvas,
    profile: BrandProfile
): boolean {
    const obj = findLayerObject(canvas, violation.layerId);
    if (!obj) return false;
    const target = obj as fabric.Object & {
        fontFamily?: string;
        fontSize?: number;
        fill?: string;
        width?: number;
    };

    if (violation.id.startsWith('viol-font-')) {
        target.set('fontFamily', profile.typography.primaryFont);
    } else if (violation.id.startsWith('viol-fontsize-')) {
        target.set('fontSize', profile.typography.minBodySize);
    } else if (violation.id.startsWith('viol-color-')) {
        const current = typeof target.fill === 'string' ? target.fill : profile.palette.primary;
        target.set('fill', nearestPaletteColor(current, profile.palette.allowedColors));
    } else if (violation.id.startsWith('viol-contrast-')) {
        const bgLum = relativeLuminance(profile.palette.background);
        target.set('fill', bgLum !== null && bgLum > 0.5 ? profile.palette.secondary : '#ffffff');
    } else if (violation.id.startsWith('viol-margin-')) {
        const margin = profile.layout.minMargin;
        const bounds = obj.getBoundingRect();
        const canvasWidth = canvas.getWidth() || 800;
        const canvasHeight = canvas.getHeight() || 600;
        const maxLeft = Math.max(margin, canvasWidth - margin - bounds.width);
        const maxTop = Math.max(margin, canvasHeight - margin - bounds.height);
        const clampedLeft = Math.min(Math.max(bounds.left, margin), maxLeft);
        const clampedTop = Math.min(Math.max(bounds.top, margin), maxTop);
        obj.set({
            left: (obj.left || 0) + (clampedLeft - bounds.left),
            top: (obj.top || 0) + (clampedTop - bounds.top),
        });
        obj.setCoords();
    } else {
        return false;
    }

    canvas.requestRenderAll();
    return true;
}

/** Applies every mechanically fixable violation; returns the number fixed. */
export function autoFixAllViolationsOnCanvas(
    report: BrandAuditReport,
    canvas: fabric.Canvas,
    profile: BrandProfile
): number {
    let fixed = 0;
    for (const violation of report.violations) {
        if (autoFixViolationOnCanvas(violation, canvas, profile)) fixed += 1;
    }
    return fixed;
}

export function buildBrandAuditVlmPrompt(
    metadata: CanvasMetadataSummary,
    profile: BrandProfile
): string {
    return `You are an expert AI Brand Compliance Director inspecting a design artifact.

BRAND GUIDELINES ("${profile.name}"):
- Allowed Fonts: ${profile.typography.allowedFonts.join(', ')} (Primary: ${profile.typography.primaryFont})
- Min Text Size: Body ${profile.typography.minBodySize}px, Headings ${profile.typography.minHeadingSize}px
- Brand Palette: Primary ${profile.palette.primary}, Secondary ${profile.palette.secondary}, Accent ${profile.palette.accent}, Background ${profile.palette.background}
- Allowed Colors: ${profile.palette.allowedColors.join(', ')}
- Logo Placement: ${profile.logo.requiredPosition}
- Safety Margins: Minimum ${profile.layout.minMargin}px from edges

CANVAS METADATA:
Width: ${metadata.canvasWidth}px, Height: ${metadata.canvasHeight}px
Layers: ${JSON.stringify(metadata.layers, null, 2)}

TASK:
Analyze the design image along with layer metadata. Return a JSON object with:
{
  "overallScore": number (0-100),
  "status": "pass" | "warning" | "fail",
  "summary": "Brief executive summary",
  "violations": [
    {
      "id": "viol-1",
      "category": "typography" | "color" | "layout" | "logo" | "asset",
      "severity": "high" | "medium" | "low",
      "message": "Specific explanation of non-compliant element",
      "suggestion": "How to fix it",
      "layerId": "layer-1",
      "layerName": "Heading text",
      "boundingBox": { "left": 10, "top": 10, "width": 200, "height": 50 }
    }
  ]
}

Return ONLY valid JSON.`;
}

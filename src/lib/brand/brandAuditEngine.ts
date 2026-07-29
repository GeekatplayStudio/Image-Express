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

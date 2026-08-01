import { DEFAULT_BRAND_PROFILE } from '../brand/brandProfile';
import {
    CanvasMetadataSummary,
    contrastRatio,
    nearestPaletteColor,
    runHeuristicBrandAudit,
} from '../brand/brandAuditEngine';

describe('brandAuditEngine', () => {
    it('returns pass status when canvas layers match brand rules', () => {
        const metadata: CanvasMetadataSummary = {
            canvasWidth: 1080,
            canvasHeight: 1080,
            layerCount: 2,
            layers: [
                {
                    id: 'layer-1',
                    name: 'Background Card',
                    type: 'rect',
                    left: 50,
                    top: 50,
                    width: 980,
                    height: 980,
                    fill: '#2563eb', // Matches primary allowed color
                },
                {
                    id: 'layer-2',
                    name: 'Heading',
                    type: 'textbox',
                    left: 100,
                    top: 100,
                    width: 400,
                    height: 60,
                    fontFamily: 'Inter',
                    fontSize: 32,
                    fill: '#ffffff',
                },
            ],
        };

        const report = runHeuristicBrandAudit(metadata, DEFAULT_BRAND_PROFILE);
        expect(report.overallScore).toBeGreaterThanOrEqual(85);
        expect(report.status).toBe('pass');
        expect(report.violations.length).toBe(0);
    });

    it('detects unapproved font and non-palette color violations with bounding boxes', () => {
        const metadata: CanvasMetadataSummary = {
            canvasWidth: 800,
            canvasHeight: 600,
            layerCount: 1,
            layers: [
                {
                    id: 'bad-text-layer',
                    name: 'Comic Text',
                    type: 'textbox',
                    left: 10,
                    top: 10,
                    width: 300,
                    height: 50,
                    fontFamily: 'Comic Sans MS',
                    fill: '#ff00ff', // Magenta not in brand palette
                },
            ],
        };

        const report = runHeuristicBrandAudit(metadata, DEFAULT_BRAND_PROFILE);
        expect(report.status).not.toBe('pass');
        expect(report.violations.length).toBeGreaterThan(0);

        const fontViolation = report.violations.find((v) => v.category === 'typography');
        expect(fontViolation).toBeDefined();
        expect(fontViolation?.boundingBox).toEqual({
            left: 10,
            top: 10,
            width: 300,
            height: 50,
        });

        const colorViolation = report.violations.find((v) => v.category === 'color');
        expect(colorViolation).toBeDefined();
    });

    it('flags low-contrast text against the brand background', () => {
        const metadata: CanvasMetadataSummary = {
            canvasWidth: 1080,
            canvasHeight: 1080,
            layerCount: 1,
            layers: [
                {
                    id: 'pale-text',
                    name: 'Pale caption',
                    type: 'textbox',
                    left: 100,
                    top: 100,
                    width: 300,
                    height: 40,
                    text: 'Barely visible',
                    fontFamily: 'Inter',
                    fontSize: 18,
                    fill: '#f8fafc', // near-white on white brand background
                },
            ],
        };

        const report = runHeuristicBrandAudit(metadata, DEFAULT_BRAND_PROFILE);
        const contrastViolation = report.violations.find((v) => v.id.startsWith('viol-contrast-'));
        expect(contrastViolation).toBeDefined();
        expect(contrastViolation?.severity).toBe('high');
    });

    it('flags logo layers that break placement and size rules', () => {
        const metadata: CanvasMetadataSummary = {
            canvasWidth: 1000,
            canvasHeight: 1000,
            layerCount: 1,
            layers: [
                {
                    id: 'logo-1',
                    name: 'Company Logo',
                    type: 'image',
                    left: 900,
                    top: 900,
                    width: 20, // below 40px minimum, and bottom-right instead of top-left
                    height: 20,
                },
            ],
        };

        const report = runHeuristicBrandAudit(metadata, DEFAULT_BRAND_PROFILE);
        expect(report.violations.some((v) => v.id.startsWith('viol-logo-size-'))).toBe(true);
        expect(report.violations.some((v) => v.id.startsWith('viol-logo-pos-'))).toBe(true);
    });

    it('computes WCAG contrast ratios and nearest palette colors', () => {
        expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
        expect(contrastRatio('not-a-color', '#000000')).toBeNull();

        const allowed = ['#2563eb', '#0f172a', '#f59e0b'];
        expect(nearestPaletteColor('#2564ec', allowed)).toBe('#2563eb'); // near-primary snaps to primary
        expect(nearestPaletteColor('#f0a010', allowed)).toBe('#f59e0b'); // orange-ish snaps to accent
    });
});

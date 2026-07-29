import { DEFAULT_BRAND_PROFILE } from '../brand/brandProfile';
import { runHeuristicBrandAudit, CanvasMetadataSummary } from '../brand/brandAuditEngine';

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
});

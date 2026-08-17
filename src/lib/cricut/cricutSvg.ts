import type { CricutExportOptions, CricutPlacement, CricutSheet } from './cricutTypes';

const number = (value: number) => Number(value.toFixed(3));
const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
}[character] ?? character));

function transformPoint(placement: CricutPlacement, x: number, y: number): { x: number; y: number } {
    if (placement.rotated) {
        return { x: placement.xMm + placement.part.heightMm - y, y: placement.yMm + x };
    }
    return { x: placement.xMm + x, y: placement.yMm + y };
}

function pathData(placement: CricutPlacement): string {
    return placement.part.contours.map((contour) => {
        const [first, ...rest] = contour.points;
        const start = transformPoint(placement, first.x, first.y);
        const commands = [`M ${number(start.x)} ${number(start.y)}`];
        rest.forEach((point) => {
            const transformed = transformPoint(placement, point.x, point.y);
            commands.push(`L ${number(transformed.x)} ${number(transformed.y)}`);
        });
        commands.push('Z');
        return commands.join(' ');
    }).join(' ');
}

function registrationMarkup(placement: CricutPlacement, diameterMm: number): string {
    return placement.part.registrationAnchors.map((anchor, index) => {
        const point = transformPoint(placement, anchor.x, anchor.y);
        return `<circle id="${escapeXml(placement.part.id)}-registration-${index + 1}" cx="${number(point.x)}" cy="${number(point.y)}" r="${number(diameterMm / 2)}" fill="none" stroke="#2563eb" stroke-width="0.35" data-operation="score" />`;
    }).join('\n    ');
}

export function buildCricutSheetSvg(
    sheet: Omit<CricutSheet, 'svg'>,
    options: CricutExportOptions,
    designName: string,
): string {
    const groups = sheet.placements.map((placement) => {
        const label = `${placement.part.id}; depth ${placement.part.layerDepthMm}mm`;
        const marks = registrationMarkup(placement, options.registrationDiameterMm);
        return `  <g id="${escapeXml(placement.part.id)}" data-layer="${placement.part.layerIndex + 1}" data-component="${placement.part.componentIndex + 1}">
    <title>${escapeXml(label)}</title>
    <path d="${pathData(placement)}" fill="#000000" fill-rule="evenodd" stroke="none" data-operation="cut" />
    ${marks}
  </g>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${number(sheet.widthMm)}mm" height="${number(sheet.heightMm)}mm" viewBox="0 0 ${number(sheet.widthMm)} ${number(sheet.heightMm)}">
  <title>${escapeXml(designName)} — Cricut sheet ${sheet.index + 1}</title>
  <desc>Physical dimensions are encoded in millimetres. Black closed paths are cuts; blue circles are registration score marks.</desc>
${groups}
</svg>`;
}

export function cricutSvgDataUrl(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

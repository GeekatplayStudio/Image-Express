/**
 * Foldcraft S6 — fold grooves.
 *
 * Paper folds on a scored line at any angle. Foam has thickness, and folding it
 * to a chosen angle means removing a wedge of material so the walls close up
 * when the panel comes over.
 *
 * With `t` the stock thickness, `h` the hinge left uncut and `θ` the dihedral
 * the finished object wants between two panels:
 *
 *     grooveAngle  α = |180° − θ|          the notch closes exactly at this rotation
 *     depth        d = t − h
 *     width        w = 2 · d · tan(α / 2)  the opening at the surface
 *
 * Dihedral is measured through the material seen from outside, so 180° is flat,
 * below that is convex and above is a valley. A valley wants the same groove cut
 * on the opposite face, which is what the `side` field carries.
 *
 * What varies between machines is how the wedge is removed, not what it is. A
 * blade that tilts to α/2 cuts the two walls directly and they mate flush when
 * folded. A blade that cannot tilt that far leaves the same opening width and
 * the fold still closes at the right angle — the walls just do not meet flush,
 * which costs glue area rather than accuracy.
 */

import type {
    FlatPanel,
    GroovePass,
    GrooveSpec,
    MachineProfile,
    MaterialSpec,
    SheetFace,
    Vec2,
} from './foldcraftTypes';

/** Clearing an unreachable wedge one kerf at a time can run away; cap it. */
const MAX_CLEARING_PASSES = 64;
/**
 * Beyond this half-angle a groove stops being a fold and becomes a cut: the
 * opening `2·d·tan(α/2)` grows without bound as α/2 approaches 90°, so at 80°
 * the wedge is already 11× the material thickness.
 */
const MAX_GROOVE_HALF_ANGLE_DEG = 80;
/** A score line is a shallow nick, not a groove. */
const SCORE_DEPTH_FRACTION = 0.25;

export type GroovePlan = {
    grooves: GrooveSpec[];
    /** Folds the machine could not cut as a true V, with the reason. */
    warnings: string[];
    /** Folds that got a flush-walled V — the ideal case. */
    trueVeeCount: number;
};

const degToRad = (degrees: number) => degrees * Math.PI / 180;

/** Rectangle of removed material, centred on the fold line. */
function grooveOutline(a: Vec2, b: Vec2, width: number): Vec2[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9 || width <= 0) return [];
    const nx = -dy / length * (width / 2);
    const ny = dx / length * (width / 2);
    return [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
    ];
}

/**
 * Passes that free the wedge.
 *
 * Two tilted cuts meet at the bottom only when the blade reaches α/2: the walls
 * converge at d·tan(tilt) per side, so anything less leaves material bridging
 * the groove and the panel will not fold. When the blade falls short, the wedge
 * is cleared with parallel passes instead, and on a machine that cannot control
 * depth at all only the channel walls are cut, for the waste to be weeded by hand.
 */
function planPasses(
    halfAngleDeg: number,
    widthMm: number,
    depthMm: number,
    side: SheetFace,
    machine: MachineProfile,
): { passes: GroovePass[]; method: GrooveSpec['method']; warning?: string } {
    if (machine.maxBladeTiltDeg >= halfAngleDeg) {
        return {
            method: 'v-groove',
            passes: [
                { face: side, offsetMm: 0, bladeTiltDeg: halfAngleDeg, depthMm },
                { face: side, offsetMm: 0, bladeTiltDeg: -halfAngleDeg, depthMm },
            ],
        };
    }

    const warning = `Fold needs ${halfAngleDeg.toFixed(1)}° of blade tilt but ${machine.name} reaches `
        + `${machine.maxBladeTiltDeg}°; cut as a ${machine.hasDepthControl ? 'cleared channel' : 'weeded channel'} instead.`;

    if (!machine.hasDepthControl) {
        return {
            method: 'channel',
            passes: [
                { face: side, offsetMm: -widthMm / 2, bladeTiltDeg: 0, depthMm },
                { face: side, offsetMm: widthMm / 2, bladeTiltDeg: 0, depthMm },
            ],
            warning,
        };
    }

    const tilt = machine.maxBladeTiltDeg;
    const step = Math.max(machine.kerfMm, 1e-3);
    const passes: GroovePass[] = [];
    const half = widthMm / 2;
    for (let offset = -half; offset <= half + 1e-9 && passes.length < MAX_CLEARING_PASSES; offset += step) {
        // Walls keep the machine's best tilt; the interior is cleared flat.
        const atWall = Math.abs(Math.abs(offset) - half) < step / 2;
        passes.push({
            face: side,
            offsetMm: Number(offset.toFixed(4)),
            bladeTiltDeg: atWall ? Math.sign(offset) * tilt : 0,
            depthMm,
        });
    }
    return { method: 'channel', passes, warning };
}

export function planGrooves(
    panel: FlatPanel,
    material: MaterialSpec,
    machine: MachineProfile,
): GroovePlan {
    const depth = Math.max(0, material.thicknessMm - material.hingeMm);
    const grooves: GrooveSpec[] = [];
    const warnings: string[] = [];
    let trueVeeCount = 0;

    panel.interiorEdges.forEach((edge) => {
        const dihedral = edge.dihedralDeg;
        const grooveAngle = Math.abs(180 - dihedral);
        const side: SheetFace = dihedral < 180 ? 'inside' : 'outside';
        const base = {
            edgeKey: edge.edgeKey,
            a: edge.a,
            b: edge.b,
            dihedralDeg: Number(dihedral.toFixed(4)),
            grooveAngleDeg: Number(grooveAngle.toFixed(4)),
            side,
        };

        if (dihedral >= material.scoreOnlyAboveDeg && dihedral <= 360 - material.scoreOnlyAboveDeg) {
            // Shallow enough that the foam simply bends.
            grooves.push({
                ...base,
                depthMm: Number((depth * SCORE_DEPTH_FRACTION).toFixed(4)),
                widthMm: 0,
                method: 'score',
                passes: [{
                    face: side,
                    offsetMm: 0,
                    bladeTiltDeg: 0,
                    depthMm: Number((depth * SCORE_DEPTH_FRACTION).toFixed(4)),
                }],
                outline: [],
            });
            return;
        }

        const halfAngle = grooveAngle / 2;
        /**
         * Too sharp to hinge, from either direction.
         *
         * The test has to be symmetric about 360: a 2° fold and a 358° fold are
         * both panels folded back onto each other, and both need cutting apart.
         * Checking only the low side let a 357.9° fold reach the width formula,
         * where tan(88.9°) produced a 595 mm groove — wider than the sheet it
         * was drawn on.
         *
         * The half-angle limit is the same statement in the form the geometry
         * actually cares about, and it also catches anything a future material
         * preset might let through.
         */
        const sharpFromEitherSide = dihedral < material.throughCutBelowDeg
            || dihedral > 360 - material.throughCutBelowDeg;
        if (sharpFromEitherSide || halfAngle >= MAX_GROOVE_HALF_ANGLE_DEG) {
            grooves.push({
                ...base,
                depthMm: material.thicknessMm,
                widthMm: 0,
                method: 'through-cut',
                passes: [{ face: side, offsetMm: 0, bladeTiltDeg: 0, depthMm: material.thicknessMm }],
                outline: [],
            });
            warnings.push(`Fold at ${dihedral.toFixed(1)}° is too sharp to groove and is cut apart rather than folded.`);
            return;
        }

        // Rounded once, then used everywhere: a caller that reads widthMm and
        // draws its own outline must get the geometry this spec describes.
        const width = Number((2 * depth * Math.tan(degToRad(halfAngle))).toFixed(4));
        const planned = planPasses(halfAngle, width, depth, side, machine);
        if (planned.warning) warnings.push(planned.warning);
        if (planned.method === 'v-groove') trueVeeCount += 1;

        grooves.push({
            ...base,
            depthMm: Number(depth.toFixed(4)),
            widthMm: width,
            method: planned.method,
            passes: planned.passes,
            outline: grooveOutline(edge.a, edge.b, width),
        });
    });

    return { grooves, warnings: [...new Set(warnings)], trueVeeCount };
}

/**
 * Smallest blade tilt that would give every fold in a plan a flush-walled V.
 * Useful when specifying the machine: the tilt axis only needs this much range.
 */
export function requiredBladeTiltDeg(panels: FlatPanel[], material: MaterialSpec): number {
    let required = 0;
    panels.forEach((panel) => panel.interiorEdges.forEach((edge) => {
        if (edge.dihedralDeg >= material.scoreOnlyAboveDeg) return;
        if (edge.dihedralDeg < material.throughCutBelowDeg) return;
        required = Math.max(required, Math.abs(180 - edge.dihedralDeg) / 2);
    }));
    return Number(required.toFixed(4));
}

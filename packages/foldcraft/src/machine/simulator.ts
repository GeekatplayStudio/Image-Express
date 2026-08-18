/**
 * Foldcraft machine layer — simulator.
 *
 * Executes a `Toolpath` against a `MachineProfile` before any material is on
 * the bed, and reports every physical violation the profile can predict:
 * travel outside the bed, tilt beyond the axis range, depth below the stock,
 * and rotating a buried blade — the mistake that snaps ultrasonic blades.
 *
 * The simulator consumes the same IR the G-code post consumes. That is the
 * design guarantee: a toolpath the simulator passes is the toolpath the
 * machine receives, not a reconstruction of it.
 */

import type { MachineProfile } from '../foldcraftTypes';
import type { Toolpath } from './toolpath';

export type SimulationViolation = {
    opIndex: number;
    rule: 'bed-bounds' | 'tilt-range' | 'depth-range' | 'buried-rotation' | 'swivel-unsupported';
    detail: string;
};

export type SimulationReport = {
    ok: boolean;
    violations: SimulationViolation[];
    stats: {
        ops: number;
        cutLengthMm: number;
        rapidLengthMm: number;
        bladeDownTimePct: number;
        maxDepthMm: number;
        maxTiltDeg: number;
        distinctTilts: number[];
    };
};

export type SimulateOptions = {
    stockThicknessMm: number;
    /** Overcut past the stock bottom that still counts as intended. */
    allowOvercutMm?: number;
    /** Tilt/swivel change while buried larger than this is a violation. */
    buriedRotationToleranceDeg?: number;
};

export function simulateToolpath(
    toolpath: Toolpath,
    machine: MachineProfile,
    options: SimulateOptions,
): SimulationReport {
    const overcut = options.allowOvercutMm ?? 0.5;
    const rotationTolerance = options.buriedRotationToleranceDeg ?? 0.01;
    const violations: SimulationViolation[] = [];

    let x = 0;
    let y = 0;
    let z = 1; // parked above the stock
    let tilt = 0;
    let swivel = 0;
    let cutLength = 0;
    let rapidLength = 0;
    let maxDepth = 0;
    let maxTilt = 0;
    const tilts = new Set<number>();

    toolpath.ops.forEach((op, opIndex) => {
        if (op.kind === 'comment') return;
        if (op.kind === 'lift') { z = 1; return; }

        if (op.x < 0 || op.x > machine.bedWidthMm || op.y < 0 || op.y > machine.bedHeightMm) {
            violations.push({
                opIndex,
                rule: 'bed-bounds',
                detail: `(${op.x.toFixed(1)}, ${op.y.toFixed(1)}) outside ${machine.bedWidthMm}×${machine.bedHeightMm} bed`,
            });
        }

        if (op.kind === 'rapid') {
            rapidLength += Math.hypot(op.x - x, op.y - y);
            x = op.x; y = op.y; z = 1;
            return;
        }

        if (Math.abs(op.tiltDeg) > machine.maxBladeTiltDeg + 1e-9) {
            violations.push({
                opIndex,
                rule: 'tilt-range',
                detail: `tilt ${op.tiltDeg}° exceeds ±${machine.maxBladeTiltDeg}°`,
            });
        }
        if (op.swivelDeg !== 0 && !machine.requiresTangentialSwivel) {
            violations.push({
                opIndex,
                rule: 'swivel-unsupported',
                detail: `swivel ${op.swivelDeg}° on a machine without a tangential axis`,
            });
        }
        if (-op.z > options.stockThicknessMm + overcut) {
            violations.push({
                opIndex,
                rule: 'depth-range',
                detail: `depth ${(-op.z).toFixed(2)} mm exceeds stock ${options.stockThicknessMm} mm + ${overcut} mm overcut`,
            });
        }

        const wasBuried = z < 0;
        if (wasBuried && (
            Math.abs(op.tiltDeg - tilt) > rotationTolerance
            || Math.abs(op.swivelDeg - swivel) > rotationTolerance
        )) {
            violations.push({
                opIndex,
                rule: 'buried-rotation',
                detail: `blade rotated while ${(-z).toFixed(2)} mm deep (tilt ${tilt}→${op.tiltDeg}, swivel ${swivel}→${op.swivelDeg})`,
            });
        }

        if (wasBuried || op.z < 0) cutLength += Math.hypot(op.x - x, op.y - y);
        x = op.x; y = op.y; z = op.z; tilt = op.tiltDeg; swivel = op.swivelDeg;
        maxDepth = Math.max(maxDepth, -op.z);
        maxTilt = Math.max(maxTilt, Math.abs(op.tiltDeg));
        tilts.add(op.tiltDeg);
    });

    const travelled = cutLength + rapidLength;
    return {
        ok: violations.length === 0,
        violations,
        stats: {
            ops: toolpath.ops.length,
            cutLengthMm: Number(cutLength.toFixed(2)),
            rapidLengthMm: Number(rapidLength.toFixed(2)),
            bladeDownTimePct: travelled > 0 ? Number((cutLength / travelled * 100).toFixed(1)) : 0,
            maxDepthMm: Number(maxDepth.toFixed(3)),
            maxTiltDeg: Number(maxTilt.toFixed(3)),
            distinctTilts: [...tilts].sort((a, b) => a - b),
        },
    };
}

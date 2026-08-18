/**
 * Foldcraft machine layer — grblHAL G-code post-processor.
 *
 * Targets grblHAL because it is the open-source controller that actually
 * drives five axes on hobby-class hardware (the reference build is a Teensy
 * 4.1 breakout); the dialect is conservative RS274 so LinuxCNC runs the same
 * files.
 *
 * Axis mapping, matching the reference machine:
 *   X, Y  gantry position, mm
 *   Z     blade depth, mm, 0 at stock surface, negative into stock
 *   A     blade tilt, degrees from vertical
 *   C     tangential swivel, degrees, heading of travel
 *
 * The ultrasonic transducer is gated with M3/M5 like a spindle so the same
 * post drives a machine with a plain drag knife — the commands are simply
 * inert there.
 */

import type { MachineProfile } from '../foldcraftTypes';
import type { Toolpath } from './toolpath';

export type GcodeOptions = {
    feedCutMmMin?: number;
    feedRapidMmMin?: number;
    /** Clearance height for rapids, above the stock surface. */
    safeZMm?: number;
    /** Spindle-speed word for M3; drives ultrasonic amplitude where wired. */
    ultrasonicPower?: number;
    programName?: string;
};

const DEFAULTS: Required<GcodeOptions> = {
    feedCutMmMin: 600,
    feedRapidMmMin: 4000,
    safeZMm: 6,
    ultrasonicPower: 1000,
    programName: 'foldcraft',
};

const word = (letter: string, value: number) => `${letter}${Number(value.toFixed(4))}`;

export function toGcode(toolpath: Toolpath, machine: MachineProfile, options: GcodeOptions = {}): string {
    const config = { ...DEFAULTS, ...options };
    const lines: string[] = [
        `(${config.programName} — sheet ${toolpath.sheetIndex + 1})`,
        `(machine: ${machine.name})`,
        '(axes: X Y gantry mm, Z depth mm, A tilt deg, C swivel deg)',
        'G21 (mm)',
        'G90 (absolute)',
        'G94 (units per minute feed)',
        `G0 ${word('Z', config.safeZMm)}`,
        `M3 S${config.ultrasonicPower} (ultrasonic on)`,
    ];

    let bladeDown = false;
    let lastTilt = 0;
    let lastSwivel = 0;

    for (const op of toolpath.ops) {
        switch (op.kind) {
            case 'comment':
                lines.push(`(${op.text.replace(/[()]/g, '')})`);
                break;
            case 'rapid':
                if (bladeDown) {
                    lines.push(`G0 ${word('Z', config.safeZMm)}`);
                    bladeDown = false;
                }
                lines.push(`G0 ${word('X', op.x)} ${word('Y', op.y)}`);
                break;
            case 'lift':
                if (bladeDown) {
                    lines.push(`G0 ${word('Z', config.safeZMm)}`);
                    bladeDown = false;
                }
                break;
            case 'cut': {
                // Orient tilt and swivel before the blade enters the material:
                // rotating a buried blade tears foam instead of cutting it.
                if (!bladeDown && (op.tiltDeg !== lastTilt || op.swivelDeg !== lastSwivel)) {
                    lines.push(`G0 ${word('A', op.tiltDeg)} ${word('C', op.swivelDeg)}`);
                    lastTilt = op.tiltDeg;
                    lastSwivel = op.swivelDeg;
                }
                const words = [word('X', op.x), word('Y', op.y), word('Z', op.z)];
                if (bladeDown && op.tiltDeg !== lastTilt) { words.push(word('A', op.tiltDeg)); lastTilt = op.tiltDeg; }
                if (bladeDown && op.swivelDeg !== lastSwivel) { words.push(word('C', op.swivelDeg)); lastSwivel = op.swivelDeg; }
                lines.push(`G1 ${words.join(' ')} ${word('F', config.feedCutMmMin)}`);
                bladeDown = true;
                break;
            }
        }
    }

    lines.push(`G0 ${word('Z', config.safeZMm)}`);
    lines.push('M5 (ultrasonic off)');
    lines.push('G0 X0 Y0');
    lines.push('M2');
    return lines.join('\n');
}

/** Rough job-time estimate from path length and feeds. */
export function estimateMinutes(toolpath: Toolpath, options: GcodeOptions = {}): number {
    const config = { ...DEFAULTS, ...options };
    return Number((toolpath.cutLengthMm / config.feedCutMmMin).toFixed(1));
}

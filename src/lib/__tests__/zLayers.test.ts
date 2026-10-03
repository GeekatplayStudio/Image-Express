/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { MODAL_LAYER_BASE } from '@/lib/zLayers';

/**
 * Popup windows must sit above the workspace chrome. This scans the source for
 * full-screen overlays and for anything in the workspace tier, and fails when
 * one strays into the other's range — the mistake that let toolbars draw over
 * open windows.
 */

const SRC = path.resolve(__dirname, '..', '..');

const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.tsx')) out.push(full);
    }
    return out;
};

const zOf = (line: string): number | null => {
    const match = line.match(/\bz-(?:\[(\d+)\]|(\d+))(?![\w-])/);
    return match ? Number(match[1] ?? match[2]) : null;
};

/** Full-screen layers that are deliberately not popup windows. */
const NOT_A_POPUP = new Set([
    'components/DashboardAmbience.tsx', // dashboard backdrop
    'components/SpriteTheater.tsx', // decorative animation layer
    'components/ui/ModalShell.tsx', // z comes from a prop, checked below
]);

const files = walk(SRC).map((file) => ({
    rel: path.relative(SRC, file).split(path.sep).join('/'),
    lines: fs.readFileSync(file, 'utf8').split(/\r?\n/),
}));

describe('z-index layers', () => {
    it('finds the overlays it is meant to guard', () => {
        const overlays = files.flatMap(({ lines }) => lines.filter((line) => /\bfixed inset-0\b/.test(line)));
        // Guards the guard: a refactor that renames the pattern must not leave
        // the checks below passing over nothing.
        expect(overlays.length).toBeGreaterThan(15);
    });

    it('puts every full-screen overlay in the modal tier', () => {
        const offenders: string[] = [];
        for (const { rel, lines } of files) {
            if (NOT_A_POPUP.has(rel)) continue;
            lines.forEach((line, index) => {
                if (!/\bfixed inset-0\b/.test(line)) return;
                const z = zOf(line);
                if (z === null || z < MODAL_LAYER_BASE) offenders.push(`${rel}:${index + 1} (z=${z})`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('offsets the shared modal shell into the modal tier', () => {
        const shell = files.find(({ rel }) => rel === 'components/ui/ModalShell.tsx');
        expect(shell?.lines.join('\n')).toContain('zIndex: MODAL_LAYER_BASE + zIndex');
    });

    it('keeps the toolbar and its flyouts below the modal tier', () => {
        const toolbar = files.find(({ rel }) => rel === 'components/Toolbar.tsx');
        const values = (toolbar?.lines ?? []).map(zOf).filter((z): z is number => z !== null);
        expect(values.length).toBeGreaterThan(0);
        expect(Math.max(...values)).toBeLessThan(MODAL_LAYER_BASE);
    });

    it('keeps confirm dialogs above every popup window, and toasts above those', () => {
        const zIn = (rel: string) => Math.max(
            ...(files.find((file) => file.rel === rel)?.lines ?? []).map(zOf).filter((z): z is number => z !== null),
        );
        const highestPopup = Math.max(...files
            .filter(({ rel }) => !rel.startsWith('providers/') && rel !== 'components/SpriteTheater.tsx')
            .flatMap(({ lines }) => lines.filter((line) => /\bfixed inset-0\b/.test(line)).map(zOf))
            .filter((z): z is number => z !== null));
        const dialog = zIn('providers/DialogProvider.tsx');
        expect(dialog).toBeGreaterThan(highestPopup);
        expect(zIn('providers/ToastProvider.tsx')).toBeGreaterThan(dialog);
    });
});

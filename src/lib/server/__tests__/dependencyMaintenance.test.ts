/** @jest-environment node */

import {
    applyDependencyUpdates,
    parseOutdatedPackages,
} from '@/lib/server/dependencyMaintenance';

describe('dependencyMaintenance', () => {
    it('parses npm outdated json into sorted package entries with dependency sections', () => {
        const manifest = {
            dependencies: {
                next: '16.1.4',
                react: '19.2.3',
            },
            devDependencies: {
                typescript: '^5',
            },
        };

        const entries = parseOutdatedPackages(JSON.stringify({
            react: { current: '19.2.3', wanted: '19.2.3', latest: '19.2.6' },
            typescript: { current: '5.9.3', wanted: '5.9.3', latest: '6.0.3' },
            next: { current: '16.1.4', wanted: '16.1.4', latest: '16.2.6' },
        }), manifest);

        expect(entries).toEqual([
            expect.objectContaining({ name: 'next', section: 'dependencies', range: '16.1.4', latest: '16.2.6' }),
            expect.objectContaining({ name: 'react', section: 'dependencies', range: '19.2.3', latest: '19.2.6' }),
            expect.objectContaining({ name: 'typescript', section: 'devDependencies', range: '^5', latest: '6.0.3' }),
        ]);
    });

    it('updates dependency ranges while preserving exact, caret, and tilde prefixes', () => {
        const manifest = {
            dependencies: {
                next: '16.1.4',
                react: '^19.2.3',
            },
            devDependencies: {
                typescript: '~5.9.3',
            },
        };

        const updated = applyDependencyUpdates(manifest, [
            {
                name: 'next',
                section: 'dependencies',
                range: '16.1.4',
                current: '16.1.4',
                wanted: '16.1.4',
                latest: '16.2.6',
                target: '16.2.6',
            },
            {
                name: 'react',
                section: 'dependencies',
                range: '^19.2.3',
                current: '19.2.3',
                wanted: '19.2.3',
                latest: '19.2.6',
                target: '19.2.6',
            },
            {
                name: 'typescript',
                section: 'devDependencies',
                range: '~5.9.3',
                current: '5.9.3',
                wanted: '5.9.3',
                latest: '6.0.3',
                target: '6.0.3',
            },
        ], 'latest');

        expect(updated.dependencies?.next).toBe('16.2.6');
        expect(updated.dependencies?.react).toBe('^19.2.6');
        expect(updated.devDependencies?.typescript).toBe('~6.0.3');
    });
});
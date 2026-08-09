import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
    TECHNOLOGY_GROUPS,
    allTechEntries,
    matchesTechQuery,
} from '@/features/about/technologyStack';

/**
 * This page is shown to other people, so its job is to be *true*. The checks
 * below exist so an upgraded, replaced or removed dependency breaks the build
 * instead of leaving the app quietly describing a stack it no longer has.
 */

const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const installed = { ...packageJson.dependencies, ...packageJson.devDependencies };

/** "^16.2.11" -> "16"; "0.182.0" -> "0.182"; "3.8.1" -> "3". */
function declaredMajor(range: string): string {
    const cleaned = range.replace(/^[\^~>=<\s]+/, '');
    const [major, minor] = cleaned.split('.');
    // 0.x packages treat the minor as the breaking-change digit, so a bare "0"
    // would say nothing useful about three@0.182.
    return major === '0' ? `0.${minor}` : major;
}

describe('technology stack content', () => {
    const entries = allTechEntries();

    it('describes every entry with both a role and a reason', () => {
        // An entry that cannot say why it was chosen is a logo, not a document.
        for (const entry of entries) {
            expect(entry.role.length).toBeGreaterThan(20);
            expect(entry.why.length).toBeGreaterThan(20);
        }
    });

    it('names a package that is actually installed', () => {
        const named = entries.filter((entry) => entry.package);
        // Guards the guard: if this ever hits zero the check below is vacuous.
        expect(named.length).toBeGreaterThan(10);

        for (const entry of named) {
            const range = installed[entry.package!]
                // sharp is a transitive dependency of Next rather than a direct
                // one, which is precisely why it was chosen — see its entry.
                ?? (entry.package === 'sharp' ? readSharpVersion() : undefined);
            expect(range).toBeDefined();
        }
    });

    it('states the major version each package is actually on', () => {
        for (const entry of entries) {
            if (!entry.package || !entry.version) continue;
            const range = installed[entry.package]
                ?? (entry.package === 'sharp' ? readSharpVersion() : undefined);
            if (!range) continue;
            expect(`${entry.package}@${declaredMajor(range)}`)
                .toBe(`${entry.package}@${entry.version}`);
        }
    });

    it('has unique group ids so anchors cannot collide', () => {
        const ids = TECHNOLOGY_GROUPS.map((group) => group.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers the areas the page promises', () => {
        const ids = TECHNOLOGY_GROUPS.map((group) => group.id);
        expect(ids).toEqual(expect.arrayContaining([
            'foundation', 'canvas', 'three-d', 'ai', 'vault', 'queue', 'api', 'mcp', 'quality',
        ]));
    });
});

describe('matchesTechQuery', () => {
    const entry = {
        name: 'node:sqlite',
        role: 'Stores the asset catalog and the embedding vectors.',
        why: 'better-sqlite3 was rejected: a native module needs rebuilding.',
        groupTitle: 'Asset vault & vector search',
    };

    it('matches an empty query so the page starts complete', () => {
        expect(matchesTechQuery(entry, '   ')).toBe(true);
    });

    it('matches on name, prose and group, case-insensitively', () => {
        expect(matchesTechQuery(entry, 'SQLITE')).toBe(true);
        expect(matchesTechQuery(entry, 'embedding')).toBe(true);
        expect(matchesTechQuery(entry, 'vector search')).toBe(true);
    });

    it('finds a rejected alternative, which is why it is written down', () => {
        // Searching "better-sqlite3" should surface the reason it is not used.
        expect(matchesTechQuery(entry, 'better-sqlite3')).toBe(true);
    });

    it('does not match something absent', () => {
        expect(matchesTechQuery(entry, 'postgres')).toBe(false);
    });
});

/** sharp ships inside node_modules via Next; read its real version. */
function readSharpVersion(): string | undefined {
    try {
        return JSON.parse(
            readFileSync(path.join(process.cwd(), 'node_modules', 'sharp', 'package.json'), 'utf8'),
        ).version as string;
    } catch {
        return undefined;
    }
}

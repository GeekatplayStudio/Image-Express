#!/usr/bin/env node

/**
 * Verifies that every security-motivated `overrides` entry in package.json is
 * actually honoured by package-lock.json.
 *
 * npm silently drops an override when a later `npm install`, a Dependabot
 * bump, or a hand-merged lockfile reshapes the tree, which is how patched
 * transitive dependencies quietly regress back to vulnerable versions. This
 * check fails the build instead.
 *
 * Override keys may be scoped to a single major line (`brace-expansion@1`)
 * because some advisories are fixed by backports on several release lines at
 * once and the majors are not API-compatible with each other.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function parseVersion(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? '');
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
    }
    return 0;
}

/** Splits `brace-expansion@1` into the package name and the major it targets. */
function parseOverrideKey(key) {
    const separator = key.lastIndexOf('@');
    if (separator <= 0) return { name: key, major: null };
    const suffix = key.slice(separator + 1);
    if (!/^\d+$/.test(suffix)) return { name: key, major: null };
    return { name: key.slice(0, separator), major: Number(suffix) };
}

/** Resolves the minimum version an override spec accepts (`^7.5.21` -> 7.5.21). */
function parseFloor(spec) {
    if (typeof spec !== 'string') return null;
    return parseVersion(spec.replace(/^[\^~>=v\s]+/, ''));
}

const floors = [];
for (const [key, spec] of Object.entries(manifest.overrides ?? {})) {
    const floor = parseFloor(spec);
    if (!floor) continue;
    floors.push({ ...parseOverrideKey(key), spec, floor });
}

const violations = [];
for (const [lockPath, entry] of Object.entries(lockfile.packages ?? {})) {
    if (!lockPath.startsWith('node_modules/')) continue;
    const installedName = lockPath.slice(lockPath.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const installed = parseVersion(entry.version);
    if (!installed) continue;

    for (const rule of floors) {
        if (rule.name !== installedName) continue;
        if (rule.major !== null && rule.major !== installed[0]) continue;
        if (compareVersions(installed, rule.floor) < 0) {
            violations.push(`${lockPath} resolves ${entry.version}, below the pinned override ${rule.spec}`);
        }
    }
}

console.log(JSON.stringify({
    status: violations.length === 0 ? 'passed' : 'failed',
    pinnedOverrides: floors.map((rule) => ({
        package: rule.major === null ? rule.name : `${rule.name}@${rule.major}`,
        minimum: rule.spec,
    })),
}, null, 2));

if (violations.length > 0) {
    console.error('Security overrides are not honoured by package-lock.json:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error('Run "npm install" so the lockfile picks the pinned versions back up.');
    process.exit(1);
}

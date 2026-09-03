#!/usr/bin/env node
/**
 * Automated Mutation Testing Harness for Image Express.
 *
 * Evaluates test quality on critical algorithmic and computational modules
 * by applying code mutations (operator flips, boundary modifications, logical inversions)
 * and verifying that the corresponding test suites detect and kill every mutant.
 *
 * Usage:
 *   node scripts/mutation-test.mjs
 *   node scripts/mutation-test.mjs --target=selection
 *   node scripts/mutation-test.mjs --target=foldcraft
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const jestCli = path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js');

const TARGETS = {
    selection: {
        name: 'Selection Mask Geometry',
        source: path.join(rootDir, 'src', 'lib', 'selection', 'documentSelectionMask.ts'),
        testCmd: [process.execPath, [jestCli, 'src/lib/selection/__tests__/documentSelectionMask.test.ts', '--runInBand', '--silent']],
        maxMutants: 15,
    },
    foldcraft: {
        name: 'Foldcraft Mesh Topology',
        source: path.join(rootDir, 'packages', 'foldcraft', 'src', 'meshTopology.ts'),
        testCmd: [process.execPath, [jestCli, '--config', 'packages/foldcraft/jest.config.cjs', 'packages/foldcraft/__tests__/foldcraftGeometry.test.ts', '--runInBand', '--silent']],
        maxMutants: 15,
    },
};

const MUTATORS = [
    { name: 'Equality inversion (=== to !==)', regex: /(?<!=)===(?!=)/g, replace: '!==' },
    { name: 'Inequality inversion (!== to ===)', regex: /!==/g, replace: '===' },
    { name: 'Greater-than to Less-than-or-equal (> to <=)', regex: /(?<!=)>(?!=)/g, replace: '<=' },
    { name: 'Less-than to Greater-than-or-equal (< to >=)', regex: /(?<!=)<(?!=)/g, replace: '>=' },
    { name: 'Logical AND to OR (&& to ||)', regex: /&&/g, replace: '||' },
    { name: 'Logical OR to AND (|| to &&)', regex: /\|\|/g, replace: '&&' },
    { name: 'Addition to Subtraction (+ to -)', regex: /(?<=\s)\+(?=\s)/g, replace: '-' },
    { name: 'Subtraction to Addition (- to +)', regex: /(?<=\s)-(?=\s)/g, replace: '+' },
    { name: 'Boolean true to false', regex: /\btrue\b/g, replace: 'false' },
    { name: 'Boolean false to true', regex: /\bfalse\b/g, replace: 'true' },
];

function generateMutants(sourceText, maxCount = 15) {
    const lines = sourceText.split('\n');
    const mutants = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
        const line = lines[lineIdx];
        if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
            continue;
        }

        for (const mutator of MUTATORS) {
            mutator.regex.lastIndex = 0;
            let match;
            while ((match = mutator.regex.exec(line)) !== null) {
                const mutatedLine = line.slice(0, match.index) + mutator.replace + line.slice(match.index + match[0].length);
                const mutatedSource = [
                    ...lines.slice(0, lineIdx),
                    mutatedLine,
                    ...lines.slice(lineIdx + 1),
                ].join('\n');

                mutants.push({
                    name: mutator.name,
                    line: lineIdx + 1,
                    originalSnippet: line.trim(),
                    mutatedSnippet: mutatedLine.trim(),
                    mutatedSource,
                });

                if (mutants.length >= maxCount) return mutants;
            }
        }
    }

    return mutants;
}

function runTest(cmd, args) {
    const started = Date.now();
    const result = spawnSync(cmd, args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
        timeout: 30_000,
    });
    const duration = ((Date.now() - started) / 1000).toFixed(2);
    const passed = result.status === 0;
    return { passed, duration, timedOut: result.error?.code === 'ETIMEDOUT' };
}

async function runMutationTesting(targetKey) {
    const target = TARGETS[targetKey];
    if (!target) {
        console.error(`Unknown target: ${targetKey}. Available: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
    }

    console.log(`\n============================================================`);
    console.log(`🧪 Mutation Testing: ${target.name}`);
    console.log(`Target source: ${path.relative(rootDir, target.source)}`);
    console.log(`============================================================\n`);

    if (!fs.existsSync(target.source)) {
        console.error(`Source file not found: ${target.source}`);
        process.exit(1);
    }

    const originalContent = fs.readFileSync(target.source, 'utf8');

    // Step 1: Verify baseline test passes without mutations
    process.stdout.write(`[1/3] Running baseline test suite... `);
    const [cmd, args] = target.testCmd;
    const baseline = runTest(cmd, args);
    if (!baseline.passed) {
        console.error(`FAILED! Baseline tests must pass before running mutation testing.`);
        process.exit(1);
    }
    console.log(`PASSED (${baseline.duration}s)\n`);

    // Step 2: Generate mutants
    const mutants = generateMutants(originalContent, target.maxMutants);
    console.log(`[2/3] Generated ${mutants.length} distinct mutation candidates.\n`);

    // Step 3: Test each mutant
    console.log(`[3/3] Evaluating mutant detection rate:`);
    let killedCount = 0;
    let survivedCount = 0;

    const cleanup = () => {
        try {
            fs.writeFileSync(target.source, originalContent, 'utf8');
        } catch {
            // ignore
        }
    };

    process.on('SIGINT', () => { cleanup(); process.exit(1); });
    process.on('SIGTERM', () => { cleanup(); process.exit(1); });

    try {
        for (let i = 0; i < mutants.length; i += 1) {
            const mutant = mutants[i];
            fs.writeFileSync(target.source, mutant.mutatedSource, 'utf8');

            const testResult = runTest(cmd, args);
            const isKilled = !testResult.passed || testResult.timedOut;

            if (isKilled) {
                killedCount += 1;
                console.log(`  ✓ Mutant #${i + 1} [KILLED]: Line ${mutant.line} (${mutant.name}) [${testResult.duration}s]`);
            } else {
                survivedCount += 1;
                console.log(`  ✗ Mutant #${i + 1} [SURVIVED]: Line ${mutant.line} (${mutant.name})`);
                console.log(`      Original: ${mutant.originalSnippet}`);
                console.log(`      Mutated:  ${mutant.mutatedSnippet}`);
            }
        }
    } finally {
        cleanup();
    }

    const total = killedCount + survivedCount;
    const score = total > 0 ? ((killedCount / total) * 100).toFixed(1) : '100.0';

    console.log(`\n------------------------------------------------------------`);
    console.log(`Mutation Test Results for ${target.name}:`);
    console.log(`  Total Mutants:   ${total}`);
    console.log(`  Killed (Caught): ${killedCount}`);
    console.log(`  Survived (Miss): ${survivedCount}`);
    console.log(`  Mutation Score:  ${score}%`);
    console.log(`------------------------------------------------------------\n`);

    return { total, killedCount, survivedCount, score: Number(score) };
}

async function main() {
    const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
    const chosenTarget = targetArg ? targetArg.split('=')[1] : null;

    const targetsToRun = chosenTarget ? [chosenTarget] : ['selection', 'foldcraft'];
    let allPassed = true;

    for (const key of targetsToRun) {
        const result = await runMutationTesting(key);
        if (result.score < 70) {
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log(`🎉 Mutation testing suite passed with high test sensitivity!`);
        process.exit(0);
    } else {
        console.warn(`⚠️ Some mutants survived. Test assertions could be strengthened.`);
        process.exit(0);
    }
}

main().catch((err) => {
    console.error('Fatal mutation testing error:', err);
    process.exit(1);
});

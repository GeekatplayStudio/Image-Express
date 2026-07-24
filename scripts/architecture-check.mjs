import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const violations = [];

function walk(directory, results = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(target, results);
        } else if (codeExtensions.has(path.extname(entry.name))) {
            results.push(target);
        }
    }
    return results;
}

function relative(file) {
    return path.relative(root, file).replace(/\\/g, '/');
}

function report(file, rule, message) {
    violations.push(`${relative(file)} [${rule}] ${message}`);
}

for (const file of walk(sourceRoot)) {
    const fileName = relative(file);
    const source = fs.readFileSync(file, 'utf8');
    const isTest = /(?:__tests__\/|\.test\.[jt]sx?$)/.test(fileName);

    if (
        !isTest
        && source.includes('process.cwd()')
        && fileName !== 'src/lib/server/appPaths.ts'
        && fileName !== 'src/lib/comfyui/libraryServer.ts'
    ) {
        report(file, 'mutable-path-root', 'Use the typed application path service instead of process.cwd().');
    }

    if (fileName.startsWith('src/features/')) {
        if (/from ['"]@\/components\//.test(source)) {
            report(file, 'feature-boundary', 'Feature internals may not import legacy component internals.');
        }
        if (/from ['"]@\/app\//.test(source)) {
            report(file, 'feature-boundary', 'Feature internals may not import Next route/page internals.');
        }
        if (/\/ui\/.*\.[jt]sx?$/.test(fileName) && /\bfetch\s*\(/.test(source)) {
            report(file, 'ui-network-boundary', 'Feature UI must call an application service instead of fetch.');
        }
    }

    if (fileName.startsWith('src/shared/')) {
        if (/from ['"]@\/(?:features|components|app)\//.test(source)) {
            report(file, 'shared-boundary', 'Shared code cannot depend on features, components, or app routes.');
        }
        if (source.split('\n').length > 350) {
            report(file, 'shared-size-budget', 'Shared modules must remain at or below 350 lines.');
        }
    }

    if (fileName.startsWith('src/features/') && !isTest && source.split('\n').length > 600) {
        report(file, 'feature-size-budget', 'New feature modules must remain at or below 600 lines.');
    }
}

if (violations.length > 0) {
    console.error('Architecture policy violations:');
    for (const violation of violations) {
        console.error(`- ${violation}`);
    }
    process.exitCode = 1;
} else {
    console.log('Architecture policy checks passed.');
}

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['src/components', 'src/lib', 'src/app/api'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const LARGE_FILE_LIMIT = 500;
const COVERAGE_HEURISTIC_LIMIT = 150;
const PLACEHOLDER_PATTERNS = [
    /coming soon/i,
    /not implemented yet/i,
    /Soon\b/i,
];

function walk(dir, results = []) {
    if (!fs.existsSync(dir)) return results;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'test-results') {
            continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, results);
        } else {
            results.push(fullPath);
        }
    }

    return results;
}

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function lineCount(filePath) {
    return readText(filePath).split('\n').length;
}

function toRelative(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function isCodeFile(filePath) {
    return CODE_EXTENSIONS.has(path.extname(filePath));
}

function isTestFile(filePath) {
    return /\.test\.[jt]sx?$/.test(filePath);
}

function collectCodeFiles() {
    return walk(path.join(ROOT, 'src')).filter((filePath) => isCodeFile(filePath));
}

function collectOversized(files) {
    return files
        .map((filePath) => ({ filePath, lines: lineCount(filePath) }))
        .filter((entry) => entry.lines > LARGE_FILE_LIMIT)
        .sort((left, right) => right.lines - left.lines);
}

function collectDirectTestBasenames(files) {
    return new Set(
        files
            .filter((filePath) => isTestFile(filePath))
            .map((filePath) => path.basename(filePath).replace(/\.test\.[jt]sx?$/, ''))
    );
}

function collectLikelyUntestedFiles(testBasenames) {
    const findings = [];

    for (const sourceDir of SOURCE_DIRS) {
        for (const filePath of walk(path.join(ROOT, sourceDir))) {
            if (!isCodeFile(filePath) || isTestFile(filePath)) continue;
            const basename = path.basename(filePath).replace(/\.[^.]+$/, '');
            const lines = lineCount(filePath);
            if (lines < COVERAGE_HEURISTIC_LIMIT) continue;
            if (testBasenames.has(basename)) continue;

            findings.push({ filePath, lines });
        }
    }

    return findings.sort((left, right) => right.lines - left.lines);
}

function collectPlaceholderMatches(files) {
    const matches = [];

    for (const filePath of files) {
        if (isTestFile(filePath)) continue;
        const lines = readText(filePath).split('\n');
        lines.forEach((line, index) => {
            if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(line))) {
                matches.push({ filePath, line: index + 1, text: line.trim() });
            }
        });
    }

    return matches;
}

function printSection(title, rows, formatter, emptyMessage) {
    console.log(`\n## ${title}`);
    if (rows.length === 0) {
        console.log(emptyMessage);
        return;
    }
    rows.forEach((row) => console.log(formatter(row)));
}

const codeFiles = collectCodeFiles();
const oversizedSourceFiles = collectOversized(codeFiles.filter((filePath) => !isTestFile(filePath)));
const oversizedTestFiles = collectOversized(codeFiles.filter((filePath) => isTestFile(filePath)));
const testBasenames = collectDirectTestBasenames(codeFiles);
const likelyUntestedFiles = collectLikelyUntestedFiles(testBasenames);
const placeholderMatches = collectPlaceholderMatches(codeFiles);

console.log('Image Express repository audit');
console.log(`Scanned ${codeFiles.length} source/test files under src/`);

printSection(
    `Oversized source files (>${LARGE_FILE_LIMIT} lines)`,
    oversizedSourceFiles,
    ({ filePath, lines }) => `- ${String(lines).padStart(4)}  ${toRelative(filePath)}`,
    '- none'
);

printSection(
    `Oversized test files (>${LARGE_FILE_LIMIT} lines)`,
    oversizedTestFiles,
    ({ filePath, lines }) => `- ${String(lines).padStart(4)}  ${toRelative(filePath)}`,
    '- none'
);

printSection(
    `Large files without a direct same-name test heuristic (>=${COVERAGE_HEURISTIC_LIMIT} lines)`,
    likelyUntestedFiles.slice(0, 40),
    ({ filePath, lines }) => `- ${String(lines).padStart(4)}  ${toRelative(filePath)}`,
    '- none'
);

printSection(
    'Runtime placeholders and coming-soon markers',
    placeholderMatches,
    ({ filePath, line, text }) => `- ${toRelative(filePath)}:${line}  ${text}`,
    '- none'
);
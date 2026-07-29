#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const exceptionPath = new URL('../config/dependency-audit-exceptions.json', import.meta.url);
const { exceptions } = JSON.parse(await readFile(exceptionPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const expired = exceptions.filter((entry) => entry.expiresOn < today);
if (expired.length > 0) {
    console.error(`Dependency audit exceptions expired: ${expired.map((entry) => entry.package).join(', ')}`);
    process.exit(1);
}

// Windows resolves npm through npm.cmd, which spawnSync cannot execute without
// a shell; without this the gate silently fails to run on developer machines.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === 'win32',
});
let report;
try {
    report = JSON.parse(audit.stdout);
} catch {
    console.error(audit.stderr || 'Unable to parse npm audit output.');
    process.exit(1);
}

const findings = Object.values(report.vulnerabilities ?? {});
const blocked = findings.filter((finding) => {
    if (!['moderate', 'high', 'critical'].includes(finding.severity)) return false;
    return !exceptions.some((exception) => {
        if (exception.package !== finding.name || exception.severity !== finding.severity) {
            return false;
        }
        return finding.via.some((via) => (
            typeof via === 'object'
            && via.url?.endsWith(exception.advisory)
        )) || finding.via.some((via) => typeof via === 'string');
    });
});

console.log(JSON.stringify({
    status: blocked.length === 0 ? 'passed' : 'failed',
    auditedDependencies: report.metadata?.dependencies?.prod,
    vulnerabilities: report.metadata?.vulnerabilities,
    activeExceptions: exceptions.map(({ package: packageName, advisory, expiresOn }) => ({
        package: packageName,
        advisory,
        expiresOn,
    })),
}, null, 2));

if (blocked.length > 0) {
    console.error(`Unapproved production vulnerabilities: ${blocked.map((finding) => (
        `${finding.name} (${finding.severity})`
    )).join(', ')}`);
    process.exit(1);
}

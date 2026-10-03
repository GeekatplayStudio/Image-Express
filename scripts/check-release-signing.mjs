import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
    throw new Error(`Release tag must match package version v${version}.`);
}
const required = process.platform === 'darwin'
    ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
    : process.platform === 'win32'
        ? ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'] : [];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
    console.error(`Release signing is not configured. Missing: ${missing.join(', ')}.`);
    console.error('See docs/RELEASE_PROCESS.md. Use Desktop smoke for internal unsigned tests.');
    process.exit(1);
}
console.log(`Release signing configuration present for ${process.platform}.`);

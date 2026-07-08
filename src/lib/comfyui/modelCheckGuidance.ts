import type { InstallerRuntimeStatus } from '@/lib/installerRuntimeStatus';

const MISSING_MODEL_VALUE_PATTERN = /=\s*"([^"]+)"/g;

const normalizeModelToken = (value: string): string => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return '';
    }

    const segments = trimmed.split(/[\\/]+/).filter(Boolean);
    return segments[segments.length - 1] || trimmed;
};

const parseMissingModelNames = (message: string): string[] => {
    const matches = message.matchAll(MISSING_MODEL_VALUE_PATTERN);
    const names = Array.from(matches, (match) => normalizeModelToken(match[1] || '')).filter(Boolean);
    return Array.from(new Set(names));
};

const collectInstalledModelTokens = (installerStatus: InstallerRuntimeStatus): Set<string> => {
    const tokens = new Set<string>();

    for (const model of installerStatus.comfyModels) {
        if (!model.exists) {
            continue;
        }

        tokens.add(normalizeModelToken(model.id));
        tokens.add(normalizeModelToken(model.displayName));
        tokens.add(normalizeModelToken(model.targetPath));
    }

    tokens.delete('');
    return tokens;
};

export const isComfyModelAvailabilityError = (message: string): boolean => (
    message.startsWith('ComfyUI model check failed:')
);

export const buildComfyModelAvailabilityGuidance = (
    message: string,
    installerStatus: InstallerRuntimeStatus,
    endpointLabel: string,
): string | null => {
    if (!isComfyModelAvailabilityError(message)) {
        return null;
    }

    if (!installerStatus.comfyDirectory.exists) {
        return `Local install check: no ComfyUI install was found at ${installerStatus.comfyDirectory.path}. Configure the install folder or run the installer before retrying.`;
    }

    const missingModelNames = parseMissingModelNames(message);
    if (missingModelNames.length === 0) {
        return null;
    }

    const installedTokens = collectInstalledModelTokens(installerStatus);
    const presentLocally = missingModelNames.filter((name) => installedTokens.has(normalizeModelToken(name)));
    const missingLocally = missingModelNames.filter((name) => !installedTokens.has(normalizeModelToken(name)));

    const guidanceParts: string[] = [];
    if (presentLocally.length > 0) {
        guidanceParts.push(
            `Local install check: ${presentLocally.join(', ')} ${presentLocally.length === 1 ? 'is' : 'are'} present under ${installerStatus.comfyDirectory.path}, but the connected ${endpointLabel} is not advertising ${presentLocally.length === 1 ? 'it' : 'them'} yet. Restart ComfyUI, reload models, or switch endpoints.`
        );
    }

    if (missingLocally.length > 0) {
        guidanceParts.push(
            `Not found under ${installerStatus.comfyDirectory.path}: ${missingLocally.join(', ')}.`
        );
    }

    return guidanceParts.length > 0 ? guidanceParts.join(' ') : null;
};
import type { ConstellationRole, HarmonyKind } from '@/features/color-constellation/contracts/types';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Static t() keys so keyIntegrity can verify every harmony label. */
export function harmonyKindLabel(kind: HarmonyKind, t: Translate): string {
    switch (kind) {
        case 'complementary':
            return t('constellation.harmony.complementary');
        case 'analogous':
            return t('constellation.harmony.analogous');
        case 'split-complementary':
            return t('constellation.harmony.split-complementary');
        case 'triadic':
            return t('constellation.harmony.triadic');
        case 'tetradic':
            return t('constellation.harmony.tetradic');
        case 'pentadic':
            return t('constellation.harmony.pentadic');
        case 'hexadic':
            return t('constellation.harmony.hexadic');
        default:
            return kind;
    }
}

/** Static t() keys so keyIntegrity can verify every role label. */
export function constellationRoleLabel(role: ConstellationRole, t: Translate): string {
    switch (role) {
        case 'primary':
            return t('constellation.role.primary');
        case 'secondary':
            return t('constellation.role.secondary');
        case 'tertiary':
            return t('constellation.role.tertiary');
        case 'hover':
            return t('constellation.role.hover');
        case 'pressed':
            return t('constellation.role.pressed');
        case 'background':
            return t('constellation.role.background');
        case 'highlight':
            return t('constellation.role.highlight');
        case 'shadow':
            return t('constellation.role.shadow');
        case 'neutral':
            return t('constellation.role.neutral');
        default:
            return role;
    }
}

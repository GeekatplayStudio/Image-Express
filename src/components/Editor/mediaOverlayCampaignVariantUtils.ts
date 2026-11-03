import { MEDIA_OVERLAY_PRESETS } from '@/components/Editor/editorViewConfig';
import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
import type {
    CampaignVariant,
    CampaignVariantMeta,
    CampaignWorkspace,
    MediaOverlayFrameConfig,
} from '@/components/Editor/mediaOverlayTypes';

type UpsertCampaignVariantArgs = {
    workspace: CampaignWorkspace;
    frame: MediaOverlayFrameConfig;
    frameBounds: RectBounds;
    snapshot: DesignJson;
    frameIndex: number;
    now: string;
    thumbnail?: string;
    meta?: CampaignVariantMeta;
};

const DEFAULT_EXPORT_PROFILE = {
    format: 'png',
    includeBackground: true,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cloneDesignJson = (snapshot: DesignJson): DesignJson => JSON.parse(JSON.stringify(snapshot)) as DesignJson;

const isValidRectBounds = (value: unknown): value is RectBounds => {
    if (!isRecord(value)) return false;
    return ['left', 'top', 'width', 'height'].every((key) => Number.isFinite(value[key]));
};

const isValidSnapshot = (value: unknown): value is DesignJson => isRecord(value);

const isValidMeta = (value: unknown): value is CampaignVariantMeta => (
    isRecord(value)
    && (value.designId === null || typeof value.designId === 'string')
    && typeof value.designName === 'string'
    && Number.isFinite(value.canvasWidth)
    && Number.isFinite(value.canvasHeight)
);

const resolveVariantName = (frame: MediaOverlayFrameConfig, frameIndex: number) => {
    const presetLabel = MEDIA_OVERLAY_PRESETS.find((preset) => preset.id === frame.preset)?.exportToken ?? frame.preset;
    return `Frame ${frameIndex + 1} - ${presetLabel}`;
};

export const createEmptyCampaignWorkspace = (): CampaignWorkspace => ({
    activeVariantId: null,
    variants: [],
});

export const buildCampaignWorkspaceStorageKey = (mediaOverlayStorageKey: string) => (
    `${mediaOverlayStorageKey}-campaign-workspace`
);

export function normalizeCampaignWorkspace(input: unknown): CampaignWorkspace {
    if (!isRecord(input) || !Array.isArray(input.variants)) {
        return createEmptyCampaignWorkspace();
    }

    const variants = input.variants
        .map((rawVariant): CampaignVariant | null => {
            if (!isRecord(rawVariant)) return null;
            if (typeof rawVariant.id !== 'string' || typeof rawVariant.name !== 'string') return null;
            if (typeof rawVariant.sourceFrameId !== 'string') return null;
            if (typeof rawVariant.framePreset !== 'string' || typeof rawVariant.safeAreaPreset !== 'string') return null;
            if (!isValidRectBounds(rawVariant.bounds) || !isValidSnapshot(rawVariant.snapshot)) return null;
            if (!isRecord(rawVariant.exportProfile)) return null;
            if (typeof rawVariant.exportProfile.format !== 'string') return null;
            if (typeof rawVariant.exportProfile.includeBackground !== 'boolean') return null;
            if (typeof rawVariant.createdAt !== 'string' || typeof rawVariant.updatedAt !== 'string') return null;

            return {
                id: rawVariant.id,
                name: rawVariant.name,
                sourceFrameId: rawVariant.sourceFrameId,
                framePreset: rawVariant.framePreset,
                safeAreaPreset: rawVariant.safeAreaPreset,
                bounds: {
                    left: Number(rawVariant.bounds.left),
                    top: Number(rawVariant.bounds.top),
                    width: Number(rawVariant.bounds.width),
                    height: Number(rawVariant.bounds.height),
                },
                adaptationMode: rawVariant.adaptationMode === 'fit' || rawVariant.adaptationMode === 'fill'
                    ? rawVariant.adaptationMode
                    : 'safe-area',
                exportProfile: {
                    format: rawVariant.exportProfile.format,
                    includeBackground: rawVariant.exportProfile.includeBackground,
                },
                snapshot: cloneDesignJson(rawVariant.snapshot),
                createdAt: rawVariant.createdAt,
                updatedAt: rawVariant.updatedAt,
                ...(typeof rawVariant.thumbnail === 'string' && rawVariant.thumbnail.startsWith('data:image/')
                    ? { thumbnail: rawVariant.thumbnail }
                    : {}),
                ...(isValidMeta(rawVariant.meta) ? { meta: rawVariant.meta } : {}),
            } as CampaignVariant;
        })
        .filter((variant): variant is CampaignVariant => variant !== null);

    const activeVariantId = typeof input.activeVariantId === 'string'
        && variants.some((variant) => variant.id === input.activeVariantId)
        ? input.activeVariantId
        : variants[0]?.id ?? null;

    return {
        activeVariantId,
        variants,
    };
}

export function upsertCampaignVariantFromFrame({
    workspace,
    frame,
    frameBounds,
    snapshot,
    frameIndex,
    now,
    thumbnail,
    meta,
}: UpsertCampaignVariantArgs) {
    const existingVariant = workspace.variants.find((variant) => variant.sourceFrameId === frame.id);
    const nextVariant: CampaignVariant = {
        id: existingVariant?.id ?? `campaign-variant-${frame.id}`,
        // A name the user typed survives a re-snapshot; a generated one follows the frame.
        name: existingVariant?.name ?? resolveVariantName(frame, frameIndex),
        sourceFrameId: frame.id,
        framePreset: frame.preset,
        safeAreaPreset: frame.safeAreaPreset,
        bounds: { ...frameBounds },
        adaptationMode: existingVariant?.adaptationMode ?? 'safe-area',
        exportProfile: existingVariant?.exportProfile ?? { ...DEFAULT_EXPORT_PROFILE },
        snapshot: cloneDesignJson(snapshot),
        createdAt: existingVariant?.createdAt ?? now,
        updatedAt: now,
        ...(thumbnail ? { thumbnail } : {}),
        ...(meta ? { meta } : {}),
    };

    return {
        didCreate: !existingVariant,
        variant: nextVariant,
        workspace: {
            activeVariantId: nextVariant.id,
            variants: existingVariant
                ? workspace.variants.map((variant) => (
                    variant.id === nextVariant.id ? nextVariant : variant
                ))
                : [...workspace.variants, nextVariant],
        } satisfies CampaignWorkspace,
    };
}

export function renameCampaignVariant(workspace: CampaignWorkspace, variantId: string, name: string, now: string): CampaignWorkspace {
    const trimmed = name.trim();
    if (!trimmed || !workspace.variants.some((variant) => variant.id === variantId)) return workspace;
    return {
        ...workspace,
        variants: workspace.variants.map((variant) => (
            variant.id === variantId && variant.name !== trimmed ? { ...variant, name: trimmed, updatedAt: now } : variant
        )),
    };
}

/** A copy placed right after its source, named "<name> copy" (then "copy 2", …), and made active. */
export function duplicateCampaignVariant(workspace: CampaignWorkspace, variantId: string, now: string): CampaignWorkspace {
    const index = workspace.variants.findIndex((variant) => variant.id === variantId);
    if (index === -1) return workspace;
    const source = workspace.variants[index];
    const names = new Set(workspace.variants.map((variant) => variant.name));
    let name = `${source.name} copy`;
    for (let n = 2; names.has(name); n += 1) name = `${source.name} copy ${n}`;
    const copy: CampaignVariant = {
        ...source,
        id: `${source.id}-copy-${Date.parse(now) || 0}`,
        // A copy is its own variant; it no longer follows the frame it came from.
        sourceFrameId: `${source.sourceFrameId}:copy:${Date.parse(now) || 0}`,
        name,
        bounds: { ...source.bounds },
        exportProfile: { ...source.exportProfile },
        snapshot: cloneDesignJson(source.snapshot),
        createdAt: now,
        updatedAt: now,
    };
    const variants = [...workspace.variants];
    variants.splice(index + 1, 0, copy);
    return { activeVariantId: copy.id, variants };
}

export function removeCampaignVariant(workspace: CampaignWorkspace, variantId: string): CampaignWorkspace {
    const variants = workspace.variants.filter((variant) => variant.id !== variantId);
    return {
        activeVariantId: workspace.activeVariantId === variantId ? (variants[0]?.id ?? null) : workspace.activeVariantId,
        variants,
    };
}
import { MEDIA_OVERLAY_PRESETS } from '@/components/Editor/editorViewConfig';
import type { DesignJson, RectBounds } from '@/components/Editor/editorView.types';
import type {
    CampaignVariant,
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

const resolveVariantName = (frame: MediaOverlayFrameConfig, frameIndex: number) => {
    const presetLabel = MEDIA_OVERLAY_PRESETS.find((preset) => preset.id === frame.preset)?.label ?? frame.preset;
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
}: UpsertCampaignVariantArgs) {
    const existingVariant = workspace.variants.find((variant) => variant.sourceFrameId === frame.id);
    const nextVariant: CampaignVariant = {
        id: existingVariant?.id ?? `campaign-variant-${frame.id}`,
        name: resolveVariantName(frame, frameIndex),
        sourceFrameId: frame.id,
        framePreset: frame.preset,
        safeAreaPreset: frame.safeAreaPreset,
        bounds: { ...frameBounds },
        adaptationMode: existingVariant?.adaptationMode ?? 'safe-area',
        exportProfile: existingVariant?.exportProfile ?? { ...DEFAULT_EXPORT_PROFILE },
        snapshot: cloneDesignJson(snapshot),
        createdAt: existingVariant?.createdAt ?? now,
        updatedAt: now,
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

export function removeCampaignVariant(workspace: CampaignWorkspace, variantId: string): CampaignWorkspace {
    const variants = workspace.variants.filter((variant) => variant.id !== variantId);
    return {
        activeVariantId: workspace.activeVariantId === variantId ? (variants[0]?.id ?? null) : workspace.activeVariantId,
        variants,
    };
}
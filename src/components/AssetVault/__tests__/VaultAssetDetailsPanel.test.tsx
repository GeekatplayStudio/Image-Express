import { render, screen } from '@testing-library/react';

import VaultAssetDetailsPanel from '@/components/AssetVault/VaultAssetDetailsPanel';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

/**
 * The panel answers "what is this file, and why did the search return it".
 * The second half matters most: a search for "cowboy" returning a house is
 * alarming until the panel says the match was by meaning rather than by name.
 */

const asset = (over: Partial<VaultAssetRecord> = {}): VaultAssetRecord => ({
    id: 'a1',
    name: 'cowboy.glb',
    mimeType: 'model/gltf-binary',
    type: 'models',
    category: 'uploads',
    sizeBytes: 5 * 1024 * 1024,
    origin: {
        connector: 'local',
        uri: 'file://d:/media/3d/cowboy.glb',
        displayPath: 'd:/media/3d/cowboy.glb',
    },
    aliases: [],
    owner: 'Ada',
    createdAt: '2026-01-02T10:30:00.000Z',
    modifiedAt: '2026-03-04T12:00:00.000Z',
    ...over,
} as VaultAssetRecord);

// Echo the key so assertions read against a stable label, and interpolate
// vars the same way the real translator does.
const t = (key: string, vars?: Record<string, string | number>) =>
    (vars ? `${key}:${Object.values(vars).join(',')}` : key);

const renderPanel = (props: Partial<React.ComponentProps<typeof VaultAssetDetailsPanel>> = {}) =>
    render(
        <VaultAssetDetailsPanel
            asset={asset()}
            match={null}
            onOpenPreview={jest.fn()}
            t={t}
            language="en"
            {...props}
        />,
    );

describe('VaultAssetDetailsPanel', () => {
    it('prompts for a selection when nothing is chosen', () => {
        renderPanel({ asset: null });
        expect(screen.getByText('vault.details.empty')).toBeInTheDocument();
    });

    it('shows the name and the full path, not a truncated one', () => {
        renderPanel();
        expect(screen.getByText('cowboy.glb')).toBeInTheDocument();
        expect(screen.getByText('d:/media/3d/cowboy.glb')).toBeInTheDocument();
    });

    it('shows size in units a person would say', () => {
        renderPanel();
        expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    });

    it('falls back to the uri when there is no display path', () => {
        renderPanel({
            asset: asset({
                origin: { connector: 'local', uri: 'file://d:/raw/x.png', displayPath: '' },
            } as Partial<VaultAssetRecord>),
        });
        expect(screen.getByText('d:/raw/x.png')).toBeInTheDocument();
    });

    it('renders a dash rather than NaN for a missing size or date', () => {
        renderPanel({
            asset: asset({ sizeBytes: undefined, createdAt: undefined } as Partial<VaultAssetRecord>),
        });
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('survives an unparseable date instead of blanking', () => {
        renderPanel({ asset: asset({ modifiedAt: 'not-a-date' } as Partial<VaultAssetRecord>) });
        expect(screen.getByText('cowboy.glb')).toBeInTheDocument();
    });

    it('says nothing about matching when the asset was browsed to', () => {
        renderPanel();
        expect(screen.queryByText('vault.details.whyMatched')).not.toBeInTheDocument();
    });

    it('explains a keyword match in words, not as a raw tag', () => {
        renderPanel({ match: { score: 0.87, matchReasons: ['keyword: cowboy'] } });
        expect(screen.getByText('vault.searchMatchKeyword:cowboy')).toBeInTheDocument();
        expect(screen.getByText(/0\.870/)).toBeInTheDocument();
    });

    it('says a contextual hit matched by meaning, not by name', () => {
        // This is the one users ask about: why a house came back for "cowboy".
        renderPanel({ match: { score: 0.31, matchReasons: ['vector-context'] } });
        expect(screen.getByText('vault.searchMatchContext')).toBeInTheDocument();
    });

    it('names a hybrid match as both', () => {
        renderPanel({ match: { score: 0.5, matchReasons: ['hybrid: keyword+vector'] } });
        expect(screen.getByText('vault.searchMatchHybrid')).toBeInTheDocument();
    });

    it('still explains a hit that arrived with no reasons attached', () => {
        renderPanel({ match: { score: 0.2, matchReasons: [] } });
        expect(screen.getByText('vault.searchMatchContext')).toBeInTheDocument();
    });

    it('shows tags and description when the AI index has filled them in', () => {
        renderPanel({
            asset: asset({ tags: ['western', 'character'], description: 'A cowboy figure.' } as Partial<VaultAssetRecord>),
        });
        expect(screen.getByText('western')).toBeInTheDocument();
        expect(screen.getByText('A cowboy figure.')).toBeInTheDocument();
    });
});

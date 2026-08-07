import { fireEvent, render, screen } from '@testing-library/react';

import VaultFolderTreeSidebar from '@/components/AssetVault/VaultFolderTreeSidebar';
import { buildVaultFolderTree } from '@/features/asset-vault/domain/vaultFolderTree';
import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const asset = (id: string, uri: string): VaultAssetRecord => ({
    id,
    name: uri.split('/').pop() ?? id,
    mimeType: 'image/png',
    type: 'images',
    category: 'uploads',
    sizeBytes: 1,
    origin: { connector: 'local', uri, displayPath: uri },
    aliases: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
} as VaultAssetRecord);

const tree = buildVaultFolderTree([
    asset('a1', 'file://d:/100_FUJI/DSCF0001.JPG'),
    asset('a2', 'file://d:/100_FUJI/DSCF0002.JPG'),
    asset('a3', 'file://d:/360-raw/Camera01/Thumb/IMG.bmp'),
]);

const baseProps = {
    tree,
    totalAssetCount: 3,
    activeFolderId: null,
    expandedFolderIds: new Set<string>(),
    includeSubfolders: true,
    onSelectAll: jest.fn(),
    onSelectFolder: jest.fn(),
    onToggleExpanded: jest.fn(),
    onToggleIncludeSubfolders: jest.fn(),
};

describe('VaultFolderTreeSidebar', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders only root folders while nothing is expanded', () => {
        render(<VaultFolderTreeSidebar {...baseProps} />);
        expect(screen.getByText('d:')).toBeInTheDocument();
        // Children stay collapsed until asked for — this is what keeps a
        // 200k-asset catalog cheap to render.
        expect(screen.queryByText('100_FUJI')).toBeNull();
        expect(screen.queryByText('Camera01')).toBeNull();
    });

    it('reveals children of an expanded folder', () => {
        render(<VaultFolderTreeSidebar {...baseProps} expandedFolderIds={new Set(['d:'])} />);
        expect(screen.getByText('100_FUJI')).toBeInTheDocument();
        expect(screen.getByText('360-raw')).toBeInTheDocument();
        // Grandchildren remain hidden — only the opened branch expands.
        expect(screen.queryByText('Camera01')).toBeNull();
    });

    it('shows recursive asset counts on each folder row', () => {
        render(<VaultFolderTreeSidebar {...baseProps} expandedFolderIds={new Set(['d:'])} />);
        // Scope to the row itself — a bare getByText('3') also matches the
        // all-assets total, which is the same number here.
        expect(screen.getByTitle('d:')).toHaveTextContent(/d:\s*3/);
        expect(screen.getByTitle('d:/100_FUJI')).toHaveTextContent(/100_FUJI\s*2/);
        expect(screen.getByTitle('d:/360-raw')).toHaveTextContent(/360-raw\s*1/);
    });

    it('selects a folder by its stable path id', () => {
        render(<VaultFolderTreeSidebar {...baseProps} expandedFolderIds={new Set(['d:'])} />);
        fireEvent.click(screen.getByText('100_FUJI'));
        expect(baseProps.onSelectFolder).toHaveBeenCalledWith('d:/100_FUJI');
    });

    it('toggles expansion from the chevron', () => {
        render(<VaultFolderTreeSidebar {...baseProps} />);
        fireEvent.click(screen.getByLabelText('vault.expandFolder'));
        expect(baseProps.onToggleExpanded).toHaveBeenCalledWith('d:');
    });

    it('marks the active folder and exposes the all-assets escape hatch', () => {
        render(<VaultFolderTreeSidebar
            {...baseProps}
            activeFolderId="d:/100_FUJI"
            expandedFolderIds={new Set(['d:'])}
        />);
        fireEvent.click(screen.getByText('vault.allAssets'));
        expect(baseProps.onSelectAll).toHaveBeenCalled();
    });

    it('reflects and toggles the subfolder inclusion state', () => {
        const { rerender } = render(<VaultFolderTreeSidebar {...baseProps} includeSubfolders={false} />);
        const toggle = screen.getByText('vault.includeSubfolders');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(toggle);
        expect(baseProps.onToggleIncludeSubfolders).toHaveBeenCalled();

        rerender(<VaultFolderTreeSidebar {...baseProps} includeSubfolders />);
        expect(screen.getByText('vault.includeSubfolders')).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows an empty state when nothing is indexed', () => {
        render(<VaultFolderTreeSidebar
            {...baseProps}
            tree={buildVaultFolderTree([])}
            totalAssetCount={0}
        />);
        expect(screen.getByText('vault.noFolders')).toBeInTheDocument();
    });
});

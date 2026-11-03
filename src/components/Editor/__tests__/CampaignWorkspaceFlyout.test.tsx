import { fireEvent, render, screen } from '@testing-library/react';

import CampaignWorkspaceFlyout from '@/components/Editor/CampaignWorkspaceFlyout';
import type { CampaignWorkspaceApi } from '@/components/Editor/useMediaOverlayCampaignVariants';
import type { CampaignVariant } from '@/components/Editor/mediaOverlayTypes';

jest.mock('@/providers/I18nProvider', () => ({
    useI18n: () => ({ t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key) }),
}));

const variant = (id: string, name: string): CampaignVariant => ({
    id,
    name,
    sourceFrameId: `frame-${id}`,
    framePreset: 'instagram-square',
    safeAreaPreset: 'none',
    bounds: { left: 0, top: 0, width: 1080, height: 1080 },
    adaptationMode: 'safe-area',
    exportProfile: { format: 'png', includeBackground: true },
    snapshot: {} as CampaignVariant['snapshot'],
    createdAt: 'x',
    updatedAt: 'x',
});

const api = (variants: CampaignVariant[]): CampaignWorkspaceApi => ({
    campaignVariants: variants,
    activeCampaignVariantId: variants[0]?.id ?? null,
    activeCampaignVariant: variants[0] ?? null,
    isExportingCampaign: false,
    handleConvertActiveMediaOverlayFrameToVariant: jest.fn(() => true),
    handleSelectCampaignVariant: jest.fn(),
    handleRemoveCampaignVariant: jest.fn(),
    handleRenameCampaignVariant: jest.fn(),
    handleDuplicateCampaignVariant: jest.fn(),
    handleExportCampaignVariant: jest.fn(async () => true),
    handleExportAllCampaignVariants: jest.fn(async () => true),
});

describe('CampaignWorkspaceFlyout', () => {
    it('renders nothing while closed', () => {
        render(<CampaignWorkspaceFlyout open={false} onClose={jest.fn()} workspace={api([])} canSnapshot />);
        expect(screen.queryByTestId('campaign-workspace-flyout')).toBeNull();
    });

    it('lists variants, marks the active one, and routes every action to the workspace', async () => {
        const workspace = api([variant('a', 'Story'), variant('b', 'Feed')]);
        const onClose = jest.fn();
        render(<CampaignWorkspaceFlyout open onClose={onClose} workspace={workspace} canSnapshot />);

        const rows = screen.getAllByTestId('campaign-variant-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveAttribute('data-active', 'true');
        expect(rows[1]).toHaveAttribute('data-active', 'false');

        fireEvent.click(screen.getByText('Feed'));
        expect(workspace.handleSelectCampaignVariant).toHaveBeenCalledWith('b');

        fireEvent.click(screen.getAllByLabelText('campaignWorkspace.duplicate')[1]);
        expect(workspace.handleDuplicateCampaignVariant).toHaveBeenCalledWith('b');

        fireEvent.click(screen.getAllByLabelText('campaignWorkspace.exportOne')[0]);
        expect(workspace.handleExportCampaignVariant).toHaveBeenCalledWith('a');

        fireEvent.click(screen.getAllByLabelText('campaignWorkspace.delete')[0]);
        expect(workspace.handleRemoveCampaignVariant).toHaveBeenCalledWith('a');

        fireEvent.click(screen.getByText('campaignWorkspace.exportAll'));
        expect(workspace.handleExportAllCampaignVariants).toHaveBeenCalled();

        fireEvent.click(screen.getByText('campaignWorkspace.snapshotActiveFrame'));
        expect(workspace.handleConvertActiveMediaOverlayFrameToVariant).toHaveBeenCalled();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('renames inline and commits on Enter, abandons on Escape', () => {
        const workspace = api([variant('a', 'Story')]);
        render(<CampaignWorkspaceFlyout open onClose={jest.fn()} workspace={workspace} canSnapshot />);

        const renameButton = () => screen.getByRole('button', { name: 'campaignWorkspace.rename' });
        const renameInput = () => screen.getByRole('textbox', { name: 'campaignWorkspace.rename' });

        fireEvent.click(renameButton());
        fireEvent.change(renameInput(), { target: { value: 'Story v2' } });
        fireEvent.keyDown(renameInput(), { key: 'Enter' });
        expect(workspace.handleRenameCampaignVariant).toHaveBeenCalledWith('a', 'Story v2');
        expect(screen.queryByRole('textbox')).toBeNull();

        fireEvent.click(renameButton());
        fireEvent.keyDown(renameInput(), { key: 'Escape' });
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(workspace.handleRenameCampaignVariant).toHaveBeenCalledTimes(1);
    });

    it('disables the snapshot button when no frame can be snapshotted', () => {
        render(<CampaignWorkspaceFlyout open onClose={jest.fn()} workspace={api([])} canSnapshot={false} />);
        expect(screen.getByText('campaignWorkspace.snapshotActiveFrame')).toBeDisabled();
        expect(screen.getByText('campaignWorkspace.empty')).toBeInTheDocument();
    });
});

'use client';

import { fetchInstallerRuntimeStatus } from '@/lib/installerRuntimeStatus';
import type { ComfyConnectionSettings } from '../../hooks/useComfyConnectionSettings';
import type { InstallerSettings } from '../../hooks/useInstallerSettings';
import type { ComfyLibrarySettings } from '../../hooks/useComfyLibrarySettings';
import ComfyDefaultsPanel from './ComfyDefaultsPanel';
import ComfyManagerPanel from './ComfyManagerPanel';

interface ComfyTabProps {
    comfy: ComfyConnectionSettings;
    installer: InstallerSettings;
    library: ComfyLibrarySettings;
}

/** "Comfy & Defaults" settings tab: generative defaults/connection, then installer + library management. */
export default function ComfyTab({ comfy, installer, library }: ComfyTabProps) {
    const handleVerifyLocalSetup = () => {
        void comfy.handleVerifyLocalComfySetup(
            (installPath) => fetchInstallerRuntimeStatus(installPath),
            (status) => installer.applyInstallerStatus(status as Parameters<typeof installer.applyInstallerStatus>[0]),
        );
    };

    return (
        <>
            <ComfyDefaultsPanel comfy={comfy} installer={installer} library={library} onVerifyLocalSetup={handleVerifyLocalSetup} />
            <ComfyManagerPanel
                installer={installer}
                library={library}
                comfyInstallPath={comfy.comfyInstallPath}
                onRunInstallerWorkflow={installer.handleRunInstallerWorkflow}
            />

            <div className="grid gap-2 sm:grid-cols-2 xl:col-span-12">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={comfy.autoStartInpaintMasking}
                        onChange={(event) => comfy.setAutoStartInpaintMasking(event.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Auto-start mask brush when opening Generative Fill
                </label>

                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={comfy.showInpaintPromptDock}
                        onChange={(event) => comfy.setShowInpaintPromptDock(event.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    Show quick prompt dock for Generative Fill
                </label>
            </div>

            <div className="text-[11px] rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-muted-foreground xl:col-span-12">
                Selected provider status: {comfy.isGenerativeProviderReady(comfy.defaultGenerativeProvider) ? 'runtime ready' : 'coming soon'}
                {comfy.providerHasConfiguredKey(comfy.defaultGenerativeProvider) ? ' + configured' : ' + missing key/config (fallback applies)'}
            </div>
        </>
    );
}

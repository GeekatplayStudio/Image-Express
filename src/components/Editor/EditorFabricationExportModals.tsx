import CricutExportModal from '@/components/Editor/CricutExportModal';
import EmbroideryExportModal from '@/components/Editor/EmbroideryExportModal';

export type FabricationExportState = {
    kind: 'embroidery' | 'cricut';
    sourceDataUrl: string;
} | null;

export default function EditorFabricationExportModals({
    exportState,
    designName,
    onClose,
}: {
    exportState: FabricationExportState;
    designName: string;
    onClose: () => void;
}) {
    if (!exportState) return null;
    return exportState.kind === 'cricut' ? (
        <CricutExportModal sourceDataUrl={exportState.sourceDataUrl} designName={designName} onClose={onClose} />
    ) : (
        <EmbroideryExportModal sourceDataUrl={exportState.sourceDataUrl} designName={designName} onClose={onClose} />
    );
}

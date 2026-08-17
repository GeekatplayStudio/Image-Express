export type FabricationWorkflowId = '3d-gen' | '3d-library' | 'cricut-studio' | 'cnc-planner';

export type FabricationWorkflow = {
    id: FabricationWorkflowId;
    titleKey: string;
    descriptionKey: string;
    stage: 'design' | 'prepare' | 'fabricate';
};

export const FABRICATION_WORKFLOWS: FabricationWorkflow[] = [
    { id: '3d-gen', titleKey: 'fabrication.workflow.generate3d', descriptionKey: 'fabrication.workflow.generate3dDesc', stage: 'design' },
    { id: '3d-library', titleKey: 'fabrication.workflow.models', descriptionKey: 'fabrication.workflow.modelsDesc', stage: 'design' },
    { id: 'cricut-studio', titleKey: 'fabrication.workflow.cricut', descriptionKey: 'fabrication.workflow.cricutDesc', stage: 'prepare' },
    { id: 'cnc-planner', titleKey: 'fabrication.workflow.cnc', descriptionKey: 'fabrication.workflow.cncDesc', stage: 'fabricate' },
];

export type FabricationMaterial = {
    id: string;
    material: string;
    process: 'cricut' | 'cnc-knife' | 'both';
    thicknessMm: string;
    guidance: string;
};

export const FABRICATION_MATERIALS: FabricationMaterial[] = [
    { id: 'cardstock', material: 'Cardstock', process: 'cricut', thicknessMm: '0.2–0.5', guidance: 'LightGrip or StandardGrip mat; test cut before production.' },
    { id: 'vinyl', material: 'Adhesive vinyl', process: 'cricut', thicknessMm: '0.08–0.15', guidance: 'Mirror only for heat-transfer vinyl; weed after cutting.' },
    { id: 'chipboard', material: 'Chipboard', process: 'cricut', thicknessMm: '1–2', guidance: 'Knife blade, strong-grip mat, multiple passes.' },
    { id: 'eva', material: 'EVA foam', process: 'both', thicknessMm: '1–10', guidance: 'Use a fresh knife and reduce feed rate as thickness increases.' },
    { id: 'eps', material: 'EPS foam', process: 'cnc-knife', thicknessMm: '10–200', guidance: 'Low cutting force; control dust and static accumulation.' },
    { id: 'xps', material: 'XPS foam', process: 'cnc-knife', thicknessMm: '10–150', guidance: 'Use shallow step-downs and validate oscillation speed.' },
    { id: 'epp', material: 'EPP foam', process: 'cnc-knife', thicknessMm: '10–100', guidance: 'Elastic stock benefits from sharp blades and secure fixturing.' },
    { id: 'pu', material: 'Polyurethane foam', process: 'cnc-knife', thicknessMm: '10–150', guidance: 'Verify ventilation and material safety data before cutting.' },
];

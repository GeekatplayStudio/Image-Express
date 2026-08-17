export type CncInventoryCategory = 'structure' | 'motion' | 'actuators' | 'toolhead' | 'electronics' | 'hardware';

export type CncInventoryItem = {
    id: string;
    category: CncInventoryCategory;
    component: string;
    specification: string;
    quantity: number;
    unit: string;
    axis?: 'X' | 'Y' | 'Z' | 'A/C' | 'all';
    safetyCritical?: boolean;
};

export const CNC_CATEGORY_KEYS: Record<CncInventoryCategory, string> = {
    structure: 'fabrication.category.structure',
    motion: 'fabrication.category.motion',
    actuators: 'fabrication.category.actuators',
    toolhead: 'fabrication.category.toolhead',
    electronics: 'fabrication.category.electronics',
    hardware: 'fabrication.category.hardware',
};

export const CNC_FOAM_CUTTER_INVENTORY: CncInventoryItem[] = [
    { id: 'beam-80160', category: 'structure', component: 'Cantilever box beam / extrusion', specification: 'Heavy-duty aluminum, 80 × 160 mm; length to machine envelope', quantity: 1, unit: 'beam' },
    { id: 'extrusion-2040', category: 'structure', component: 'Stationary bed extrusion', specification: 'Aluminum T-slot, 20 × 40 mm', quantity: 6, unit: 'lengths' },
    { id: 'extrusion-2020', category: 'structure', component: 'Bed brace extrusion', specification: 'Aluminum T-slot, 20 × 20 mm', quantity: 6, unit: 'lengths' },
    { id: 'rail-x', category: 'motion', component: 'Rear X-axis profile rail', specification: '15 or 20 mm profile linear rail', quantity: 2, unit: 'rails', axis: 'X' },
    { id: 'carriage-x', category: 'motion', component: 'X-axis bearing carriage', specification: 'Matched to rear profile rails', quantity: 4, unit: 'carriages', axis: 'X' },
    { id: 'rail-y', category: 'motion', component: 'Arm Y-axis profile rail', specification: '15 mm profile linear rail', quantity: 1, unit: 'rail', axis: 'Y' },
    { id: 'carriage-y', category: 'motion', component: 'Y-axis bearing carriage', specification: 'Matched to arm profile rail', quantity: 2, unit: 'carriages', axis: 'Y' },
    { id: 'belt-x', category: 'motion', component: 'X-axis timing belt', specification: '15 mm HTD or GT profile', quantity: 1, unit: 'loop', axis: 'X' },
    { id: 'belt-y', category: 'motion', component: 'Y-axis timing belt', specification: '9–15 mm GT profile', quantity: 1, unit: 'loop', axis: 'Y' },
    { id: 'lead-z', category: 'motion', component: 'Z-axis lead screw kit', specification: 'T8 lead screw with anti-backlash nut and supports', quantity: 1, unit: 'kit', axis: 'Z' },
    { id: 'pulleys', category: 'motion', component: 'Timing pulleys and idlers', specification: 'Profile matched to selected X/Y belts', quantity: 8, unit: 'assorted', axis: 'all' },
    { id: 'motor-x', category: 'actuators', component: 'X-axis stepper motor', specification: 'NEMA 23, torque sized after gantry load calculation', quantity: 1, unit: 'motor', axis: 'X' },
    { id: 'motor-y', category: 'actuators', component: 'Y-axis stepper motor', specification: 'NEMA 17 or compact NEMA 23', quantity: 1, unit: 'motor', axis: 'Y' },
    { id: 'motor-z', category: 'actuators', component: 'Z-axis stepper motor', specification: 'Standard NEMA 17', quantity: 1, unit: 'motor', axis: 'Z' },
    { id: 'motor-ac', category: 'actuators', component: 'A/C rotary-axis actuator', specification: 'Compact geared NEMA 17 or small servo', quantity: 2, unit: 'motors', axis: 'A/C' },
    { id: 'knife-motor', category: 'toolhead', component: 'Oscillating-knife motor', specification: 'High-speed DC or brushless motor with speed control', quantity: 1, unit: 'motor', safetyCritical: true },
    { id: 'eccentric-cam', category: 'toolhead', component: 'Eccentric cam mechanism', specification: 'Balanced stroke mechanism with guarded moving parts', quantity: 1, unit: 'assembly', safetyCritical: true },
    { id: 'c-bearing', category: 'toolhead', component: 'C-axis rotary bearings', specification: 'Low-play bearing pair sized to tool shaft', quantity: 2, unit: 'bearings', axis: 'A/C' },
    { id: 'retract', category: 'toolhead', component: 'Spring-loaded retract mechanism', specification: 'Fail-safe blade retraction on loss of force', quantity: 1, unit: 'assembly', safetyCritical: true },
    { id: 'blades', category: 'toolhead', component: 'Foam-cutting blades', specification: 'Assorted oscillating-knife blades for stock density', quantity: 1, unit: 'pack', safetyCritical: true },
    { id: 'controller', category: 'electronics', component: 'Multi-axis motion controller', specification: 'Five-axis minimum; LinuxCNC or GRBLHAL compatible', quantity: 1, unit: 'controller', safetyCritical: true },
    { id: 'drivers', category: 'electronics', component: 'Stepper / servo drivers', specification: 'Matched current and voltage for each selected actuator', quantity: 5, unit: 'drivers', axis: 'all', safetyCritical: true },
    { id: 'power', category: 'electronics', component: 'Main power supply', specification: '24 V or 48 V with calculated current headroom', quantity: 1, unit: 'supply', safetyCritical: true },
    { id: 'motor-cable', category: 'electronics', component: 'Shielded motor cable', specification: 'Flexible cable rated for drag-chain duty', quantity: 5, unit: 'runs', axis: 'all', safetyCritical: true },
    { id: 'limits', category: 'electronics', component: 'Mechanical limit / home switch', specification: 'Positive-opening preferred; cover all linear and rotary axes', quantity: 7, unit: 'switches', axis: 'all', safetyCritical: true },
    { id: 'estop', category: 'electronics', component: 'Emergency-stop station', specification: 'Latching mushroom switch wired to remove actuator energy', quantity: 1, unit: 'station', safetyCritical: true },
    { id: 'probe', category: 'electronics', component: 'Z-height probe', specification: 'Touch probe or low-force spring switch', quantity: 1, unit: 'probe', axis: 'Z' },
    { id: 'drag-chain', category: 'electronics', component: 'Flexible cable drag chain', specification: 'Bend radius matched to shielded motor cables', quantity: 3, unit: 'runs', axis: 'all' },
    { id: 'tnuts-m5', category: 'hardware', component: 'M5 drop-in T-nut', specification: 'Profile-compatible zinc-plated or stainless', quantity: 200, unit: 'pieces' },
    { id: 'shcs-m5', category: 'hardware', component: 'M5 socket-head cap screw assortment', specification: '8, 10, 12, 16, 20 and 25 mm lengths', quantity: 200, unit: 'pieces' },
    { id: 'screws-m3', category: 'hardware', component: 'M3 screw assortment', specification: 'Motor, sensor and electronics mounting', quantity: 50, unit: 'pieces' },
    { id: 'screws-m4', category: 'hardware', component: 'M4 screw assortment', specification: 'Motor and bracket mounting', quantity: 50, unit: 'pieces' },
    { id: 'brackets', category: 'hardware', component: 'Right-angle cast aluminum bracket', specification: 'Matched to 20-series extrusion', quantity: 24, unit: 'brackets' },
    { id: 'plates', category: 'hardware', component: 'Extrusion joining plate', specification: 'Flat and gusseted plates as required', quantity: 12, unit: 'plates' },
    { id: 'feet', category: 'hardware', component: 'Leveling foot', specification: 'Threaded, vibration-resistant machine foot', quantity: 4, unit: 'feet' },
];

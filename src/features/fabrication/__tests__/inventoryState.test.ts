import {
    buildInventoryCsv,
    CNC_INVENTORY_STORAGE_KEY,
    inventoryCompletion,
    loadInventoryQuantities,
} from '../application/inventoryState';
import type { CncInventoryItem } from '../domain/cncFoamCutterInventory';

const items: CncInventoryItem[] = [
    { id: 'rail', category: 'motion', component: 'Linear rail', specification: '15 mm', quantity: 2, unit: 'rails', axis: 'X' },
    { id: 'stop', category: 'electronics', component: 'Emergency "stop"', specification: 'Latching', quantity: 1, unit: 'station', safetyCritical: true },
];

describe('CNC inventory state', () => {
    beforeEach(() => window.localStorage.clear());

    it('caps acquired counts when calculating completion', () => {
        expect(inventoryCompletion(items, { rail: 20, stop: 0 })).toEqual({
            acquired: 2,
            required: 3,
            percent: 2 / 3 * 100,
        });
    });

    it('ignores malformed persisted quantities', () => {
        window.localStorage.setItem(CNC_INVENTORY_STORAGE_KEY, JSON.stringify({ rail: 1, stop: -1, bad: 'yes' }));
        expect(loadInventoryQuantities()).toEqual({ rail: 1 });
    });

    it('exports a spreadsheet-safe CSV with hardware and safety status', () => {
        const csv = buildInventoryCsv(items, { rail: 1, stop: 1 });
        expect(csv).toContain('"Emergency ""stop"""');
        expect(csv).toContain('"electronics","Emergency ""stop""","Latching","","1","1","station","yes"');
    });
});

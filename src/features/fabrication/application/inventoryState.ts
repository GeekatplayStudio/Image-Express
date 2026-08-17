import type { CncInventoryItem } from '../domain/cncFoamCutterInventory';

export const CNC_INVENTORY_STORAGE_KEY = 'image-express-cnc-foam-cutter-inventory-v1';

export type InventoryQuantities = Record<string, number>;

export function loadInventoryQuantities(): InventoryQuantities {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(CNC_INVENTORY_STORAGE_KEY) || '{}') as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => (
            typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [[id, value]] : []
        )));
    } catch {
        return {};
    }
}

export function saveInventoryQuantities(quantities: InventoryQuantities) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CNC_INVENTORY_STORAGE_KEY, JSON.stringify(quantities));
}

export function inventoryCompletion(items: CncInventoryItem[], quantities: InventoryQuantities) {
    const required = items.reduce((sum, item) => sum + item.quantity, 0);
    const acquired = items.reduce((sum, item) => sum + Math.min(item.quantity, Math.max(0, quantities[item.id] || 0)), 0);
    return { required, acquired, percent: required > 0 ? acquired / required * 100 : 0 };
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function buildInventoryCsv(items: CncInventoryItem[], quantities: InventoryQuantities): string {
    const rows = [['Category', 'Component', 'Specification', 'Axis', 'Required', 'Acquired', 'Unit', 'Safety critical']];
    items.forEach((item) => rows.push([
        item.category,
        item.component,
        item.specification,
        item.axis || '',
        String(item.quantity),
        String(quantities[item.id] || 0),
        item.unit,
        item.safetyCritical ? 'yes' : 'no',
    ]));
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

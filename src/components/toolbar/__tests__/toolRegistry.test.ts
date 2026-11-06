import en from '@/lib/i18n/locales/en';
import {
    AI_TOOL_GROUP,
    ALL_TOOLBAR_TOOLS,
    FABRICATION_TOOL_GROUP,
    LIBRARY_TOOLS,
    TOOL_GROUP_BY_ID,
    TOOL_SHORTCUT_KEYS,
    withShortcut,
} from '../toolRegistry';

describe('fabrication tool registry', () => {
    it('combines the fabrication workflows under one right-click group', () => {
        expect(FABRICATION_TOOL_GROUP.defaultTool).toBe('fabrication-library');
        expect(FABRICATION_TOOL_GROUP.tools.map((tool) => tool.name)).toEqual([
            'fabrication-library',
            '3d-gen',
            '3d-stamp',
            '3d-library',
            'cricut-studio',
            'cnc-planner',
        ]);
        expect(TOOL_GROUP_BY_ID.fabrication).toBe(FABRICATION_TOOL_GROUP);
    });

    it('removes the former standalone 3D button from the library rail', () => {
        expect(LIBRARY_TOOLS.some((tool) => tool.name === '3d-gen')).toBe(false);
    });
});

describe('AI tool group', () => {
    it('gathers every AI window, including Campaign Manager, behind one rail button', () => {
        expect(AI_TOOL_GROUP.tools.map((tool) => tool.name)).toEqual([
            'ai-zone', 'comfy-flows', 'ai-upscale', 'ai-critique', 'ai-brand-manager', 'campaign-manager', 'super-agent',
        ]);
        expect(AI_TOOL_GROUP.clickOpensMenu).toBe(true);
        expect(LIBRARY_TOOLS.map((tool) => tool.name)).toEqual(['assets', 'templates']);
    });
});

describe('registry integrity', () => {
    it('lists each tool once', () => {
        const names = ALL_TOOLBAR_TOOLS.map((tool) => tool.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('gives each tool its own icon so no two rail entries look alike', () => {
        const icons = ALL_TOOLBAR_TOOLS.map((tool) => tool.icon);
        expect(new Set(icons).size).toBe(icons.length);
    });

    it('has an English label for every tool and group', () => {
        const dictionary = en as Record<string, string>;
        const keys = [
            ...ALL_TOOLBAR_TOOLS.flatMap((tool) => [tool.labelKey, tool.shortLabelKey].filter(Boolean) as string[]),
            ...Object.values(TOOL_GROUP_BY_ID).map((group) => group.labelKey),
        ];
        expect(keys.filter((key) => !dictionary[key])).toEqual([]);
    });

    it('keeps the single-key shortcuts the editor has always had', () => {
        expect(TOOL_SHORTCUT_KEYS).toEqual({
            v: 'select', q: 'quick-select', k: 'selection-brush', m: 'marquee', l: 'lasso',
            j: 'healing', y: 'history-brush', b: 'paint', r: 'blur', o: 'dodge', s: 'clone-stamp',
            a: 'path-select', c: 'crop', i: 'eyedropper', g: 'gradient', h: 'hand', p: 'pen',
            t: 'text', u: 'shapes', z: 'zoom',
        });
        expect(withShortcut('Move', ALL_TOOLBAR_TOOLS[0])).toBe('Move (V)');
    });
});

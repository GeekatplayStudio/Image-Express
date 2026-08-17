import {
    CREATION_LIBRARY_TOOLS,
    FABRICATION_TOOL_GROUP,
    TOOL_GROUP_BY_ID,
} from '../toolRegistry';

describe('fabrication tool registry', () => {
    it('combines the fabrication workflows under one right-click group', () => {
        expect(FABRICATION_TOOL_GROUP.defaultTool).toBe('fabrication-library');
        expect(FABRICATION_TOOL_GROUP.tools.map((tool) => tool.name)).toEqual([
            'fabrication-library',
            '3d-gen',
            '3d-library',
            'cricut-studio',
            'cnc-planner',
        ]);
        expect(TOOL_GROUP_BY_ID.fabrication).toBe(FABRICATION_TOOL_GROUP);
    });

    it('removes the former standalone 3D button from the library rail', () => {
        expect(CREATION_LIBRARY_TOOLS.some((tool) => tool.name === '3d-gen')).toBe(false);
    });
});

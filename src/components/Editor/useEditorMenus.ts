import { useCallback, useMemo, useState } from 'react';

export type EditorMenuId =
    | 'file'
    | 'edit'
    | 'image'
    | 'layer'
    | 'select'
    | 'filter'
    | 'view'
    | 'window'
    | 'settings'
    | 'help'
    | 'export'
    | 'share'
    | 'grid'
    | 'tools';

type MenuState = Record<EditorMenuId, boolean>;

const INITIAL_MENU_STATE: MenuState = {
    file: false,
    edit: false,
    image: false,
    layer: false,
    select: false,
    filter: false,
    view: false,
    window: false,
    settings: false,
    help: false,
    export: false,
    share: false,
    grid: false,
    tools: false,
};

const resolveStateAction = (
    current: boolean,
    next: boolean | ((prev: boolean) => boolean)
): boolean => (typeof next === 'function' ? next(current) : next);

export function useEditorMenus() {
    const [menuState, setMenuState] = useState<MenuState>(INITIAL_MENU_STATE);

    const closeEditorMenus = useCallback((except?: EditorMenuId) => {
        setMenuState((prev) => {
            const next = { ...INITIAL_MENU_STATE };
            if (except) {
                next[except] = prev[except];
            }
            return next;
        });
    }, []);

    const toggleEditorMenu = useCallback((menu: EditorMenuId) => {
        setMenuState((prev) => {
            const next = { ...INITIAL_MENU_STATE };
            next[menu] = !prev[menu];
            return next;
        });
    }, []);

    const openEditorMenu = useCallback((menu: EditorMenuId) => {
        setMenuState(() => {
            const next = { ...INITIAL_MENU_STATE };
            next[menu] = true;
            return next;
        });
    }, []);

    const setShowFileMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, file: resolveStateAction(prev.file, next) }));
    }, []);
    const setShowEditMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, edit: resolveStateAction(prev.edit, next) }));
    }, []);
    const setShowImageMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, image: resolveStateAction(prev.image, next) }));
    }, []);
    const setShowLayerMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, layer: resolveStateAction(prev.layer, next) }));
    }, []);
    const setShowSelectMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, select: resolveStateAction(prev.select, next) }));
    }, []);
    const setShowFilterMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, filter: resolveStateAction(prev.filter, next) }));
    }, []);
    const setShowViewMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, view: resolveStateAction(prev.view, next) }));
    }, []);
    const setShowWindowMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, window: resolveStateAction(prev.window, next) }));
    }, []);
    const setShowSettingsMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, settings: resolveStateAction(prev.settings, next) }));
    }, []);
    const setShowHelpMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, help: resolveStateAction(prev.help, next) }));
    }, []);
    const setShowExportMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, export: resolveStateAction(prev.export, next) }));
    }, []);
    const setShowShareMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, share: resolveStateAction(prev.share, next) }));
    }, []);
    const setShowGridMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, grid: resolveStateAction(prev.grid, next) }));
    }, []);
    const setShowToolsMenu = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
        setMenuState((prev) => ({ ...prev, tools: resolveStateAction(prev.tools, next) }));
    }, []);

    const isAnyEditorMenuOpen = useMemo(
        () => Object.values(menuState).some(Boolean),
        [menuState]
    );

    return {
        showFileMenu: menuState.file,
        showEditMenu: menuState.edit,
        showImageMenu: menuState.image,
        showLayerMenu: menuState.layer,
        showSelectMenu: menuState.select,
        showFilterMenu: menuState.filter,
        showViewMenu: menuState.view,
        showWindowMenu: menuState.window,
        showSettingsMenu: menuState.settings,
        showHelpMenu: menuState.help,
        showExportMenu: menuState.export,
        showShareMenu: menuState.share,
        showGridMenu: menuState.grid,
        showToolsMenu: menuState.tools,
        setShowFileMenu,
        setShowEditMenu,
        setShowImageMenu,
        setShowLayerMenu,
        setShowSelectMenu,
        setShowFilterMenu,
        setShowViewMenu,
        setShowWindowMenu,
        setShowSettingsMenu,
        setShowHelpMenu,
        setShowExportMenu,
        setShowShareMenu,
        setShowGridMenu,
        setShowToolsMenu,
        closeEditorMenus,
        toggleEditorMenu,
        openEditorMenu,
        isAnyEditorMenuOpen,
    };
}

/**
 * The stacking order of the app, lowest to highest.
 *
 *   0–99     Workspace chrome: canvas overlays, toolbar rail, header, the
 *            docked and floating panel rails.
 *   100–999  Things chrome opens that belong to the workspace, not to a
 *            popup: floating panels, tool flyouts, context menus, the
 *            pipeline rail.
 *   1000+    Popup windows (modals). Their relative order is kept by adding
 *            their old value to MODAL_LAYER_BASE, so a window opened from
 *            another window still lands above it.
 *   2000     Text prompts, which can be raised from inside any window.
 *   3000     Confirm / alert dialogs — always answerable.
 *   3500     Toasts.
 *
 * The rule this encodes: nothing in the workspace may draw over a popup.
 * Before it existed, windows used ad-hoc values from 50 upward while the
 * header sat at 90, floating panels at 100 and tool flyouts at 2000, so
 * toolbars regularly painted across an open window. `zLayers.test.ts` fails if
 * a full-screen overlay is added below the modal tier.
 */
export const MODAL_LAYER_BASE = 1000;

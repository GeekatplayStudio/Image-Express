import type { VaultAssetRecord } from '@/features/asset-vault/contracts/assetRecord';

/**
 * A real filesystem folder tree built from indexed asset URIs.
 *
 * This is the "where the file actually lives" view, as opposed to the derived
 * groupings in `vaultAlbumTree` ("what the file is"). Two properties matter:
 *
 * - **Ids are the folder path itself**, so they survive re-indexing. Album page
 *   ids are positional (`<album>::page_N`) and renumber whenever the asset
 *   count changes, which silently threw the user back to page 1. A path-keyed
 *   node keeps its identity as long as the folder exists.
 * - **Building is O(total path segments)** — a single pass over the assets with
 *   a flat lookup map, no per-node scans. The catalog is routinely 200k assets,
 *   so anything quadratic is unusable.
 *
 * Rendering must stay lazy: expand only the nodes the user opened. `childIds`
 * makes that cheap without walking the whole tree.
 */

export type VaultFolderNode = {
    /** Stable id: the normalised folder path, e.g. `d:/360-raw/Camera01`. */
    id: string;
    /** Final path segment, for display. `d:` for a drive root. */
    name: string;
    /** Parent node id, or null at a root. */
    parentId: string | null;
    /** Depth from its root; roots are 0. */
    depth: number;
    /** Ids of direct child folders, sorted for display. */
    childIds: string[];
    /** Assets directly in this folder (not in its subfolders). */
    assetIds: string[];
    /** Assets in this folder and everything beneath it. */
    totalCount: number;
    /** The watch root this folder belongs to, when known. */
    watchRootId?: string;
};

export type VaultFolderTree = {
    /** Every node, keyed by id, for O(1) lookup while rendering. */
    nodes: Map<string, VaultFolderNode>;
    /** Top-level node ids (drive/watch roots), sorted. */
    rootIds: string[];
    /** Assets whose origin carried no usable path. */
    unfiledAssetIds: string[];
};

/**
 * Split a vault asset URI into its folder segments plus the file name.
 *
 * Handles the two shapes the catalog actually stores:
 *   `file://d:/360-raw/Camera01/IMG.bmp` -> ['d:', '360-raw', 'Camera01'], 'IMG.bmp'
 *   `server://uploads/images/a.png`      -> ['uploads', 'images'], 'a.png'
 *
 * Returns null when there is no folder component to place the asset under.
 */
export function splitVaultUri(uri: string): { segments: string[]; fileName: string } | null {
    if (!uri) return null;
    // Strip any `scheme://` prefix; both file:// and server:// appear.
    const withoutScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    if (!withoutScheme) return null;

    let decoded = withoutScheme;
    try {
        decoded = decodeURIComponent(withoutScheme);
    } catch {
        // Malformed percent-encoding: fall back to the raw form rather than
        // dropping the asset out of the tree entirely.
    }

    const parts = decoded.split(/[\\/]+/).filter(Boolean);
    if (parts.length < 2) return null;

    const fileName = parts[parts.length - 1];
    return { segments: parts.slice(0, -1), fileName };
}

const compareNames = (a: string, b: string) => (
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
);

/**
 * Build the folder tree in one pass.
 *
 * Assets are attached to their immediate folder; ancestor counts accumulate as
 * we walk each path, so no second traversal is needed.
 */
export function buildVaultFolderTree(assets: VaultAssetRecord[]): VaultFolderTree {
    const nodes = new Map<string, VaultFolderNode>();
    const rootIds = new Set<string>();
    const unfiledAssetIds: string[] = [];

    for (const asset of assets) {
        const split = splitVaultUri(asset.origin?.uri ?? '');
        if (!split || split.segments.length === 0) {
            unfiledAssetIds.push(asset.id);
            continue;
        }

        let parentId: string | null = null;
        let currentId = '';

        for (let depth = 0; depth < split.segments.length; depth += 1) {
            const segment = split.segments[depth];
            currentId = depth === 0 ? segment : `${currentId}/${segment}`;

            let node = nodes.get(currentId);
            if (!node) {
                node = {
                    id: currentId,
                    name: segment,
                    parentId,
                    depth,
                    childIds: [],
                    assetIds: [],
                    totalCount: 0,
                    watchRootId: asset.origin?.watchRootId,
                };
                nodes.set(currentId, node);
                if (parentId === null) {
                    rootIds.add(currentId);
                } else {
                    nodes.get(parentId)?.childIds.push(currentId);
                }
            }

            // Every ancestor on this path gains the asset.
            node.totalCount += 1;
            parentId = currentId;
        }

        nodes.get(currentId)?.assetIds.push(asset.id);
    }

    // Sort once at the end — cheaper than keeping every childIds array ordered
    // during insertion.
    for (const node of nodes.values()) {
        node.childIds.sort((a, b) => compareNames(
            nodes.get(a)?.name ?? a,
            nodes.get(b)?.name ?? b,
        ));
    }

    return {
        nodes,
        rootIds: Array.from(rootIds).sort((a, b) => compareNames(
            nodes.get(a)?.name ?? a,
            nodes.get(b)?.name ?? b,
        )),
        unfiledAssetIds,
    };
}

/** Ancestor ids of `nodeId`, root first — for breadcrumbs and auto-expansion. */
export function vaultFolderPath(tree: VaultFolderTree, nodeId: string): VaultFolderNode[] {
    const chain: VaultFolderNode[] = [];
    let current = tree.nodes.get(nodeId);
    // Bounded by tree depth; the guard is against a malformed cyclic parent.
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        chain.unshift(current);
        current = current.parentId ? tree.nodes.get(current.parentId) : undefined;
    }
    return chain;
}

/**
 * Assets in `nodeId`, optionally including everything beneath it.
 *
 * Recursive collection walks only the requested subtree, so opening a shallow
 * folder in a 200k-asset catalog does not touch unrelated branches.
 */
export function assetIdsInVaultFolder(
    tree: VaultFolderTree,
    nodeId: string,
    options?: { recursive?: boolean },
): string[] {
    const start = tree.nodes.get(nodeId);
    if (!start) return [];
    if (!options?.recursive) return start.assetIds;

    const collected: string[] = [];
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        collected.push(...node.assetIds);
        for (const childId of node.childIds) {
            const child = tree.nodes.get(childId);
            if (child) stack.push(child);
        }
    }
    return collected;
}

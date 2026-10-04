import type { ComfyWorkflowInstallableModel } from '@/lib/comfyui/registryTypes';

/**
 * Models a saved workflow says it needs.
 *
 * Template authors list each model on the node that loads it
 * (`properties.models`: name, url, directory), including inside subgraphs.
 * Reading that list is what lets the app say which files are missing and offer
 * to download them — for the built-in templates and for any workflow a user adds.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const collectInstallableModelsFromGraph = (
    graph: Record<string, unknown>,
    models: Map<string, ComfyWorkflowInstallableModel>,
    visitedSubgraphs: Set<string>
) => {
    const nodes = Array.isArray(graph.nodes)
        ? graph.nodes as Array<Record<string, unknown>>
        : [];

    for (const node of nodes) {
        const properties = isRecord(node.properties)
            ? node.properties as Record<string, unknown>
            : null;
        const modelEntries = Array.isArray(properties?.models)
            ? properties.models as Array<Record<string, unknown>>
            : [];

        for (const entry of modelEntries) {
            const name = typeof entry.name === 'string' ? entry.name.trim() : '';
            const downloadUrl = typeof entry.url === 'string' ? entry.url.trim() : '';
            const directory = typeof entry.directory === 'string' ? entry.directory.trim() : '';

            if (!name || !downloadUrl || !directory) {
                continue;
            }

            const key = `${directory}/${name}`.toLowerCase();
            if (!models.has(key)) {
                models.set(key, { name, downloadUrl, directory });
            }
        }
    }

    const subgraphs = isRecord(graph.definitions) && Array.isArray(graph.definitions.subgraphs)
        ? graph.definitions.subgraphs as Array<Record<string, unknown>>
        : [];

    for (const subgraph of subgraphs) {
        const subgraphId = typeof subgraph.id === 'string' ? subgraph.id : '';
        if (subgraphId && visitedSubgraphs.has(subgraphId)) {
            continue;
        }
        if (subgraphId) {
            visitedSubgraphs.add(subgraphId);
        }

        collectInstallableModelsFromGraph(subgraph, models, visitedSubgraphs);
    }
};

export const extractInstallableModelsFromEditorGraph = (graph: unknown): ComfyWorkflowInstallableModel[] => {
    if (!isRecord(graph)) {
        return [];
    }

    const models = new Map<string, ComfyWorkflowInstallableModel>();
    collectInstallableModelsFromGraph(graph, models, new Set<string>());

    return Array.from(models.values());
};

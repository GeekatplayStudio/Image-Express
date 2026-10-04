/* eslint-disable @typescript-eslint/no-explicit-any --
   A saved ComfyUI workflow and the server's node definitions are open-ended
   JSON whose shape varies by node; they are read defensively, not typed. */

/**
 * Regular (saved) ComfyUI workflow → the API format `/prompt` accepts.
 *
 * A TypeScript port of the Geekatplay Photoshop bridge's `convert.js`, which
 * follows what the ComfyUI frontend does when it queues a workflow: widget
 * values are read from `widgets_values` laid out the way the frontend builds
 * widgets, links are resolved through reroutes, primitives, bypassed nodes and
 * subgraphs, and muted nodes drop out. `defs` is the server's `/object_info`.
 *
 * It replaces a converter that knew the widget order of about 27 core nodes
 * from a hard-coded table and had no notion of a subgraph: any other node lost
 * its widget values, and a workflow containing subgraphs came out with node
 * classes that were subgraph ids, which the server rejects as unknown nodes.
 * The golden fixtures beside the tests are what frontend 1.53.10 queues.
 */

import {
    apiValue,
    defaultValue,
    isWidgetType,
    migrateValues,
    processDynamicPrompt,
    validConnection,
    widgetLayout,
    type Widget,
} from '@/lib/comfyui/uiWorkflowWidgets';

export { processDynamicPrompt, widgetLayout } from '@/lib/comfyui/uiWorkflowWidgets';

const SUBGRAPH_INPUT = -10;
const MUTED = 2;
const BYPASSED = 4;

/** Core nodes whose frontend adds widgets that cannot be derived from their definition. */
const UNCONVERTIBLE = new Set([
    'Load3D', 'Load3DAdvanced', 'Preview3DAdvanced', 'Save3DAdvanced', 'PreviewGaussianSplat', 'PreviewPointCloud',
    'SaveGaussianSplat', 'SavePointCloud', 'WebcamCapture', 'RecordAudio',
]);

const FRONTEND_ONLY = ['Note', 'MarkdownNote', 'Reroute', 'PrimitiveNode', 'SetNode', 'GetNode'];
const PRIMITIVES = new Set(['PrimitiveInt', 'PrimitiveFloat', 'PrimitiveBoolean', 'PrimitiveString', 'PrimitiveStringMultiline']);

export type ComfyNodeDefs = Record<string, any>;
export type ComfyApiPrompt = Record<string, { inputs: Record<string, unknown>; class_type: string; _meta?: { title?: string } }>;

/** An input the workflow's author put forward, in terms of the converted prompt. */
export interface ExposedWorkflowInput {
    id: string;
    key: string;
    label: string;
    group: string;
}

export interface UiWorkflowConversion {
    prompt: ComfyApiPrompt;
    /** Node types left out because the server does not know them and nothing depends on them. */
    skipped: string[];
    exposed: ExposedWorkflowInput[];
}

/** The workflow cannot be queued as it stands; the message says what to do about it. */
export class ConversionError extends Error {
    constructor(message: string, public readonly missingNodeType?: string) {
        super(message);
        this.name = 'ConversionError';
    }
}

interface Graph {
    data: any;
    links: Map<unknown, any>;
    linksByTarget: Map<string, any>;
    nodes: Map<unknown, any>;
}

interface NodeDto {
    id: string;
    node: any;
    graph: Graph;
    path: unknown[];
    host: NodeDto | null;
    subgraph?: Graph;
}

type Resolved = { id: string; slot: number } | { widgetValue: unknown } | undefined;

function flattenSubgraphs(list: any[]): any[] {
    return list.flatMap((sub) => [sub, ...flattenSubgraphs(sub.definitions?.subgraphs ?? [])]);
}

/** [[innerNodeId, widgetName], ...] of the inner widgets shown on a subgraph node, if saved that way. */
function proxyWidgets(node: any): any[] | undefined {
    const proxies = node.properties?.proxyWidgets;
    return typeof proxies === 'string' ? JSON.parse(proxies) : proxies;
}

/**
 * The frontend keeps node ids unique across the workflow: an inner node whose
 * id is already taken (by a root node or an earlier subgraph) gets the next
 * free id after last_node_id. Execution ids are built from these ids.
 */
function renumberSubgraphNodes(ui: any, subgraphs: any[]): void {
    const used = new Set<string>(ui.nodes.map((node: any) => String(node.id)));
    let last = Number(ui.state?.lastNodeId ?? ui.last_node_id ?? 0);
    const remaps = new Map<unknown, Map<string, number>>();
    for (const sub of subgraphs) {
        const remap = new Map<string, number>();
        for (const node of sub.nodes ?? []) {
            const id = String(node.id);
            if (used.has(id)) {
                do last++; while (used.has(String(last)));
                remap.set(id, last);
                node.id = last;
                used.add(String(last));
            } else {
                used.add(id);
                if (Number.isInteger(Number(id))) last = Math.max(last, Number(id));
            }
        }
        if (!remap.size) continue;
        remaps.set(sub.id, remap);
        for (const link of sub.links ?? []) {
            link.origin_id = remap.get(String(link.origin_id)) ?? link.origin_id;
            link.target_id = remap.get(String(link.target_id)) ?? link.target_id;
        }
    }
    for (const node of [...ui.nodes, ...subgraphs.flatMap((sub) => sub.nodes ?? [])]) {
        const remap = remaps.get(node.type);
        const proxies = proxyWidgets(node);
        if (remap && proxies) {
            node.properties.proxyWidgets = proxies.map(([id, ...rest]: any[]) => [String(remap.get(String(id)) ?? id), ...rest]);
        }
    }
}

class Converter {
    private readonly subgraphs: Map<unknown, Graph>;
    private readonly root: Graph;
    /** node -> { widgetName: value } set by PrimitiveNodes */
    private readonly overrides = new Map<any, Record<string, unknown>>();
    private readonly dtos = new Map<string, NodeDto>();
    readonly skipped = new Set<string>();

    constructor(source: any, private readonly defs: ComfyNodeDefs, private readonly random: () => number) {
        const ui = JSON.parse(JSON.stringify(source));
        const subgraphs = flattenSubgraphs(ui.definitions?.subgraphs ?? []);
        renumberSubgraphNodes(ui, subgraphs);
        this.subgraphs = new Map(subgraphs.map((sub) => [sub.id, this.graph(sub)]));
        this.root = this.graph(ui);
    }

    private graph(data: any): Graph {
        const links = new Map<unknown, any>();
        const linksByTarget = new Map<string, any>(); // "node:slot" -> first link ending there
        for (const raw of data.links ?? []) {
            const link = Array.isArray(raw)
                ? { id: raw[0], origin_id: raw[1], origin_slot: raw[2], target_id: raw[3], target_slot: raw[4], type: raw[5] }
                : raw;
            links.set(link.id, link);
            const target = `${link.target_id}:${link.target_slot}`;
            if (!linksByTarget.has(target)) linksByTarget.set(target, link);
        }
        return { data, links, linksByTarget, nodes: new Map((data.nodes ?? []).map((node: any) => [node.id, node])) };
    }

    /** The link into an input. A reference to a link ending at another node is replaced by the link ending at this slot. */
    private inputLink(dto: NodeDto, slot: number): any {
        const id = dto.node.inputs?.[slot]?.link;
        const link = id == null ? undefined : dto.graph.links.get(id);
        if (link && String(link.target_id) === String(dto.node.id)) return link;
        return dto.graph.linksByTarget.get(`${dto.node.id}:${slot}`);
    }

    private isSubgraph(node: any): boolean {
        return this.subgraphs.has(node.type);
    }

    private addNodes(graph: Graph, path: unknown[], host: NodeDto | null): void {
        for (const node of graph.nodes.values()) {
            const dto: NodeDto = { id: [...path, node.id].join(':'), node, graph, path, host };
            this.dtos.set(dto.id, dto);
            // Like the frontend, only root-level muted or bypassed subgraphs leave their nodes out.
            if (this.isSubgraph(node) && (path.length || (node.mode !== MUTED && node.mode !== BYPASSED))) {
                dto.subgraph = this.subgraphs.get(node.type);
                this.addNodes(dto.subgraph as Graph, [...path, node.id], dto);
            }
        }
    }

    private applyPrimitives(graph: Graph): void {
        for (const node of graph.nodes.values()) {
            if (node.type !== 'PrimitiveNode') continue;
            for (const linkId of node.outputs?.[0]?.links ?? []) {
                const link = graph.links.get(linkId);
                const target = link && graph.nodes.get(link.target_id);
                const name = target?.inputs?.find((input: any) => input.link === linkId)?.widget?.name;
                if (!name) continue;
                if (!this.overrides.has(target)) this.overrides.set(target, {});
                (this.overrides.get(target) as Record<string, unknown>)[name] = node.widgets_values?.[0];
            }
        }
    }

    private def(dto: NodeDto): any {
        const def = this.defs[dto.node.type];
        if (!def) {
            throw new ConversionError(
                `Node "${dto.node.title ?? dto.node.type}" (${dto.node.type}) is not installed on this ComfyUI server.`,
                dto.node.type,
            );
        }
        return def;
    }

    /** [[widget, value], ...] for the widgets sent to the API, as the frontend holds them after loading. */
    private widgetValues(node: any): Array<[Widget, unknown]> {
        const def = this.defs[node.type];
        // widgets_values is positional; some custom node frontends save an object keyed by name.
        const positional = Array.isArray(node.widgets_values) ? migrateValues(def, node.widgets_values) : null;
        const saved = (name: string, index: number) => (positional ? positional[index] : node.widgets_values?.[name]);
        const overrides = this.overrides.get(node) ?? {};
        return widgetLayout(def, saved).flatMap((widget, index): Array<[Widget, unknown]> => {
            if (!widget) return [];
            let value = saved(widget.name, index);
            if (value === undefined) value = defaultValue(widget);
            if (widget.name in overrides) value = overrides[widget.name];
            if (value == null && widget.type === 'COMBO') value = widget.options?.[0];
            return [[widget, value]];
        });
    }

    private widgetInputs(dto: NodeDto): Record<string, unknown> {
        this.def(dto);
        if (UNCONVERTIBLE.has(dto.node.type)) {
            throw new ConversionError(
                `${dto.node.type} cannot be read from a regular workflow file. Use a Workflow > Export (API) file instead.`,
            );
        }
        const inputs: Record<string, unknown> = {};
        for (const [widget, value] of this.widgetValues(dto.node)) {
            inputs[widget.name] = widget.type === 'STRING' && widget.opts.dynamicPrompts === true && typeof value === 'string'
                ? processDynamicPrompt(value, this.random)
                : apiValue(widget, value);
        }
        const saved = dto.node.widgets_values;
        if (dto.node.type === 'CustomCombo' && Array.isArray(saved)) {
            // The frontend adds the selected index and the user's options after the combo; the node reads them.
            inputs.index = saved[1];
            saved.slice(2).forEach((option: unknown, index: number) => { inputs[`option${index + 1}`] = option; });
        }
        return inputs;
    }

    private resolveInput(dto: NodeDto, slot: number, visited: Set<string>, type?: unknown): Resolved {
        const key = `${dto.id}[I]${slot}`;
        if (visited.has(key)) throw new ConversionError(`Circular link at node ${dto.id}.`);
        visited.add(key);
        const input = dto.node.inputs?.[slot];
        const link = input && this.inputLink(dto, slot);
        if (!link) return undefined;

        if (dto.host && link.origin_id === SUBGRAPH_INPUT) {
            const host = dto.host;
            const subInput = (host.subgraph as Graph).data.inputs?.[link.origin_slot];
            const hostSlot = host.node.inputs?.findIndex((candidate: any) => candidate.name === subInput?.name) ?? -1;
            if (hostSlot !== -1 && this.inputLink(host, hostSlot)) return this.resolveInput(host, hostSlot, visited);
            return this.promotedValue(host, link.origin_slot);
        }

        const origin = dto.graph.nodes.get(link.origin_id);
        if (!origin) return undefined;
        const originDto = this.dtos.get([...dto.path, origin.id].join(':'));
        if (!originDto) return undefined;
        return this.resolveOutput(originDto, link.origin_slot, type ?? input.type, visited);
    }

    /** Value of a subgraph input that is shown as a widget on the subgraph node and not linked outside. */
    private promotedValue(host: NodeDto, inputIndex: number): Resolved {
        const sub = host.subgraph as Graph;
        const proxies = proxyWidgets(host.node);
        if (proxies) {
            // The promoted widget is an inner widget fed by this input; its value is sent as is.
            for (const link of sub.links.values()) {
                if (link.origin_id !== SUBGRAPH_INPUT || link.origin_slot !== inputIndex) continue;
                const target = sub.nodes.get(link.target_id);
                const name = target?.inputs?.find((candidate: any) => candidate.link === link.id)?.widget?.name;
                if (!name || !this.defs[target.type]
                    || !proxies.some(([id, widget]: any[]) => String(id) === String(target.id) && widget === name)) continue;
                const entry = this.widgetValues(target).find(([widget]) => widget.name === name);
                if (entry) return { widgetValue: entry[1] };
            }
            return undefined;
        }
        // Older saves keep promoted widget values on the subgraph node, one per widget-typed input.
        const values = host.node.widgets_values;
        if (!Array.isArray(values) || !values.length) return undefined;
        const promoted = (sub.data.inputs ?? []).filter((candidate: any) => isWidgetType(candidate.type));
        const index = promoted.indexOf(sub.data.inputs[inputIndex]);
        return index === -1 || index >= values.length ? undefined : { widgetValue: values[index] };
    }

    private resolveOutput(dto: NodeDto, slot: number, type: unknown, visited: Set<string>): Resolved {
        const key = `${dto.id}[O]${slot}`;
        if (visited.has(key)) throw new ConversionError(`Circular link at node ${dto.id}.`);
        visited.add(key);
        const { node } = dto;
        if (node.mode === MUTED) return undefined;
        if (node.mode === BYPASSED) {
            const index = this.bypassSlot(node, slot, type);
            return index === -1 ? undefined : this.resolveInput(dto, index, visited);
        }
        if (this.isSubgraph(node)) {
            const sub = dto.subgraph as Graph;
            const link = sub.links.get(sub.data.outputs?.[slot]?.linkIds?.[0]);
            if (!link) return undefined;
            const inner = this.dtos.get([...dto.path, node.id, link.origin_id].join(':'));
            if (!inner) {
                throw new ConversionError(`Subgraph "${sub.data.name}" passes an input straight to an output, which ComfyUI cannot queue.`);
            }
            return this.resolveOutput(inner, link.origin_slot, type, visited);
        }
        if (this.defs[node.type]) return { id: dto.id, slot };

        // Frontend-only nodes.
        if (node.type === 'GetNode') {
            const name = node.widgets_values?.[0];
            const setter = [...dto.graph.nodes.values()].find((candidate) => candidate.type === 'SetNode' && candidate.widgets_values?.[0] === name);
            if (!setter) throw new ConversionError(`Get node "${name}" has no matching Set node.`);
            return this.resolveInput(this.dtos.get([...dto.path, setter.id].join(':')) as NodeDto, 0, visited, type);
        }
        if (node.type === 'PrimitiveNode' || !node.inputs?.length) {
            if (node.type !== 'PrimitiveNode') this.def(dto); // not a reroute-like node: report it as missing
            return undefined;
        }
        if (node.inputs.length === 1) return this.resolveInput(dto, 0, visited, type); // Reroute and reroute-like nodes
        this.def(dto);
        return undefined;
    }

    /** The frontend's ExecutableNodeDTO._getBypassSlotIndex. */
    private bypassSlot(node: any, slot: number, type: unknown): number {
        const inputs: any[] = node.inputs ?? [];
        const outputType = node.outputs?.[slot]?.type;
        if (type === '*' || type === '') return inputs.length > slot ? slot : 0;
        const same = inputs[slot];
        if (same && validConnection(same.type, outputType) && validConnection(same.type, type)) return slot;
        const exact = inputs.findIndex((input) => input.type === type);
        return exact !== -1
            ? exact
            : inputs.findIndex((input) => validConnection(input.type, outputType) && validConnection(input.type, type));
    }

    convert(): ComfyApiPrompt {
        for (const graph of [this.root, ...this.subgraphs.values()]) this.applyPrimitives(graph);
        this.addNodes(this.root, [], null);

        const output: ComfyApiPrompt = {};
        for (const dto of this.dtos.values()) {
            const { node } = dto;
            if (node.mode === MUTED || node.mode === BYPASSED || this.isSubgraph(node)) continue;
            if (!this.defs[node.type]) {
                // Notes, reroutes, primitives and other frontend-only or missing nodes are not part of
                // the prompt; a missing node that something depends on fails in resolveOutput.
                if (!FRONTEND_ONLY.includes(node.type)) this.skipped.add(node.type);
                continue;
            }
            const inputs = this.widgetInputs(dto);
            (node.inputs ?? []).forEach((input: any, slot: number) => {
                const resolved = this.resolveInput(dto, slot, new Set());
                if (!resolved) return;
                inputs[input.name] = 'widgetValue' in resolved
                    ? (Array.isArray(resolved.widgetValue) ? { __value__: resolved.widgetValue } : resolved.widgetValue)
                    : [String(resolved.id), resolved.slot];
            });
            output[dto.id] = {
                inputs,
                class_type: node.type,
                _meta: { title: node.title ?? this.defs[node.type].display_name ?? node.type },
            };
        }
        for (const { inputs } of Object.values(output)) {
            for (const [name, value] of Object.entries(inputs)) {
                if (Array.isArray(value) && value.length === 2 && !output[value[0] as string]) delete inputs[name];
            }
        }
        return output;
    }

    /**
     * The inputs the workflow author put forward, in their order: widgets
     * promoted onto subgraph nodes (proxyWidgets) and titled primitive nodes at
     * the root.
     */
    exposed(): ExposedWorkflowInput[] {
        const list: ExposedWorkflowInput[] = [];
        for (const dto of this.dtos.values()) {
            const { node } = dto;
            if (!dto.path.length && PRIMITIVES.has(node.type) && node.title && node.outputs?.[0]?.links?.length) {
                list.push({ id: dto.id, key: 'value', label: node.title, group: '' });
            }
            const proxies = dto.subgraph && proxyWidgets(node);
            for (const [innerId, key] of proxies || []) {
                const inner = this.dtos.get([dto.id, ...String(innerId).split(':')].join(':'));
                if (inner) {
                    list.push({
                        id: inner.id,
                        key,
                        label: this.proxyLabel(inner, key),
                        group: node.title ?? (dto.subgraph as Graph).data.name,
                    });
                }
            }
        }
        return list;
    }

    /** A promoted widget is named after the subgraph input that feeds it, else after its node. */
    private proxyLabel(inner: NodeDto, key: string): string {
        const slot = inner.node.inputs?.findIndex((input: any) => input.widget?.name === key || input.name === key) ?? -1;
        const link = slot === -1 ? null : this.inputLink(inner, slot);
        const input = link?.origin_id === SUBGRAPH_INPUT
            ? (inner.host?.subgraph as Graph | undefined)?.data.inputs?.[link.origin_slot]
            : null;
        if (input) return input.label ?? input.name;
        const title = inner.node.title ?? this.defs[inner.node.type]?.display_name ?? inner.node.type;
        return `${title}: ${key}`;
    }
}

/** A regular (saved) workflow has a `nodes` array; an API workflow is keyed by node id. */
export function isUiWorkflow(data: unknown): boolean {
    return Array.isArray((data as { nodes?: unknown } | null)?.nodes);
}

/** Node class names the conversion needs definitions for. */
export function uiNodeTypes(ui: any): string[] {
    const subgraphs = flattenSubgraphs(ui.definitions?.subgraphs ?? []);
    const subgraphIds = new Set(subgraphs.map((sub) => sub.id));
    const types = new Set<string>();
    for (const graph of [ui, ...subgraphs]) {
        for (const node of graph.nodes ?? []) if (!subgraphIds.has(node.type)) types.add(node.type);
    }
    return [...types];
}

/** Convert a regular workflow using the server's node definitions. Throws `ConversionError`. */
export function convertUiWorkflow(ui: any, defs: ComfyNodeDefs, random: () => number = Math.random): UiWorkflowConversion {
    if (ui.extra?.groupNodes && Object.keys(ui.extra.groupNodes).length) {
        throw new ConversionError(
            'This workflow uses legacy group nodes. Convert them to subgraphs in ComfyUI, or use a Workflow > Export (API) file.',
        );
    }
    const converter = new Converter(ui, defs, random);
    const prompt = converter.convert();
    return { prompt, skipped: [...converter.skipped], exposed: converter.exposed() };
}

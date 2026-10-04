/* eslint-disable @typescript-eslint/no-explicit-any --
   Node definitions from /object_info are open-ended JSON read defensively. */

/**
 * How the ComfyUI frontend lays a node's widgets out, and what it sends for
 * each. Split from `uiWorkflowConverter.ts`, which walks the graph; this part
 * only needs a node definition.
 */

/** Input types the frontend turns into widgets (ComfyWidgets plus core extension widgets). */
const WIDGET_TYPES = new Set([
    'INT', 'FLOAT', 'BOOLEAN', 'STRING', 'COMBO', 'MARKDOWN', 'IMAGEUPLOAD', 'COLOR', 'IMAGECOMPARE',
    'BOUNDING_BOX', 'CHART', 'GALLERIA', 'PAINTER', 'COMPOSITOR', 'TEXTAREA', 'CURVE', 'RANGE', 'VIDEO_EDIT',
    'RESOLUTION_PREVIEW', 'BOUNDING_BOXES', 'COLORS', 'COMFY_DYNAMICCOMBO_V3',
]);

export interface Widget {
    name: string;
    type: string;
    opts: any;
    options?: any[];
}

export const isWidgetType = (type: unknown): boolean => Array.isArray(type) || WIDGET_TYPES.has(type as string);

export function validConnection(left: unknown, right: unknown): boolean {
    let a: unknown = left === '' || left === '*' ? 0 : left;
    let b: unknown = right === '' || right === '*' ? 0 : right;
    if (!a || !b || a === b) return true;
    a = String(a).toLowerCase();
    b = String(b).toLowerCase();
    const first = a as string;
    const second = b as string;
    if (!first.includes(',') && !second.includes(',')) return first === second;
    return first.split(',').some((x) => second.split(',').some((y) => validConnection(x, y)));
}

/** The frontend's processDynamicPrompt: strips comments and picks one option of each {a|b}. */
export function processDynamicPrompt(source: string, random: () => number): string {
    const text = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    let i = 0;
    const escape = () => `\\${text[i++]}`;
    const choice = (): string => {
        const options: string[] = [];
        let current = '';
        let depth = 0;
        while (i < text.length) {
            const c = text[i++];
            if (c === '\\') {
                current += escape();
                continue;
            }
            if (c === '{') depth++;
            else if (c === '}') {
                if (!depth) break;
                depth--;
            } else if (c === '|' && !depth) {
                options.push(current);
                current = '';
                continue;
            }
            current += c;
        }
        options.push(current);
        return processDynamicPrompt(options[Math.floor(random() * options.length)], random);
    };
    let out = '';
    while (i < text.length) {
        const c = text[i++];
        out += c === '\\' ? escape() : c === '{' ? choice() : c;
    }
    return out.replace(/\\([{}|])/g, '$1');
}

/**
 * The node's widgets in frontend order. Entries with a widget are sent to the
 * API; null entries only take a `widgets_values` slot (control_after_generate,
 * upload buttons). A dynamic combo is followed by the widgets of its selected
 * option, so the layout depends on the saved values: `saved(name, index)`
 * returns one, or undefined.
 */
export function widgetLayout(def: any, saved: (name: string, index: number) => unknown): Array<Widget | null> {
    const layout: Array<Widget | null> = [];
    let upload = false;
    const walk = (inputs: any, order: any, prefix: string) => {
        for (const group of ['required', 'optional']) {
            const specs = inputs?.[group] ?? {};
            for (const key of order?.[group] ?? Object.keys(specs)) {
                if (!specs[key]) continue;
                const [socketType, opts = {}] = specs[key];
                const type = opts.widgetType ?? socketType;
                const name = prefix + key;
                if (opts.forceInput || !isWidgetType(type)) continue;
                if (type === 'COMFY_DYNAMICCOMBO_V3') {
                    const keys = (opts.options ?? []).map((option: any) => option.key);
                    layout.push({ name, type: 'COMBO', opts: {}, options: keys });
                    const value = saved(name, layout.length - 1) ?? keys[0];
                    const chosen = (opts.options ?? []).find((option: any) => option.key === value);
                    if (chosen) walk(chosen.inputs, null, `${name}.`);
                    continue;
                }
                if (type === 'RESOLUTION_PREVIEW') {
                    layout.push(null);
                    continue;
                }
                const combo = Array.isArray(type) || type === 'COMBO';
                layout.push({ name, type: combo ? 'COMBO' : type, opts, options: Array.isArray(type) ? type : opts.options });
                if (opts.remote?.refresh_button) layout.push(null, null); // auto-refresh toggle, refresh button
                const control = type === 'INT'
                    ? opts.control_after_generate ?? ['seed', 'noise_seed'].includes(name)
                    : opts.control_after_generate;
                if (control) {
                    layout.push(null);
                    if (combo && !opts.multi_select) layout.push(null);
                }
                if (opts.component === 'ImageCrop') layout.push(null, null, null, null); // x, y, width, height
                if (combo && (opts.image_upload || opts.animated_image_upload || opts.video_upload || opts.audio_upload)) upload = true;
            }
        }
    };
    walk(def.input, def.input_order, '');
    if (upload) layout.push(null); // the upload button comes after all other widgets
    return layout;
}

/** The frontend's migrateWidgetsValues: very old saves kept a slot for forceInput inputs. */
export function migrateValues(def: any, values: unknown[]): unknown[] {
    const flags: boolean[] = [];
    for (const group of ['required', 'optional']) {
        const specs = def.input?.[group] ?? {};
        for (const key of def.input_order?.[group] ?? Object.keys(specs)) {
            if (!specs[key]) continue;
            const [type, opts = {}] = specs[key];
            if (!opts.forceInput && !isWidgetType(type)) continue;
            flags.push(Boolean(opts.forceInput));
            if (opts.control_after_generate) flags.push(false);
        }
    }
    return flags.length === values.length && flags.some(Boolean) ? values.filter((_, index) => !flags[index]) : values;
}

export function defaultValue(widget: Widget): unknown {
    if (widget.opts.default !== undefined) return widget.opts.default;
    if (widget.type === 'COMBO') return widget.options?.[0];
    return ({ INT: 0, FLOAT: 0, BOOLEAN: false, STRING: '' } as Record<string, unknown>)[widget.type];
}

export function apiValue(widget: Widget, value: unknown): unknown {
    if (widget.type === 'IMAGECOMPARE') return { __value__: ['', ''] }; // preview-only; the frontend always sends this
    if (widget.type === 'CURVE' && value != null) return { __type__: 'CURVE', __value__: value };
    return Array.isArray(value) ? { __value__: value } : value;
}

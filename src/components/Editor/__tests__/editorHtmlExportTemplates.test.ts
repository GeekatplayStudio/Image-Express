/**
 * @jest-environment jsdom
 */

import {
    buildHtmlExportDocument,
    buildHtmlExportMainScript,
    encodeDesignPayload,
} from '@/components/Editor/editorHtmlExportTemplates';
import type { DesignJson } from '@/components/Editor/editorView.types';

/**
 * The viewer script is a string that ships inside an exported page and runs in
 * a browser with no build step. Nothing type-checks or lints it, which is how
 * it came to contain TypeScript casts (a syntax error in a browser) and calls
 * to methods fabric removed two major versions ago. These tests execute it.
 */

type FakeObject = Record<string, unknown>;

/** Only the fabric 7 surface. A call to a removed method throws, as it would. */
const installFakeFabric = () => {
    const calls: string[] = [];
    let objects: FakeObject[] = [];
    const canvas = {
        backgroundColor: '',
        width: 300,
        height: 150,
        getWidth: () => canvas.width,
        getHeight: () => canvas.height,
        setDimensions: ({ width, height }: { width: number; height: number }) => {
            canvas.width = width;
            canvas.height = height;
        },
        setViewportTransform: jest.fn(),
        requestRenderAll: jest.fn(),
        getObjects: () => objects,
        add: (object: FakeObject) => { calls.push('add'); objects.push(object); },
        sendObjectToBack: (object: FakeObject) => {
            calls.push('sendObjectToBack');
            objects = [object, ...objects.filter((entry) => entry !== object)];
        },
        loadFromJSON: jest.fn(async (json: { objects?: FakeObject[] }, reviver?: unknown) => {
            calls.push(reviver === undefined ? 'load' : 'load-with-reviver');
            objects = [...(json.objects ?? [])];
            return canvas;
        }),
    };
    class Rect {
        constructor(options: FakeObject) { Object.assign(this, options, { type: 'rect', isArtboard: true }); }
        set(key: string, value: unknown) { (this as unknown as FakeObject)[key] = value; }
    }
    class Shadow {
        constructor(options: FakeObject) { Object.assign(this, options); }
    }
    (globalThis as unknown as { fabric: unknown }).fabric = {
        Canvas: function Canvas() { return canvas; },
        Rect,
        Shadow,
    };
    return { canvas, calls, getObjects: () => objects };
};

const mountPage = () => {
    document.body.innerHTML = `
        <div class="canvas-wrapper">
            <canvas id="artboard"></canvas>
            <div id="media-overlay"></div>
        </div>`;
};

const runViewer = async (design: Record<string, unknown>) => {
    const script = buildHtmlExportMainScript(encodeDesignPayload(design as unknown as DesignJson));
    // Throws a SyntaxError here if the script is not plain JavaScript.
    new Function(script)();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Let the load promise and its then() settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
};

const DESIGN = {
    objects: [
        { type: 'rect', width: 100, height: 50 },
        { type: 'group', mediaType: 'video', mediaSource: 'media/clip.mp4', width: 320, height: 180, left: 40, top: 60 },
    ],
    metadata: {
        canvasWidth: 1920,
        canvasHeight: 1080,
        backgroundColor: '#101010',
        workspaceBackground: '#000000',
        artboard: { width: 1920, height: 1080, left: 0, top: 0, fill: '#ffffff', shadow: { color: 'rgba(0,0,0,0.3)', blur: 20 } },
    },
    artboard: { width: 1920, height: 1080 },
};

describe('exported page viewer script', () => {
    let errorSpy: jest.SpyInstance;
    // Each run registers a DOMContentLoaded handler on the shared document;
    // without removing them, later tests would re-run every earlier viewer.
    let registered: EventListenerOrEventListenerObject[] = [];
    const realAdd = document.addEventListener.bind(document);

    beforeEach(() => {
        registered = [];
        jest.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
            if (type === 'DOMContentLoaded' && listener) registered.push(listener);
            realAdd(type, listener as EventListener, options as AddEventListenerOptions);
        });
        mountPage();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        registered.forEach((listener) => document.removeEventListener('DOMContentLoaded', listener));
        jest.restoreAllMocks();
        delete (globalThis as unknown as { fabric?: unknown }).fabric;
    });

    it('is plain JavaScript a browser can parse', () => {
        const script = buildHtmlExportMainScript('');
        expect(() => new Function(script)).not.toThrow();
    });

    it('loads the page and sizes the canvas to it', async () => {
        const { canvas } = installFakeFabric();
        await runViewer(DESIGN);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(canvas.loadFromJSON).toHaveBeenCalledTimes(1);
        expect(canvas.getWidth()).toBe(1920);
        expect(canvas.getHeight()).toBe(1080);
        expect(canvas.backgroundColor).toBe('#101010');
    });

    it('does its post-load work after the load resolves, not in a reviver', async () => {
        const { calls } = installFakeFabric();
        await runViewer(DESIGN);
        expect(calls).toEqual(['load', 'add', 'sendObjectToBack']);
    });

    it('adds the page rect exactly once and behind every layer', async () => {
        const { getObjects } = installFakeFabric();
        await runViewer(DESIGN);
        const objects = getObjects();
        expect(objects.filter((object) => object.isArtboard)).toHaveLength(1);
        expect(objects[0].isArtboard).toBe(true);
        expect(objects).toHaveLength(3);
    });

    it('keeps its own metadata out of what fabric copies onto the canvas', async () => {
        const { canvas } = installFakeFabric();
        await runViewer(DESIGN);
        const loaded = canvas.loadFromJSON.mock.calls[0][0] as Record<string, unknown>;
        expect(loaded).not.toHaveProperty('metadata');
        expect(loaded).not.toHaveProperty('artboard');
        expect(loaded.objects).toHaveLength(2);
    });

    it('replaces a video layer with a real player positioned over it', async () => {
        installFakeFabric();
        await runViewer(DESIGN);
        const video = document.querySelector<HTMLVideoElement>('#media-overlay .media-element video');
        expect(video).not.toBeNull();
        expect(video?.getAttribute('src')).toBe('media/clip.mp4');
        expect(video?.controls).toBe(true);
        const container = video?.parentElement as HTMLElement;
        expect(container.dataset.mediaType).toBe('video');
        expect(container.style.width).toBe('320px');
    });

    it('renders nothing rather than throwing when the payload is missing', async () => {
        const { canvas } = installFakeFabric();
        new Function(buildHtmlExportMainScript(''))();
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(canvas.loadFromJSON).not.toHaveBeenCalled();
    });
});

describe('buildHtmlExportDocument', () => {
    it('loads fabric before the viewer script that depends on it', () => {
        const html = buildHtmlExportDocument('<script src="libs/fabric.min.js"></script>', '');
        expect(html.indexOf('libs/fabric.min.js')).toBeGreaterThan(-1);
        expect(html.indexOf('libs/fabric.min.js')).toBeLessThan(html.indexOf('scripts/main.js'));
        expect(html).toContain('<canvas id="artboard">');
        expect(html).toContain('id="media-overlay"');
    });
});

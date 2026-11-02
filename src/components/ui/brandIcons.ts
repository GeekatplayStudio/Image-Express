import { createLucideIcon } from 'lucide-react';

// lucide-react 1.0 removed its brand icons. These are the 0.562 published
// shapes (ISC licence), built with its factory so they take the same props.

export const Chrome = createLucideIcon('chrome', [
    ['path', { d: 'M10.88 21.94 15.46 14', key: 'a' }],
    ['path', { d: 'M21.17 8H12', key: 'b' }],
    ['path', { d: 'M3.95 6.06 8.54 14', key: 'c' }],
    ['circle', { cx: '12', cy: '12', r: '10', key: 'outer' }],
    ['circle', { cx: '12', cy: '12', r: '4', key: 'inner' }],
]);

export const Facebook = createLucideIcon('facebook', [
    ['path', { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z', key: 'f' }],
]);

export const Instagram = createLucideIcon('instagram', [
    ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5', key: 'frame' }],
    ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', key: 'lens' }],
    ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5', key: 'dot' }],
]);

export const Youtube = createLucideIcon('youtube', [
    ['path', { d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17', key: 'body' }],
    ['path', { d: 'm10 15 5-3-5-3z', key: 'play' }],
]);

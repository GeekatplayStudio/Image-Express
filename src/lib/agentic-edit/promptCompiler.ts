import type { AnnotationDocument, AnnotationRecord, CompiledPrompts } from '@/lib/agentic-edit/types';

const regionDescriptor = (annotation: AnnotationRecord): string => {
    if (annotation.type === 'point') {
        const point = annotation.geometry as { x: number; y: number };
        return `point @ (${point.x.toFixed(3)}, ${point.y.toFixed(3)})`;
    }

    if (annotation.type === 'box') {
        const box = annotation.geometry as { x: number; y: number; w: number; h: number };
        return `box @ (${box.x.toFixed(3)}, ${box.y.toFixed(3)}) size (${box.w.toFixed(3)} x ${box.h.toFixed(3)})`;
    }

    if (annotation.type === 'polygon') {
        const polygon = annotation.geometry as { points: Array<{ x: number; y: number }> };
        return `polygon with ${polygon.points.length} points`;
    }

    if (annotation.type === 'brush') {
        return 'brush mask region';
    }

    if (annotation.type === 'pose') {
        return 'pose hint region';
    }

    return 'text replace region';
};

const instructionQualityRules = (instruction: string): string[] => {
    const normalized = instruction.toLowerCase();
    const rules: string[] = [];

    if (normalized.includes('jacket') && normalized.includes('color')) {
        rules.push('Do not recolor skin or background; only the jacket fabric.');
    }

    if (normalized.includes('replace') && normalized.includes('text')) {
        rules.push('Text must be legible and correctly spelled.');
    }

    return rules;
};

export const compileAnnotationPrompts = (document: AnnotationDocument): CompiledPrompts => {
    const sorted = [...document.annotations]
        .filter((annotation) => annotation.enabled)
        .sort((a, b) => a.priority - b.priority);

    const positiveLines: string[] = [
        'Base: preserve overall composition, lighting, identity, and realism unless stated otherwise.',
    ];

    const qualityRuleSet = new Set<string>();

    for (const annotation of sorted) {
        const modeClause = annotation.mode ? ` (mode: ${annotation.mode})` : '';
        const strengthClause = typeof annotation.strength === 'number' ? ` (strength: ${annotation.strength.toFixed(2)})` : '';
        const region = regionDescriptor(annotation);
        positiveLines.push(`Region ${annotation.id} (${region}): ${annotation.instruction}${modeClause}${strengthClause}`);

        if (annotation.type === 'text') {
            positiveLines.push('Replace text in the marked region with the requested content using natural font/kerning consistent with scene.');
        }

        if (annotation.type === 'pose' || annotation.mode === 'pose') {
            positiveLines.push('Follow the pose hint image for body posture while keeping the same person identity.');
        }

        for (const rule of instructionQualityRules(annotation.instruction)) {
            qualityRuleSet.add(rule);
        }
    }

    if (document.globalPrompt.positive.trim()) {
        positiveLines.unshift(document.globalPrompt.positive.trim());
    }

    for (const rule of qualityRuleSet) {
        positiveLines.push(rule);
    }

    const defaultNegative = 'Do not change face identity (unless requested). No extra fingers, no deformed hands, no artifacts, no unreadable text, no watermark, no logo.';
    const negative = [
        document.globalPrompt.negative.trim(),
        defaultNegative,
    ].filter(Boolean).join(' ');

    return {
        positive: positiveLines.join('\n'),
        negative,
    };
};

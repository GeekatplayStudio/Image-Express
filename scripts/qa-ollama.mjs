const appUrl = process.env.APP_URL || 'http://localhost:3001';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
// Critique needs a model that can read images; generation does not.
const critiqueModel = process.env.OLLAMA_VISION_MODEL || ollamaModel;

const critiqueImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p5xQAAAAASUVORK5CYII=';

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const requestJson = async (input, init) => {
    const response = await fetch(input, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message || `${response.status} ${response.statusText}`);
    }
    return payload;
};

/** How many drawing elements an SVG data URL contains. */
const shapeCount = (dataUrl) => {
    const svg = Buffer.from(dataUrl.split(',')[1] || '', 'base64').toString('utf8');
    return (svg.match(/<(path|rect|circle|ellipse|polygon|line|polyline)\b/g) || []).length;
};

const generate = async (quality) => {
    const startedAt = Date.now();
    const payload = await requestJson(`${appUrl}/api/ai/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: 'remote',
            specificProvider: 'ollama',
            prompt: 'A lighthouse on a cliff at dusk',
            width: 512,
            height: 512,
            localAiBaseUrl: ollamaBaseUrl,
            localAiModel: ollamaModel,
            localAiQuality: quality,
        }),
    });
    assert(payload.success === true, `Ollama generation (${quality}) did not report success.`);
    assert(
        typeof payload.imageUrl === 'string' && payload.imageUrl.startsWith('data:image/svg+xml;base64,'),
        `Ollama generation (${quality}) did not return an SVG data URL.`,
    );
    const shapes = shapeCount(payload.imageUrl);
    console.log(`- generation ${quality}: ${shapes} shapes in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    return shapes;
};

const run = async () => {
    console.log(`QA Ollama against ${appUrl} using ${ollamaBaseUrl} (${ollamaModel})`);

    const statusPayload = await requestJson(
        `${appUrl}/api/ai/ollama/status?baseUrl=${encodeURIComponent(ollamaBaseUrl)}&model=${encodeURIComponent(ollamaModel)}`,
    );
    assert(statusPayload.success === true, 'Ollama status route did not report success.');
    assert(statusPayload.modelFound === true, `Configured model ${ollamaModel} is not installed.`);
    console.log(`- status ok via ${statusPayload.baseUrl}`);

    // One generation per profile: the choice has to change what comes back.
    const fastShapes = await generate('fast');
    const qualityShapes = await generate('quality');
    assert(fastShapes > 0, 'The fast profile produced an SVG with no shapes.');
    assert(
        qualityShapes > fastShapes,
        `The quality profile (${qualityShapes} shapes) was not richer than fast (${fastShapes}).`,
    );

    const critiquePayload = await requestJson(`${appUrl}/api/ai/ollama/critique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            baseUrl: ollamaBaseUrl,
            model: critiqueModel,
            target: 'canvas',
            targetLabel: 'Full canvas',
            profile: 'composition',
            imageDataUrl: critiqueImageDataUrl,
        }),
    });
    assert(
        typeof critiquePayload.critique === 'string' && critiquePayload.critique.trim().length > 0,
        'Ollama critique route returned an empty critique.',
    );
    const report = critiquePayload.report;
    assert(report && report.profile === 'composition', 'Critique did not return a report for the requested profile.');
    assert(Array.isArray(report.criteria) && report.criteria.length === 5, 'Critique report does not carry the profile criteria.');
    assert(Array.isArray(report.actions) && report.actions.length > 0, 'Critique report has no recommended action.');
    console.log(`- critique ok (${report.structured ? 'structured' : 'plain text'}, score ${report.score ?? 'n/a'})`);
    console.log('Ollama QA passed.');
};

run().catch((error) => {
    console.error(`Ollama QA failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});

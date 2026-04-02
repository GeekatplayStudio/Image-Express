const appUrl = process.env.APP_URL || 'http://localhost:3001';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

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

const run = async () => {
    console.log(`QA Ollama against ${appUrl} using ${ollamaBaseUrl} (${ollamaModel})`);

    const statusPayload = await requestJson(
        `${appUrl}/api/ai/ollama/status?baseUrl=${encodeURIComponent(ollamaBaseUrl)}&model=${encodeURIComponent(ollamaModel)}`,
    );
    assert(statusPayload.success === true, 'Ollama status route did not report success.');
    assert(statusPayload.modelFound === true, `Configured model ${ollamaModel} is not installed.`);
    console.log(`- status ok via ${statusPayload.baseUrl}`);

    const generationPayload = await requestJson(`${appUrl}/api/ai/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: 'remote',
            specificProvider: 'ollama',
            prompt: 'A simple flat icon of a blue mountain and sun',
            width: 512,
            height: 512,
            localAiBaseUrl: ollamaBaseUrl,
            localAiModel: ollamaModel,
        }),
    });
    assert(generationPayload.success === true, 'Ollama generation route did not report success.');
    assert(typeof generationPayload.imageUrl === 'string' && generationPayload.imageUrl.startsWith('data:image/svg+xml;base64,'), 'Ollama generation did not return an SVG data URL.');
    console.log(`- generation ok (${generationPayload.imageUrl.length} chars)`);

    const critiquePayload = await requestJson(`${appUrl}/api/ai/ollama/critique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            baseUrl: ollamaBaseUrl,
            model: ollamaModel,
            target: 'canvas',
            targetLabel: 'Full canvas',
            focus: 'Focus on composition only.',
            imageDataUrl: critiqueImageDataUrl,
        }),
    });
    assert(typeof critiquePayload.critique === 'string' && critiquePayload.critique.trim().length > 0, 'Ollama critique route returned an empty critique.');
    console.log('- critique ok');
    console.log('Ollama QA passed.');
};

run().catch((error) => {
    console.error(`Ollama QA failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
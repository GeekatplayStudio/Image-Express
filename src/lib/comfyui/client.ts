import {
    DEFAULT_COMFY_LOCAL_URL,
    buildComfyTransportRequestUrl,
    createLocalComfyTransport,
    shouldUseComfyBrowserProxy,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connection';

export interface ComfyExecutionProgress {
    nodeId: string | null;
    progress: number;
    max: number;
    value: number;
    stage?: 'connecting' | 'validating' | 'queueing' | 'queued' | 'running' | 'waiting-history' | 'fetching-image' | 'completed' | 'error';
    message?: string;
    elapsedMs?: number;
}

export interface ComfyExecutionResult {
    dataUrl?: string;
    filename?: string;
    error?: string;
}

interface ComfyHistoryImage {
    filename: string;
    subfolder?: string;
    type?: string;
}

interface PromptHandler {
    resolve: (result: ComfyExecutionResult) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: ComfyExecutionProgress) => void;
    outputNodeIds: string[];
    settled: boolean;
    startedAt: number;
}

interface ComfyObjectInfoNode {
    input?: {
        required?: Record<string, unknown>;
        optional?: Record<string, unknown>;
    };
}

type ComfyObjectInfoResponse = Record<string, ComfyObjectInfoNode>;

type GenericJsonRecord = Record<string, unknown>;

interface MissingComfyModelInput {
    nodeId: string;
    classType: string;
    inputName: string;
    configuredValue: string;
    availableValues: string[];
}

interface ComfyHistoryErrorPayload {
    exception_type?: string;
    exception_message?: string;
    node_id?: string;
    node_type?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MODEL_INPUT_NAME_PATTERN = /(?:^|_)(?:ckpt|checkpoint|model|unet|clip|vae|lora|controlnet|text_encoder|diffusion_model)(?:_|$)|name$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const extractStringChoices = (inputDefinition: unknown): string[] => {
    if (!Array.isArray(inputDefinition)) {
        return [];
    }

    const directChoices = inputDefinition.find((entry) => (
        Array.isArray(entry) && entry.every((item) => typeof item === 'string')
    )) as string[] | undefined;
    if (directChoices && directChoices.length > 0) {
        return directChoices;
    }

    const objectEntry = inputDefinition.find((entry) => isRecord(entry));
    if (!objectEntry || !isRecord(objectEntry)) {
        return [];
    }

    const candidate = objectEntry.choices
        || objectEntry.options
        || objectEntry.values
        || objectEntry.items;

    if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) {
        return candidate;
    }

    return [];
};

const parseHistoryStatusSummary = (promptEntry: unknown): string | null => {
    if (!isRecord(promptEntry)) {
        return null;
    }

    const status = isRecord(promptEntry.status) ? promptEntry.status : null;
    if (!status) {
        return null;
    }

    const statusStr = typeof status.status_str === 'string' ? status.status_str : '';
    const completed = typeof status.completed === 'boolean' ? status.completed : null;
    const queueRemaining = typeof status.queue_remaining === 'number' ? status.queue_remaining : null;
    const parts = [
        statusStr ? `status=${statusStr}` : '',
        completed === null ? '' : `completed=${completed ? 'yes' : 'no'}`,
        queueRemaining === null ? '' : `queue=${queueRemaining}`,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : null;
};

export class ComfyUIClient {
    private transport: ResolvedComfyTransport;
    private wsUrl!: string;
    private clientId: string;
    private ws: WebSocket | null = null;
    private promptIdHandlers: Map<string, PromptHandler> = new Map();

    constructor(connection: string | ResolvedComfyTransport = DEFAULT_COMFY_LOCAL_URL) {
        this.transport = typeof connection === 'string'
            ? createLocalComfyTransport(connection)
            : connection;
        this.setTransport(this.transport);
        this.clientId = Math.random().toString(36).slice(2);
    }

    public setServerUrl(url: string) {
        this.setTransport(createLocalComfyTransport(url));
    }

    public setTransport(transport: ResolvedComfyTransport) {
        this.transport = transport;
        this.wsUrl = this.buildWebSocketUrl(transport);
    }

    public connect() {
        if (shouldUseComfyBrowserProxy(this.transport)) {
            return;
        }

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            this.ws = new WebSocket(this.buildWebSocketConnectionUrl());

            this.ws.onmessage = (event) => {
                if (typeof event.data !== 'string') {
                    return;
                }

                try {
                    const message = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown> };
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Failed to parse ComfyUI WS message', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('ComfyUI WebSocket error:', error);
            };

            this.ws.onclose = () => {
                this.ws = null;
            };
        } catch (error) {
            console.error('Failed to connect to ComfyUI websocket', error);
        }
    }

    public disconnect() {
        if (!this.ws) {
            return;
        }

        this.ws.close();
        this.ws = null;
    }

    public async uploadImage(base64Image: string, filename: string = 'upload.png'): Promise<string> {
        const responseFromDataUri = await fetch(base64Image);
        const blob = await responseFromDataUri.blob();

        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('overwrite', 'true');

        const response = await fetch(this.buildApiUrl('/upload/image'), {
            method: 'POST',
            headers: this.transport.defaultHeaders,
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Failed to upload image to ComfyUI: ${response.statusText}`);
        }

        const result = await response.json() as { name?: string };
        if (!result.name) {
            throw new Error('ComfyUI did not return an uploaded filename.');
        }

        return result.name;
    }

    public async getHistory(promptId: string): Promise<Record<string, unknown>> {
        const response = await fetch(buildComfyTransportRequestUrl(
            this.transport,
            `${this.transport.historyPathBase}/${promptId}`
        ), {
            headers: this.transport.defaultHeaders,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ComfyUI history: ${response.statusText}`);
        }

        return await response.json() as Record<string, unknown>;
    }

    public findImageResultInHistory(
        history: Record<string, unknown>,
        promptId: string,
        outputNodeIds: string[] = []
    ): ComfyHistoryImage | null {
        const promptEntry = history[promptId];
        if (!promptEntry || typeof promptEntry !== 'object') {
            return null;
        }

        const outputs = (promptEntry as { outputs?: Record<string, { images?: ComfyHistoryImage[] }> }).outputs;
        if (!outputs) {
            return null;
        }

        const preferredNodeIds = outputNodeIds.length > 0 ? outputNodeIds : Object.keys(outputs);
        for (const nodeId of preferredNodeIds) {
            const images = outputs[nodeId]?.images;
            if (images && images.length > 0) {
                return images[0];
            }
        }

        for (const output of Object.values(outputs)) {
            if (output.images && output.images.length > 0) {
                return output.images[0];
            }
        }

        return null;
    }

    public async waitForHistoryOutput(
        promptId: string,
        outputNodeIds: string[],
        timeoutMs: number = 1800000,
        pollIntervalMs: number = 1000,
        onProgress?: (progress: ComfyExecutionProgress) => void,
        startedAt?: number
    ): Promise<ComfyExecutionResult> {
        const startTime = Date.now();
        const progressStart = startedAt || startTime;
        let pollCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            const history = await this.getHistory(promptId);
            const promptEntry = history[promptId];
            pollCount += 1;

            if (onProgress) {
                const elapsedMs = Date.now() - progressStart;
                const summary = parseHistoryStatusSummary(promptEntry);
                const heartbeat = summary
                    ? `Waiting for image output (${summary})`
                    : 'Waiting for image output...';

                if (pollCount === 1 || pollCount % 2 === 0) {
                    onProgress({
                        nodeId: null,
                        progress: 0,
                        max: 0,
                        value: 0,
                        stage: 'waiting-history',
                        message: heartbeat,
                        elapsedMs,
                    });
                }
            }

            const historyError = this.extractHistoryExecutionError(history, promptId);
            if (historyError) {
                throw new Error(historyError);
            }

            const image = this.findImageResultInHistory(history, promptId, outputNodeIds);

            if (image) {
                if (onProgress) {
                    onProgress({
                        nodeId: null,
                        progress: 1,
                        max: 1,
                        value: 1,
                        stage: 'fetching-image',
                        message: `Fetching output image (${image.filename})...`,
                        elapsedMs: Date.now() - progressStart,
                    });
                }
                const dataUrl = await this.fetchImage(image.filename, image.subfolder, image.type);
                return {
                    dataUrl,
                    filename: image.filename,
                };
            }

            await sleep(pollIntervalMs);
        }

        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        throw new Error(
            `Timed out waiting for ComfyUI output after ${elapsedSeconds}s. `
            + 'ComfyUI may still be processing, disconnected, or blocked by missing model components (e.g. VAE/CLIP).'
        );
    }

    public async executeWorkflow(
        workflowJson: Record<string, unknown>,
        outputNodeIds: string[],
        onProgress?: (progress: ComfyExecutionProgress) => void,
        onQueued?: (promptId: string) => void
    ): Promise<ComfyExecutionResult> {
        const startedAt = Date.now();

        if (onProgress) {
            onProgress({
                nodeId: null,
                progress: 0,
                max: 0,
                value: 0,
                stage: 'connecting',
                message: 'Connecting to ComfyUI websocket...',
                elapsedMs: 0,
            });
        }

        if (onProgress) {
            this.connect();
        }

        if (onProgress) {
            onProgress({
                nodeId: null,
                progress: 0,
                max: 0,
                value: 0,
                stage: 'validating',
                message: 'Validating workflow and required models...',
                elapsedMs: Date.now() - startedAt,
            });
        }

        await this.validateWorkflowModelAvailability(workflowJson);

        if (onProgress) {
            onProgress({
                nodeId: null,
                progress: 0,
                max: 0,
                value: 0,
                stage: 'queueing',
                message: 'Queueing workflow on ComfyUI...',
                elapsedMs: Date.now() - startedAt,
            });
        }

        const response = await fetch(this.buildApiUrl('/prompt'), {
            method: 'POST',
            headers: {
                ...this.transport.defaultHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: workflowJson,
                client_id: this.clientId,
            }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            const detailSuffix = detail ? ` (${detail.slice(0, 280)})` : '';
            throw new Error(`Failed to queue prompt: ${response.status} ${response.statusText}${detailSuffix}`);
        }

        const payload = await response.json() as { prompt_id?: string };
        if (!payload.prompt_id) {
            throw new Error('ComfyUI did not return a prompt ID.');
        }

        const promptId = payload.prompt_id;

        if (onQueued) {
            try {
                onQueued(promptId);
            } catch (error) {
                console.warn('Comfy onQueued callback failed', error);
            }
        }

        if (onProgress) {
            onProgress({
                nodeId: null,
                progress: 0,
                max: 0,
                value: 0,
                stage: 'queued',
                message: `Workflow queued (prompt ${promptId.slice(0, 8)}...). Waiting for execution...`,
                elapsedMs: Date.now() - startedAt,
            });
        }

        return await new Promise<ComfyExecutionResult>((resolve, reject) => {
            this.promptIdHandlers.set(promptId, {
                resolve,
                reject,
                onProgress,
                outputNodeIds,
                settled: false,
                startedAt,
            });

            void this.waitForHistoryOutput(promptId, outputNodeIds, 1800000, 1000, onProgress, startedAt)
                .then((result) => {
                    this.resolveHandler(promptId, result);
                })
                .catch((error) => {
                    this.rejectHandler(promptId, error instanceof Error ? error : new Error(String(error)));
                });
        });
    }

    private buildApiUrl(path: string): string {
        return buildComfyTransportRequestUrl(
            this.transport,
            `${this.transport.apiBasePath}${path}`
        );
    }

    private buildViewUrl(params: URLSearchParams): string {
        return buildComfyTransportRequestUrl(
            this.transport,
            `${this.transport.apiBasePath}/view`,
            params
        );
    }

    public async getFeaturesSnapshot(): Promise<GenericJsonRecord | null> {
        try {
            const response = await fetch(this.buildApiUrl('/features'), {
                headers: this.transport.defaultHeaders,
            });

            if (!response.ok) {
                return null;
            }

            return await response.json() as GenericJsonRecord;
        } catch {
            return null;
        }
    }

    public async getSystemStatsSnapshot(): Promise<GenericJsonRecord | null> {
        try {
            const response = await fetch(this.buildApiUrl('/system_stats'), {
                headers: this.transport.defaultHeaders,
            });

            if (!response.ok) {
                return null;
            }

            return await response.json() as GenericJsonRecord;
        } catch {
            return null;
        }
    }

    public async getObjectInfoSnapshot(): Promise<Record<string, unknown> | null> {
        return await this.getObjectInfo();
    }

    private async getObjectInfo(): Promise<ComfyObjectInfoResponse | null> {
        try {
            const response = await fetch(this.buildApiUrl('/object_info'), {
                headers: this.transport.defaultHeaders,
            });

            if (!response.ok) {
                return null;
            }

            return await response.json() as ComfyObjectInfoResponse;
        } catch {
            return null;
        }
    }

    private findMissingModelInputs(
        workflowJson: Record<string, unknown>,
        objectInfo: ComfyObjectInfoResponse
    ): MissingComfyModelInput[] {
        const missing: MissingComfyModelInput[] = [];

        for (const [nodeId, rawNode] of Object.entries(workflowJson)) {
            if (!isRecord(rawNode)) {
                continue;
            }

            const classType = typeof rawNode.class_type === 'string' ? rawNode.class_type : '';
            const inputs = isRecord(rawNode.inputs) ? rawNode.inputs : null;
            if (!classType || !inputs) {
                continue;
            }

            const nodeInfo = objectInfo[classType];
            if (!nodeInfo?.input) {
                continue;
            }

            const allInputDefs: Record<string, unknown> = {
                ...(nodeInfo.input.required || {}),
                ...(nodeInfo.input.optional || {}),
            };

            for (const [inputName, configuredValue] of Object.entries(inputs)) {
                if (typeof configuredValue !== 'string' || configuredValue.length === 0) {
                    continue;
                }

                if (configuredValue.startsWith('http://') || configuredValue.startsWith('https://') || configuredValue.startsWith('data:')) {
                    continue;
                }

                const inputDefinition = allInputDefs[inputName];
                const choices = extractStringChoices(inputDefinition);
                if (choices.length === 0) {
                    continue;
                }

                if (!MODEL_INPUT_NAME_PATTERN.test(inputName)) {
                    continue;
                }

                if (!choices.includes(configuredValue)) {
                    missing.push({
                        nodeId,
                        classType,
                        inputName,
                        configuredValue,
                        availableValues: choices,
                    });
                }
            }
        }

        return missing;
    }

    private async validateWorkflowModelAvailability(workflowJson: Record<string, unknown>): Promise<void> {
        const objectInfo = await this.getObjectInfo();
        if (!objectInfo) {
            return;
        }

        const missing = this.findMissingModelInputs(workflowJson, objectInfo);
        if (missing.length === 0) {
            return;
        }

        const preview = missing
            .slice(0, 4)
            .map((issue) => `${issue.classType}.${issue.inputName} in node ${issue.nodeId} = "${issue.configuredValue}"`)
            .join('; ');

        const remainder = missing.length > 4 ? ` (+${missing.length - 4} more)` : '';

        throw new Error(
            `ComfyUI model check failed: required models are not available on this server (${preview}${remainder}). `
            + 'Install the missing models or switch to a compatible model preset.'
        );
    }

    private buildWebSocketUrl(transport: ResolvedComfyTransport): string {
        if (transport.baseUrl.startsWith('https://')) {
            return transport.baseUrl.replace('https://', 'wss://') + '/ws';
        }

        if (transport.baseUrl.startsWith('http://')) {
            return transport.baseUrl.replace('http://', 'ws://') + '/ws';
        }

        return `ws://${transport.baseUrl}/ws`;
    }

    private buildWebSocketConnectionUrl(): string {
        const params = new URLSearchParams({
            clientId: this.clientId,
        });

        if (this.transport.websocketToken) {
            params.set('token', this.transport.websocketToken);
        }

        return `${this.wsUrl}?${params.toString()}`;
    }

    private handleMessage(message: { type?: string; data?: Record<string, unknown> }) {
        const promptId = typeof message.data?.prompt_id === 'string' ? message.data.prompt_id : null;
        if (!promptId) {
            return;
        }

        const handler = this.findHandler(promptId);
        if (!handler) {
            return;
        }

        if (message.type === 'progress') {
            if (!handler.onProgress) {
                return;
            }

            const max = typeof message.data?.max === 'number' ? message.data.max : 0;
            const value = typeof message.data?.value === 'number' ? message.data.value : 0;
            const nodeId = typeof message.data?.node === 'string' ? message.data.node : null;

            handler.onProgress({
                nodeId,
                max,
                value,
                progress: max > 0 ? value / max : 0,
                stage: 'running',
                message: nodeId
                    ? `Running node ${nodeId}${max > 0 ? ` (${value}/${max})` : ''}`
                    : 'Running workflow node...',
                elapsedMs: Date.now() - handler.startedAt,
            });
            return;
        }

        if (message.type === 'executed') {
            const nodeId = typeof message.data?.node === 'string' ? message.data.node : null;
            if (!nodeId || !handler.outputNodeIds.includes(nodeId)) {
                return;
            }

            const output = message.data?.output as { images?: ComfyHistoryImage[] } | undefined;
            const image = output?.images?.[0];

            if (!image) {
                if (handler.onProgress) {
                    handler.onProgress({
                        nodeId,
                        max: 1,
                        value: 1,
                        progress: 1,
                        stage: 'completed',
                        message: 'Execution completed.',
                        elapsedMs: Date.now() - handler.startedAt,
                    });
                }
                this.resolveHandler(promptId, {});
                return;
            }

            void this.fetchImage(image.filename, image.subfolder, image.type)
                .then((dataUrl) => {
                    if (handler.onProgress) {
                        handler.onProgress({
                            nodeId,
                            max: 1,
                            value: 1,
                            progress: 1,
                            stage: 'completed',
                            message: `Output image ready (${image.filename}).`,
                            elapsedMs: Date.now() - handler.startedAt,
                        });
                    }
                    this.resolveHandler(promptId, {
                        dataUrl,
                        filename: image.filename,
                    });
                })
                .catch((error) => {
                    this.rejectHandler(promptId, error instanceof Error ? error : new Error(String(error)));
                });
            return;
        }

        if (message.type === 'execution_success') {
            void this.resolveFromHistory(promptId, handler.outputNodeIds);
            return;
        }

        if (message.type === 'execution_error') {
            const nodeId = typeof message.data?.node_id === 'string' ? message.data.node_id : 'unknown';
            const exceptionType = typeof message.data?.exception_type === 'string'
                ? message.data.exception_type
                : 'Unknown error';
            const exceptionMessage = typeof message.data?.exception_message === 'string'
                ? message.data.exception_message.trim()
                : '';
            const nodeType = typeof message.data?.node_type === 'string'
                ? message.data.node_type
                : '';

            const details = [
                nodeType ? `type=${nodeType}` : '',
                exceptionType ? `reason=${exceptionType}` : '',
                exceptionMessage,
            ].filter(Boolean).join(' | ');

            if (handler.onProgress) {
                handler.onProgress({
                    nodeId,
                    max: 1,
                    value: 1,
                    progress: 1,
                    stage: 'error',
                    message: `Execution error in node ${nodeId}${details ? ` (${details})` : ''}`,
                    elapsedMs: Date.now() - handler.startedAt,
                });
            }

            this.rejectHandler(
                promptId,
                new Error(`ComfyUI execution error in node ${nodeId}${details ? ` (${details})` : ''}`)
            );
        }
    }

    private extractHistoryExecutionError(
        history: Record<string, unknown>,
        promptId: string
    ): string | null {
        const promptEntry = history[promptId];
        if (!isRecord(promptEntry)) {
            return null;
        }

        const status = isRecord(promptEntry.status) ? promptEntry.status : null;
        if (!status) {
            return null;
        }

        const statusStr = typeof status.status_str === 'string' ? status.status_str : '';
        const messages = Array.isArray(status.messages) ? status.messages : [];

        for (const messageEntry of messages) {
            if (!Array.isArray(messageEntry) || messageEntry.length < 2) {
                continue;
            }

            const kind = typeof messageEntry[0] === 'string' ? messageEntry[0] : '';
            const payload = isRecord(messageEntry[1])
                ? messageEntry[1] as ComfyHistoryErrorPayload
                : null;

            if (kind !== 'execution_error' || !payload) {
                continue;
            }

            const nodeId = payload.node_id || 'unknown';
            const nodeType = payload.node_type ? ` type=${payload.node_type}` : '';
            const exceptionType = payload.exception_type ? ` reason=${payload.exception_type}` : '';
            const exceptionMessage = payload.exception_message || 'Unknown execution error';
            return `ComfyUI execution error in node ${nodeId}${nodeType}${exceptionType}: ${exceptionMessage}`;
        }

        if (statusStr.toLowerCase() === 'error') {
            return 'ComfyUI reported an execution error for this prompt.';
        }

        return null;
    }

    private findHandler(promptId: string): PromptHandler | null {
        return this.promptIdHandlers.get(promptId) || null;
    }

    private resolveHandler(promptId: string, result: ComfyExecutionResult) {
        const handler = this.findHandler(promptId);
        if (!handler || handler.settled) {
            return;
        }

        handler.settled = true;
        this.promptIdHandlers.delete(promptId);
        handler.resolve(result);
    }

    private rejectHandler(promptId: string, error: Error) {
        const handler = this.findHandler(promptId);
        if (!handler || handler.settled) {
            return;
        }

        handler.settled = true;
        this.promptIdHandlers.delete(promptId);
        handler.reject(error);
    }

    private async resolveFromHistory(promptId: string, outputNodeIds: string[]) {
        try {
            const handler = this.findHandler(promptId);
            const result = await this.waitForHistoryOutput(
                promptId,
                outputNodeIds,
                5000,
                500,
                handler?.onProgress,
                handler?.startedAt
            );
            this.resolveHandler(promptId, result);
        } catch (error) {
            this.rejectHandler(promptId, error instanceof Error ? error : new Error(String(error)));
        }
    }

    private async fetchImage(
        filename: string,
        subfolder: string = '',
        type: string = 'output'
    ): Promise<string> {
        const params = new URLSearchParams({
            filename,
            subfolder,
            type,
        });

        const response = await fetch(this.buildViewUrl(params), {
            headers: this.transport.defaultHeaders,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch image from ComfyUI: ${response.statusText}`);
        }

        const blob = await response.blob();

        if (typeof FileReader !== 'undefined') {
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read ComfyUI image blob.'));
                reader.readAsDataURL(blob);
            });
        }

        const arrayBuffer = await blob.arrayBuffer();
        const contentType = response.headers.get('content-type') || blob.type || 'image/png';
        const nodeBuffer = Buffer.from(arrayBuffer);
        return `data:${contentType};base64,${nodeBuffer.toString('base64')}`;
    }
}

export const comfyUIClient = new ComfyUIClient();

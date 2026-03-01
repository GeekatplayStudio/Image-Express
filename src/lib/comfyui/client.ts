import {
    DEFAULT_COMFY_LOCAL_URL,
    createLocalComfyTransport,
    type ResolvedComfyTransport,
} from '@/lib/comfyui/connection';

export interface ComfyExecutionProgress {
    nodeId: string | null;
    progress: number;
    max: number;
    value: number;
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
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        const response = await fetch(`${this.transport.baseUrl}${this.transport.historyPathBase}/${promptId}`, {
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
        timeoutMs: number = 120000,
        pollIntervalMs: number = 1000
    ): Promise<ComfyExecutionResult> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const history = await this.getHistory(promptId);
            const image = this.findImageResultInHistory(history, promptId, outputNodeIds);

            if (image) {
                const dataUrl = await this.fetchImage(image.filename, image.subfolder, image.type);
                return {
                    dataUrl,
                    filename: image.filename,
                };
            }

            await sleep(pollIntervalMs);
        }

        throw new Error('Timed out waiting for ComfyUI output.');
    }

    public async executeWorkflow(
        workflowJson: Record<string, unknown>,
        outputNodeIds: string[],
        onProgress?: (progress: ComfyExecutionProgress) => void
    ): Promise<ComfyExecutionResult> {
        this.connect();

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
            throw new Error(`Failed to queue prompt: ${response.statusText}`);
        }

        const payload = await response.json() as { prompt_id?: string };
        if (!payload.prompt_id) {
            throw new Error('ComfyUI did not return a prompt ID.');
        }

        const promptId = payload.prompt_id;

        return await new Promise<ComfyExecutionResult>((resolve, reject) => {
            this.promptIdHandlers.set(promptId, {
                resolve,
                reject,
                onProgress,
                outputNodeIds,
                settled: false,
            });

            void this.waitForHistoryOutput(promptId, outputNodeIds)
                .then((result) => {
                    this.resolveHandler(promptId, result);
                })
                .catch((error) => {
                    this.rejectHandler(promptId, error instanceof Error ? error : new Error(String(error)));
                });
        });
    }

    private buildApiUrl(path: string): string {
        return `${this.transport.baseUrl}${this.transport.apiBasePath}${path}`;
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
                this.resolveHandler(promptId, {});
                return;
            }

            void this.fetchImage(image.filename, image.subfolder, image.type)
                .then((dataUrl) => {
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

            this.rejectHandler(promptId, new Error(`ComfyUI execution error in node ${nodeId}: ${exceptionType}`));
        }
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
            const result = await this.waitForHistoryOutput(promptId, outputNodeIds, 5000, 500);
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

        const response = await fetch(`${this.buildApiUrl('/view')}?${params.toString()}`, {
            headers: this.transport.defaultHeaders,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch image from ComfyUI: ${response.statusText}`);
        }

        const blob = await response.blob();

        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read ComfyUI image blob.'));
            reader.readAsDataURL(blob);
        });
    }
}

export const comfyUIClient = new ComfyUIClient();

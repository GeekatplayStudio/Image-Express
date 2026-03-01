export interface ComfyExecutionProgress {
    nodeId: string | null;
    progress: number; // 0 to 1
    max: number;
    value: number;
}

export interface ComfyExecutionResult {
    dataUrl?: string;
    filename?: string;
    error?: string;
}

export class ComfyUIClient {
    private baseUrl: string;
    private wsUrl: string;
    private clientId: string;
    private ws: WebSocket | null = null;
    private promptIdHandlers: Map<string, {
        resolve: (result: ComfyExecutionResult) => void;
        reject: (error: any) => void;
        onProgress?: (progress: ComfyExecutionProgress) => void;
        outputNodeIds: string[];
    }> = new Map();

    constructor(serverUrl: string = 'http://127.0.0.1:8188') {
        this.setServerUrl(serverUrl);
        // Generate a simple UUID for this client
        this.clientId = Math.random().toString(36).substring(2, 15);
    }

    public setServerUrl(url: string) {
        // Ensure no trailing slash
        this.baseUrl = url.trim().replace(/\/$/, '');

        // Convert http(s) to ws(s)
        if (this.baseUrl.startsWith('https://')) {
            this.wsUrl = this.baseUrl.replace('https://', 'wss://') + '/ws';
        } else if (this.baseUrl.startsWith('http://')) {
            this.wsUrl = this.baseUrl.replace('http://', 'ws://') + '/ws';
        } else {
            this.wsUrl = `ws://${this.baseUrl}/ws`;
            this.baseUrl = `http://${this.baseUrl}`;
        }
    }

    public connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            this.ws = new WebSocket(`${this.wsUrl}?clientId=${this.clientId}`);

            this.ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        this.handleMessage(msg);
                    } catch (e) {
                        console.error('Failed to parse ComfyUI WS message', e);
                    }
                }
            };

            this.ws.onerror = (error) => {
                console.error('ComfyUI WebSocket error:', error);
            };

            this.ws.onclose = () => {
                this.ws = null;
            };
        } catch (e) {
            console.error('Failed to connect to ComfyUI websocket', e);
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private handleMessage(msg: any) {
        if (msg.type === 'progress') {
            const data = msg.data;
            const handler = this.findHandlerByPromptId(data.prompt_id);
            if (handler && handler.onProgress) {
                handler.onProgress({
                    nodeId: data.node,
                    max: data.max,
                    value: data.value,
                    progress: data.value / data.max
                });
            }
        } else if (msg.type === 'executed') {
            const data = msg.data;
            // data.node is the output node ID
            // data.output has the resulting images/files
            const handler = this.findHandlerByPromptId(data.prompt_id);
            if (handler && handler.outputNodeIds.includes(data.node)) {
                if (data.output && data.output.images && data.output.images.length > 0) {
                    const imageInfo = data.output.images[0];
                    this.fetchImage(imageInfo.filename, imageInfo.subfolder, imageInfo.type)
                        .then(dataUrl => handler.resolve({ dataUrl, filename: imageInfo.filename }))
                        .catch(handler.reject);
                } else {
                    handler.resolve({}); // No image output
                }
                this.promptIdHandlers.delete(data.prompt_id);
            }
        } else if (msg.type === 'execution_error') {
            const data = msg.data;
            const handler = this.findHandlerByPromptId(data.prompt_id);
            if (handler) {
                handler.reject(new Error(`ComfyUI Execution Error in node ${data.node_id}: ${data.exception_type}`));
                this.promptIdHandlers.delete(data.prompt_id);
            }
        }
    }

    private findHandlerByPromptId(promptId: string) {
        return this.promptIdHandlers.get(promptId);
    }

    public async uploadImage(base64Image: string, filename: string = 'upload.png'): Promise<string> {
        // Convert base64 to blob
        const res = await fetch(base64Image);
        const blob = await res.blob();

        const formData = new FormData();
        formData.append('image', blob, filename);
        formData.append('overwrite', 'true');

        const response = await fetch(`${this.baseUrl}/upload/image`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Failed to upload image to ComfyUI: ${response.statusText}`);
        }

        const result = await response.json();
        return result.name; // Return the filename stored on the server
    }

    private async fetchImage(filename: string, subfolder: string = '', type: string = 'output'): Promise<string> {
        const params = new URLSearchParams({
            filename,
            subfolder,
            type
        });
        const response = await fetch(`${this.baseUrl}/view?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch image from ComfyUI: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    public async executeWorkflow(
        workflowJson: any,
        outputNodeIds: string[],
        onProgress?: (progress: ComfyExecutionProgress) => void
    ): Promise<ComfyExecutionResult> {
        this.connect(); // Ensure we are connected

        const response = await fetch(`${this.baseUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: workflowJson,
                client_id: this.clientId
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to queue prompt: ${response.statusText}`);
        }

        const { prompt_id } = await response.json();

        return new Promise((resolve, reject) => {
            this.promptIdHandlers.set(prompt_id, {
                resolve,
                reject,
                onProgress,
                outputNodeIds
            });
        });
    }
}

// Global instance 
export const comfyUIClient = new ComfyUIClient();

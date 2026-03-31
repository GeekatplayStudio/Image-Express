'use client';

import type { BackgroundJob } from '@/types';
import { extractApiErrorMessage, parseApiResponse } from '@/lib/apiErrorParsing';
import {
    hitemsRequiresMeshUrl,
    normalizeHitemsFace,
    normalizeHitemsSelection,
    type HitemsSelection,
} from '@/lib/hitemsOptions';
import type { HitemsImageViewMode, HitemsSetupStatus } from './types';

export const isMissingSanitizedKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 || normalized === 'bearer' || normalized === 'undefined' || normalized === 'null' || normalized === 'nan';
};

export const sanitizeHeaderValue = (value: string) => value.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

export const getHitemsSetupStatus = ({ hitemsAk, hitemsSk }: { hitemsAk: string; hitemsSk: string }): HitemsSetupStatus => {
    if (typeof window === 'undefined') {
        return { label: 'Check setup', isReady: false };
    }

    const storedKey = (localStorage.getItem('hitems_api_key') || '').trim();
    const typedKey = [hitemsAk.trim(), hitemsSk.trim()].every(Boolean) ? `${hitemsAk.trim()}:${hitemsSk.trim()}` : '';
    const effectiveKey = (storedKey || typedKey).replace(/Bearer /gi, '').replace(/["']/g, '').trim();
    if (isMissingSanitizedKey(effectiveKey)) {
        return { label: 'Missing API key', isReady: false };
    }

    const appId = (localStorage.getItem('hitems_appid') || '').trim();
    if (!appId) {
        return { label: 'Ready (App ID optional)', isReady: true };
    }
    return { label: 'Ready', isReady: true };
};

interface CreateHitemsActionsArgs {
    recoverJobId: string;
    getSelectedKey: () => string;
    toast: (payload: { title: string; description: string; variant: 'warning' | 'success' | 'destructive' }) => void;
    onRecoverBackgroundJob?: (job: Partial<BackgroundJob>) => void;
    onStartBackgroundJob?: (job: Partial<BackgroundJob>) => void;
    setIsValidatingHitems: (value: boolean) => void;
    setIsLoading: (value: boolean) => void;
    initialImage?: string;
    frontImageUrl: string;
    hitemsModel: string;
    hitemsRequestType: string;
    hitemsResolution: string;
    hitemsFormat: string;
    hitemsFace: string;
    hitemsMeshUrl: string;
    hitemsImageViewMode: HitemsImageViewMode;
    hitemsBackLayerId: string;
    hitemsLeftLayerId: string;
    hitemsRightLayerId: string;
    resolveLayerImageUrl: (layerId: string) => string;
    applyHitemsSelectionToState: (selection: HitemsSelection) => void;
}

export const createHitemsActions = ({
    recoverJobId,
    getSelectedKey,
    toast,
    onRecoverBackgroundJob,
    onStartBackgroundJob,
    setIsValidatingHitems,
    setIsLoading,
    initialImage,
    frontImageUrl,
    hitemsModel,
    hitemsRequestType,
    hitemsResolution,
    hitemsFormat,
    hitemsFace,
    hitemsMeshUrl,
    hitemsImageViewMode,
    hitemsBackLayerId,
    hitemsLeftLayerId,
    hitemsRightLayerId,
    resolveLayerImageUrl,
    applyHitemsSelectionToState,
}: CreateHitemsActionsArgs) => {
    const validateHitemsSetup = async () => {
        let key = getSelectedKey();
        if (!key) {
            toast({ title: 'Missing API key', description: 'Add your Hitem key/token in Settings first.', variant: 'warning' });
            return;
        }

        key = sanitizeHeaderValue(key);
        const appId = sanitizeHeaderValue(localStorage.getItem('hitems_appid') || '');
        const localHints: string[] = [];
        if (key.includes(':')) {
            const [ak, sk] = key.split(':');
            if (!ak || !sk) localHints.push('Key format looks invalid. Expected `ak:sk` when using app credentials.');
        } else if (key.length < 20) {
            localHints.push('Token length looks short. Verify you pasted the full token.');
        }
        if (!appId) {
            localHints.push('App ID is empty. Some Hitem accounts require `hitems_appid`.');
        }

        setIsValidatingHitems(true);
        try {
            const authHeader = key.includes(':') ? key : `Bearer ${key}`;
            const headers: Record<string, string> = { Authorization: authHeader };
            if (appId) headers.Appid = appId;
            const res = await fetch('/api/ai/hitems/validate', { method: 'GET', headers });
            const data = await res.json().catch(() => ({})) as { valid?: boolean; message?: string; detail?: string };
            const remoteMessage = data.message || data.detail || `Validation returned status ${res.status}.`;
            if (res.ok && data.valid) {
                const hintText = localHints.length ? ` Local checks: ${localHints.join(' ')}` : '';
                toast({ title: 'Hitem setup looks good', description: `${remoteMessage}${hintText}`, variant: 'success' });
            } else {
                const hintText = localHints.length ? ` ${localHints.join(' ')}` : '';
                toast({ title: 'Hitem setup validation failed', description: `${remoteMessage}${hintText}`, variant: 'destructive' });
            }
        } catch (error) {
            toast({ title: 'Validation error', description: error instanceof Error ? error.message : 'Failed to validate Hitem setup.', variant: 'destructive' });
        } finally {
            setIsValidatingHitems(false);
        }
    };

    const handleRecoverHitemsJob = () => {
        const jobId = recoverJobId.trim();
        if (!jobId) {
            toast({ title: 'Missing job ID', description: 'Enter a Hitem task ID to recover tracking.', variant: 'warning' });
            return;
        }

        let key = getSelectedKey();
        if (!key) {
            toast({ title: 'Missing API key', description: 'Set your Hitem key before recovering a job.', variant: 'warning' });
            return;
        }
        key = key.replace(/Bearer /gi, '').replace(/["']/g, '').trim();

        const payload: Partial<BackgroundJob> = {
            id: jobId,
            type: 'image-to-3d',
            provider: 'hitems',
            status: 'IN_PROGRESS',
            progress: 0,
            prompt: `Recovered: ${jobId.slice(0, 18)}`,
            createdAt: Date.now(),
            apiKey: key,
            error: undefined,
        };
        if (onRecoverBackgroundJob) onRecoverBackgroundJob(payload);
        else onStartBackgroundJob?.(payload);
        toast({ title: 'Recovery started', description: `Tracking Hitem job ${jobId}.`, variant: 'success' });
    };

    const generateHitems = async (key: string) => {
        if (!initialImage || !frontImageUrl) {
            toast({ title: 'Missing front layer', description: 'Select a front layer/image for Hitem generation.', variant: 'warning' });
            setIsLoading(false);
            return;
        }

        const normalizedSelection = normalizeHitemsSelection({
            model: hitemsModel,
            requestType: hitemsRequestType,
            resolution: hitemsResolution,
            format: hitemsFormat,
            face: hitemsFace,
            meshUrl: hitemsMeshUrl,
        });
        const rawFaceText = hitemsFace.trim();
        if (rawFaceText && !normalizeHitemsFace(rawFaceText)) {
            toast({ title: 'Invalid face count', description: 'Face count must be an integer between 100000 and 2000000.', variant: 'warning' });
            setIsLoading(false);
            return;
        }
        applyHitemsSelectionToState(normalizedSelection);

        if (hitemsRequiresMeshUrl(normalizedSelection.requestType) && !normalizedSelection.meshUrl) {
            toast({ title: 'Mesh URL required', description: 'Texture Existing Mesh mode requires a mesh_url (public GLB/OBJ URL).', variant: 'warning' });
            setIsLoading(false);
            return;
        }

        const normalizedFace = normalizeHitemsFace(normalizedSelection.face);
        try {
            const formData = new FormData();
            const appendImageAs = async (url: string, fieldName: 'images' | 'multi_images', filenamePrefix: string) => {
                const imageRes = await fetch(url);
                if (!imageRes.ok) {
                    throw new Error('Failed to load one of the selected view images. Ensure URLs are public and reachable.');
                }
                const blob = await imageRes.blob();
                const mimeType = blob.type || 'image/png';
                let fileExt = 'png';
                if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') fileExt = 'jpg';
                else if (mimeType === 'image/webp') fileExt = 'webp';
                formData.append(fieldName, blob, `${filenamePrefix}.${fileExt}`);
            };

            const optionalViews = [resolveLayerImageUrl(hitemsBackLayerId), resolveLayerImageUrl(hitemsLeftLayerId), resolveLayerImageUrl(hitemsRightLayerId)].filter(Boolean);
            if (hitemsImageViewMode === 'multi') {
                await appendImageAs(frontImageUrl, 'multi_images', 'front-view');
                for (let index = 0; index < optionalViews.length; index += 1) {
                    await appendImageAs(optionalViews[index], 'multi_images', `extra-view-${index + 1}`);
                }
                if (optionalViews.length === 0) {
                    throw new Error('Multi-view requires at least one additional view URL (back, left, or right).');
                }
                const bitFlags = [
                    '1',
                    resolveLayerImageUrl(hitemsBackLayerId) ? '1' : '0',
                    resolveLayerImageUrl(hitemsLeftLayerId) ? '1' : '0',
                    resolveLayerImageUrl(hitemsRightLayerId) ? '1' : '0',
                ].join('');
                formData.append('multi_images_bit', bitFlags);
            } else {
                await appendImageAs(frontImageUrl, 'images', 'image');
            }

            formData.append('model', normalizedSelection.model);
            formData.append('request_type', normalizedSelection.requestType);
            formData.append('resolution', normalizedSelection.resolution);
            formData.append('format', normalizedSelection.format);
            if (normalizedFace) formData.append('face', normalizedFace);
            if (hitemsRequiresMeshUrl(normalizedSelection.requestType)) formData.append('mesh_url', normalizedSelection.meshUrl);

            const sanitizedKey = sanitizeHeaderValue(key);
            if (isMissingSanitizedKey(sanitizedKey)) {
                toast({ title: 'Missing API key', description: 'Configure a valid Hitem key/token in Settings, then retry.', variant: 'warning' });
                setIsLoading(false);
                return;
            }

            const authHeader = sanitizedKey.includes(':') ? sanitizedKey : `Bearer ${sanitizedKey}`;
            const appId = sanitizeHeaderValue(localStorage.getItem('hitems_appid') || '');
            const headers: Record<string, string> = { Authorization: authHeader };
            if (appId) headers.Appid = appId;

            const res = await fetch('/api/ai/hitems', { method: 'POST', headers, body: formData });
            const { data, responseText } = await parseApiResponse(res);
            const nestedTaskId = (() => {
                if (!data?.data || typeof data.data !== 'object') return null;
                const taskIdCandidate = (data.data as Record<string, unknown>).task_id;
                return typeof taskIdCandidate === 'string' && taskIdCandidate.trim().length > 0 ? taskIdCandidate : null;
            })();
            const taskId = nestedTaskId || (typeof data?.task_id === 'string' && data.task_id.trim().length > 0 ? data.task_id : null);

            if (res.ok && taskId) {
                onStartBackgroundJob?.({
                    id: taskId,
                    type: 'image-to-3d',
                    provider: 'hitems',
                    status: 'IN_PROGRESS',
                    prompt: `${normalizedSelection.model} (${normalizedSelection.resolution})`,
                    createdAt: Date.now(),
                    apiKey: key,
                });
                return;
            }

            const reason = extractApiErrorMessage({
                data,
                responseText,
                status: res.status,
                statusText: res.statusText,
                fallback: res.ok ? 'Hitem request succeeded but did not return a task_id. Try Validate Setup and retry.' : 'Hitem request failed',
            });
            const reasonText = String(reason || '').trim();
            const isAuthIssue = /auth|token|appid|unauthorized|forbidden|credential|login/i.test(reasonText);
            const alreadyHasSetupGuidance = /hitems_api_key|hitems_appid|validate setup/i.test(reasonText);
            const setupHint = isAuthIssue && !alreadyHasSetupGuidance ? ' Check `hitems_api_key` and `hitems_appid` in Settings, then use Validate Setup.' : '';
            toast({ title: 'Generation failed', description: `${reasonText || 'Hitem request failed'}${setupHint}`, variant: 'destructive' });
            setIsLoading(false);
        } catch (error) {
            if (typeof window !== 'undefined' && window.localStorage.getItem('hitems_debug') === '1') {
                console.warn('Hitem3D request failed', error);
            }
            toast({ title: 'Generation failed', description: `${error instanceof Error ? error.message : 'Failed to send image to Hitem3D.'} Check setup with Validate Setup.`, variant: 'destructive' });
            setIsLoading(false);
        }
    };

    return { validateHitemsSetup, handleRecoverHitemsJob, generateHitems };
};

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_MODEL,
    loadLocalAiPreferences,
    saveLocalAiPreferences,
} from '@/lib/localAiPreferences';
import { requestOllamaModelInstall } from '@/lib/ollamaModelInstall';
import {
    UPSCALE_PROVIDERS,
    loadUpscalePreferences,
    saveUpscalePreferences,
    type UpscalePreferences,
} from '@/lib/upscale/upscaleProviders';
import { STORAGE_KEYS, sanitizeHeaderValue, type ValidationProvider, type ValidationState } from '../settingsTypes';

/** Upscale providers that carry their own key (Stability reuses its existing field). */
const UPSCALE_KEY_PROVIDERS = UPSCALE_PROVIDERS.filter(
    (provider) => provider.apiKeyStorageKey && provider.apiKeyStorageKey !== STORAGE_KEYS.STABILITY_API_KEY,
);

/**
 * API key state for every generative provider (3D + image + local Ollama),
 * their preflight validation, and the Ollama reachability/model-install
 * checks. Loads from localStorage on open, and from the account's server
 * record when signed in.
 */
export function useApiKeysSettings(isOpen: boolean, userId?: string) {
    const [meshyKey, setMeshyKey] = useState('');
    const [tripoKey, setTripoKey] = useState('');
    const [hitemsKey, setHitemsKey] = useState(''); // Stores either "token" or "ak:sk"

    // UI state for splitting Hitems key
    const [hitemsMode, setHitemsMode] = useState<'token' | 'ak_sk'>('ak_sk');
    const [hitemsAk, setHitemsAk] = useState('');
    const [hitemsSk, setHitemsSk] = useState('');
    const [hitemsAppId, setHitemsAppId] = useState('');

    const [stabilityKey, setStabilityKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [googleKey, setGoogleKey] = useState('');
    const [bananaKey, setBananaKey] = useState('');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
    const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);

    const [upscaleKeys, setUpscaleKeys] = useState<Record<string, string>>({});
    const [upscalePreferences, setUpscalePreferences] = useState<UpscalePreferences>(() => loadUpscalePreferences());

    const [syncStatus, setSyncStatus] = useState<'local' | 'synced' | 'syncing'>('local');
    const [ollamaCheck, setOllamaCheck] = useState<{
        state: 'idle' | 'checking' | 'success' | 'error';
        message: string;
        modelFound?: boolean;
    }>({ state: 'idle', message: '' });
    const [isInstallingOllamaModel, setIsInstallingOllamaModel] = useState(false);

    const [validationStatus, setValidationStatus] = useState<Record<ValidationProvider, { state: ValidationState; message: string }>>({
        meshy: { state: 'idle', message: '' },
        tripo: { state: 'idle', message: '' },
        hitems: { state: 'idle', message: '' },
        google: { state: 'idle', message: '' },
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        setMeshyKey(localStorage.getItem(STORAGE_KEYS.MESHY_API_KEY) || '');
        setTripoKey(localStorage.getItem(STORAGE_KEYS.TRIPO_API_KEY) || '');
        setHitemsAppId(localStorage.getItem(STORAGE_KEYS.HITEMS_APP_ID) || '');

        const rawHitemKey = localStorage.getItem(STORAGE_KEYS.HITEMS_API_KEY) || '';
        setHitemsKey(rawHitemKey);
        if (rawHitemKey.includes(':') && !rawHitemKey.startsWith('Bearer')) {
            setHitemsMode('ak_sk');
            const [ak, sk] = rawHitemKey.split(':');
            setHitemsAk(ak || '');
            setHitemsSk(sk || '');
        } else if (!rawHitemKey) {
            setHitemsMode('ak_sk');
        } else {
            setHitemsMode('token');
        }

        setStabilityKey(localStorage.getItem(STORAGE_KEYS.STABILITY_API_KEY) || '');
        setOpenaiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
        setGoogleKey(localStorage.getItem(STORAGE_KEYS.GOOGLE_API_KEY) || '');
        setBananaKey(localStorage.getItem(STORAGE_KEYS.BANANA_API_KEY) || '');

        setUpscaleKeys(Object.fromEntries(UPSCALE_KEY_PROVIDERS.map(
            (provider) => [provider.id, localStorage.getItem(provider.apiKeyStorageKey) || ''],
        )));
        setUpscalePreferences(loadUpscalePreferences());

        const localAiPreferences = loadLocalAiPreferences();
        setOllamaBaseUrl(localAiPreferences.ollamaBaseUrl);
        setOllamaModel(localAiPreferences.ollamaModel);

        if (userId && userId !== 'Guest') {
            setSyncStatus('syncing');
            fetch(`/api/user/keys?userId=${encodeURIComponent(userId)}`)
                .then(async (res) => {
                    if (!res.ok) {
                        setSyncStatus('local');
                        return null;
                    }
                    try {
                        return await res.json();
                    } catch {
                        setSyncStatus('local');
                        return null;
                    }
                })
                .then((data) => {
                    if (!data) return;
                    if (data.keys) {
                        if (data.keys.meshy) setMeshyKey(data.keys.meshy);
                        if (data.keys.tripo) setTripoKey(data.keys.tripo);
                        if (data.keys.hitems) {
                            const raw = data.keys.hitems;
                            setHitemsKey(raw);
                            if (raw.includes(':') && !raw.startsWith('Bearer')) {
                                setHitemsMode('ak_sk');
                                const [ak, sk] = raw.split(':');
                                setHitemsAk(ak || '');
                                setHitemsSk(sk || '');
                            } else {
                                setHitemsMode(raw ? 'token' : 'ak_sk');
                            }
                        }
                        if (data.keys.stability) setStabilityKey(data.keys.stability);
                        if (data.keys.openai) setOpenaiKey(data.keys.openai);
                        if (data.keys.google) setGoogleKey(data.keys.google);
                        if (data.keys.banana) setBananaKey(data.keys.banana);
                        setUpscaleKeys((current) => {
                            const next = { ...current };
                            for (const provider of UPSCALE_KEY_PROVIDERS) {
                                const value = data.keys[provider.accountKeyName];
                                if (typeof value === 'string' && value) next[provider.id] = value;
                            }
                            return next;
                        });
                        setSyncStatus('synced');
                    } else {
                        setSyncStatus('local');
                    }
                })
                .catch(() => setSyncStatus('local'));
        } else {
            setSyncStatus('local');
        }
    }, [isOpen, userId]);

    const setProviderValidation = useCallback((provider: ValidationProvider, state: ValidationState, message: string) => {
        setValidationStatus((prev) => ({ ...prev, [provider]: { state, message } }));
    }, []);

    const clearProviderValidation = useCallback((provider: ValidationProvider) => {
        setProviderValidation(provider, 'idle', '');
    }, [setProviderValidation]);

    const getEffectiveHitemsKey = useCallback(() => {
        if (hitemsMode === 'ak_sk') {
            const ak = hitemsAk.trim();
            const sk = hitemsSk.trim();
            return ak && sk ? `${ak}:${sk}` : '';
        }
        return hitemsKey.trim();
    }, [hitemsAk, hitemsKey, hitemsMode, hitemsSk]);

    const validateProviderKey = useCallback(async (provider: ValidationProvider) => {
        if (provider === 'meshy') {
            const key = meshyKey.trim();
            if (!key) return setProviderValidation('meshy', 'invalid', 'Meshy key is empty.');
            if (key.length < 20) return setProviderValidation('meshy', 'invalid', 'Meshy key looks too short.');
            return setProviderValidation('meshy', 'valid', 'Meshy key format looks valid (preflight check).');
        }

        if (provider === 'tripo') {
            const key = tripoKey.trim();
            if (!key) return setProviderValidation('tripo', 'invalid', 'Tripo key is empty.');
            if (key.length < 20) return setProviderValidation('tripo', 'invalid', 'Tripo key looks too short.');
            return setProviderValidation('tripo', 'valid', 'Tripo key format looks valid (preflight check).');
        }

        if (provider === 'google') {
            const key = googleKey.trim();
            if (!key) return setProviderValidation('google', 'invalid', 'Google key is empty.');
            if (!/^AIza[\w-]{20,}$/.test(key)) return setProviderValidation('google', 'invalid', 'Google key format looks invalid.');
            return setProviderValidation('google', 'valid', 'Google key format looks valid (preflight check).');
        }

        const effectiveHitemsKey = sanitizeHeaderValue(getEffectiveHitemsKey());
        const appId = sanitizeHeaderValue(hitemsAppId);
        if (!effectiveHitemsKey) {
            setProviderValidation('hitems', 'invalid', 'Hitem key is empty.');
            return;
        }

        setProviderValidation('hitems', 'checking', 'Validating Hitem credentials...');
        try {
            const authHeader = effectiveHitemsKey.includes(':') ? effectiveHitemsKey : `Bearer ${effectiveHitemsKey}`;
            const headers: Record<string, string> = { Authorization: authHeader };
            if (appId) headers.Appid = appId;

            const res = await fetch('/api/ai/hitems/validate', { method: 'GET', headers });
            const data = (await res.json().catch(() => ({}))) as { valid?: boolean; message?: string; detail?: string };
            const message = data.message || data.detail || `Validation returned HTTP ${res.status}.`;

            if (res.ok && data.valid) {
                localStorage.setItem(STORAGE_KEYS.HITEMS_API_KEY, effectiveHitemsKey);
                localStorage.setItem(STORAGE_KEYS.HITEMS_APP_ID, appId);
                setProviderValidation('hitems', 'valid', message);
            } else {
                setProviderValidation('hitems', 'invalid', message);
            }
        } catch (error) {
            setProviderValidation('hitems', 'invalid', error instanceof Error ? error.message : 'Validation failed.');
        }
    }, [getEffectiveHitemsKey, googleKey, hitemsAppId, meshyKey, setProviderValidation, tripoKey]);

    const handleCheckOllama = useCallback(async () => {
        setOllamaCheck({ state: 'checking', message: 'Checking Ollama runtime...', modelFound: undefined });
        try {
            const params = new URLSearchParams({
                baseUrl: ollamaBaseUrl.trim() || DEFAULT_OLLAMA_BASE_URL,
                model: ollamaModel.trim() || DEFAULT_OLLAMA_MODEL,
            });
            const response = await fetch(`/api/ai/ollama/status?${params.toString()}`);
            const data = await response.json() as {
                success?: boolean;
                message?: string;
                count?: number;
                requestedModel?: string;
                modelFound?: boolean;
                models?: string[];
            };

            if (!response.ok || !data.success) {
                setOllamaCheck({ state: 'error', message: data.message || 'Failed to contact Ollama.', modelFound: undefined });
                return;
            }

            const requestedModel = data.requestedModel || (ollamaModel.trim() || DEFAULT_OLLAMA_MODEL);
            const summary = data.modelFound
                ? `Ollama is reachable. Found ${requestedModel}${typeof data.count === 'number' ? ` (${data.count} model${data.count === 1 ? '' : 's'} installed)` : ''}.`
                : `Ollama is reachable, but ${requestedModel} is not installed yet.${Array.isArray(data.models) && data.models.length > 0 ? ` Available: ${data.models.slice(0, 3).join(', ')}${data.models.length > 3 ? '…' : ''}.` : ''}`;

            setOllamaCheck({ state: data.modelFound ? 'success' : 'error', message: summary, modelFound: Boolean(data.modelFound) });
        } catch (error) {
            setOllamaCheck({ state: 'error', message: error instanceof Error ? error.message : 'Failed to contact Ollama.', modelFound: undefined });
        }
    }, [ollamaBaseUrl, ollamaModel]);

    const handleInstallOllamaModel = useCallback(async () => {
        setIsInstallingOllamaModel(true);
        setOllamaCheck({ state: 'checking', message: `Installing ${ollamaModel.trim() || DEFAULT_OLLAMA_MODEL}...`, modelFound: false });
        try {
            const result = await requestOllamaModelInstall({ baseUrl: ollamaBaseUrl, model: ollamaModel });
            setOllamaCheck({ state: 'success', message: result.message, modelFound: true });
            await handleCheckOllama();
        } catch (error) {
            setOllamaCheck({ state: 'error', message: error instanceof Error ? error.message : 'Failed to install the Ollama model.', modelFound: false });
        } finally {
            setIsInstallingOllamaModel(false);
        }
    }, [handleCheckOllama, ollamaBaseUrl, ollamaModel]);

    const getEffectiveKeysForSave = useCallback(() => ({
        meshy: meshyKey,
        tripo: tripoKey,
        hitems: getEffectiveHitemsKey(),
        hitemsAppId,
        stability: stabilityKey,
        openai: openaiKey,
        google: googleKey,
        banana: bananaKey,
    }), [bananaKey, getEffectiveHitemsKey, hitemsAppId, googleKey, meshyKey, openaiKey, stabilityKey, tripoKey]);

    const setUpscaleKey = useCallback((providerId: string, value: string) => {
        setUpscaleKeys((current) => ({ ...current, [providerId]: value }));
    }, []);

    /** Keyed by accountKeyName, ready to spread into the /api/user/keys payload. */
    const getUpscaleKeysForSave = useCallback(() => Object.fromEntries(
        UPSCALE_KEY_PROVIDERS.map((provider) => [provider.accountKeyName, upscaleKeys[provider.id] || '']),
    ), [upscaleKeys]);

    const saveUpscaleSettings = useCallback(() => {
        for (const provider of UPSCALE_KEY_PROVIDERS) {
            localStorage.setItem(provider.apiKeyStorageKey, (upscaleKeys[provider.id] || '').trim());
        }
        saveUpscalePreferences(upscalePreferences);
    }, [upscaleKeys, upscalePreferences]);

    const saveOllamaPreferences = useCallback(() => {
        saveLocalAiPreferences({ ollamaBaseUrl, ollamaModel });
    }, [ollamaBaseUrl, ollamaModel]);

    return {
        meshyKey, setMeshyKey,
        tripoKey, setTripoKey,
        hitemsKey, setHitemsKey,
        hitemsMode, setHitemsMode,
        hitemsAk, setHitemsAk,
        hitemsSk, setHitemsSk,
        hitemsAppId, setHitemsAppId,
        stabilityKey, setStabilityKey,
        openaiKey, setOpenaiKey,
        googleKey, setGoogleKey,
        bananaKey, setBananaKey,
        ollamaBaseUrl, setOllamaBaseUrl,
        ollamaModel, setOllamaModel,
        upscaleKeys, setUpscaleKey,
        upscalePreferences, setUpscalePreferences,
        getUpscaleKeysForSave, saveUpscaleSettings,
        syncStatus, setSyncStatus,
        ollamaCheck, setOllamaCheck,
        isInstallingOllamaModel,
        validationStatus,
        clearProviderValidation,
        validateProviderKey,
        handleCheckOllama,
        handleInstallOllamaModel,
        getEffectiveHitemsKey,
        getEffectiveKeysForSave,
        saveOllamaPreferences,
    };
}

export type ApiKeysSettings = ReturnType<typeof useApiKeysSettings>;

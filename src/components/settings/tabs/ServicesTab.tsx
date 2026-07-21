'use client';

import { Box, Cloud, Loader2 } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from '@/lib/localAiPreferences';
import type { ApiKeysSettings } from '../hooks/useApiKeysSettings';
import { modalSectionClass, fieldCardClass } from '../settingsTypes';

interface ServicesTabProps {
    apiKeys: ApiKeysSettings;
}

/** 3D provider keys, image/vision provider keys, and the local Ollama runtime. */
export default function ServicesTab({ apiKeys }: ServicesTabProps) {
    const { t } = useI18n();
    const {
        meshyKey, setMeshyKey, tripoKey, setTripoKey,
        hitemsMode, setHitemsMode, hitemsKey, setHitemsKey, hitemsAk, setHitemsAk, hitemsSk, setHitemsSk, hitemsAppId, setHitemsAppId,
        stabilityKey, setStabilityKey, openaiKey, setOpenaiKey, googleKey, setGoogleKey, bananaKey, setBananaKey,
        ollamaBaseUrl, setOllamaBaseUrl, ollamaModel, setOllamaModel, ollamaCheck, setOllamaCheck, isInstallingOllamaModel,
        validationStatus, clearProviderValidation, validateProviderKey, handleCheckOllama, handleInstallOllamaModel,
    } = apiKeys;

    return (
        <>
            {/* 3D Generation Section */}
            <section className={`${modalSectionClass} xl:col-span-4`}>
                <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                    <Box size={16} className="text-primary" />
                    {t('settings.services.3d')}
                </h4>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {/* Meshy */}
                    <div className={fieldCardClass}>
                        <label className="text-xs font-semibold mb-1.5 block">Meshy AI</label>
                        <input
                            type="password"
                            value={meshyKey}
                            onChange={(e) => {
                                setMeshyKey(e.target.value);
                                clearProviderValidation('meshy');
                            }}
                            placeholder={t('settings.services.enterMeshyKey')}
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void validateProviderKey('meshy')}
                                className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                            >
                                {t('settings.services.validate')}
                            </button>
                            {validationStatus.meshy.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                            {validationStatus.meshy.message ? (
                                <span className={`text-[10px] ${validationStatus.meshy.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                    {validationStatus.meshy.message}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* Tripo */}
                    <div className={fieldCardClass}>
                        <label className="text-xs font-semibold mb-1.5 block">Tripo AI</label>
                        <input
                            type="password"
                            value={tripoKey}
                            onChange={(e) => {
                                setTripoKey(e.target.value);
                                clearProviderValidation('tripo');
                            }}
                            placeholder={t('settings.services.enterTripoKey')}
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void validateProviderKey('tripo')}
                                className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                            >
                                {t('settings.services.validate')}
                            </button>
                            {validationStatus.tripo.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                            {validationStatus.tripo.message ? (
                                <span className={`text-[10px] ${validationStatus.tripo.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                    {validationStatus.tripo.message}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* Hitem3D */}
                    <div className={`${fieldCardClass} lg:col-span-2 xl:col-span-1 2xl:col-span-2`}>
                        <div className="flex justify-between mb-1.5 items-center">
                            <label className="text-xs font-semibold">Hitem3D</label>
                            <div className="flex gap-2 text-[10px] bg-secondary rounded p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setHitemsMode('ak_sk')}
                                    className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'ak_sk' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    AK/SK
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHitemsMode('token')}
                                    className={`px-2 py-0.5 rounded transition-colors ${hitemsMode === 'token' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('settings.services.tokenMode')}
                                </button>
                            </div>
                        </div>

                        {hitemsMode === 'ak_sk' ? (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={hitemsAk}
                                    onChange={(e) => {
                                        setHitemsAk(e.target.value);
                                        clearProviderValidation('hitems');
                                    }}
                                    placeholder={t('settings.services.accessKey')}
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                                <input
                                    type="password"
                                    value={hitemsSk}
                                    onChange={(e) => {
                                        setHitemsSk(e.target.value);
                                        clearProviderValidation('hitems');
                                    }}
                                    placeholder={t('settings.services.secretKey')}
                                    className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                                />
                            </div>
                        ) : (
                            <input
                                type="password"
                                value={hitemsKey}
                                onChange={(e) => {
                                    setHitemsKey(e.target.value);
                                    clearProviderValidation('hitems');
                                }}
                                placeholder={t('settings.services.accessToken')}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                            />
                        )}

                        <input
                            type="text"
                            value={hitemsAppId}
                            onChange={(e) => {
                                setHitemsAppId(e.target.value);
                                clearProviderValidation('hitems');
                            }}
                            placeholder={t('settings.services.optionalAppid')}
                            className="mt-2 w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void validateProviderKey('hitems')}
                                className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                disabled={validationStatus.hitems.state === 'checking'}
                            >
                                {t('settings.services.validateSetup')}
                            </button>
                            {validationStatus.hitems.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                            {validationStatus.hitems.message ? (
                                <span className={`text-[10px] ${validationStatus.hitems.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                    {validationStatus.hitems.message}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
            </section>

            {/* Image Generation Config */}
            <section className={`${modalSectionClass} xl:col-span-8`}>
                <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                    <Cloud size={16} className="text-primary" />
                    {t('settings.services.imageVision')}
                </h4>

                <div className="grid gap-3 lg:grid-cols-2">
                    {/* Stability AI */}
                    <div className={fieldCardClass}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">Stability AI</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">SD3 / Core</span>
                        </div>
                        <input
                            type="password"
                            value={stabilityKey}
                            onChange={(e) => setStabilityKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                    </div>

                    {/* OpenAI */}
                    <div className={fieldCardClass}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">OpenAI</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">DALL-E 3</span>
                        </div>
                        <input
                            type="password"
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                    </div>

                    {/* Google Nano */}
                    <div className={fieldCardClass}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">Google Gemini / Vertex</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">Nano / Imagen</span>
                        </div>
                        <input
                            type="password"
                            value={googleKey}
                            onChange={(e) => {
                                setGoogleKey(e.target.value);
                                clearProviderValidation('google');
                            }}
                            placeholder={t('settings.services.enterApiKey')}
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void validateProviderKey('google')}
                                className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                            >
                                {t('settings.services.validate')}
                            </button>
                            {validationStatus.google.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                            {validationStatus.google.message ? (
                                <span className={`text-[10px] ${validationStatus.google.state === 'valid' ? 'text-green-500' : 'text-amber-500'}`}>
                                    {validationStatus.google.message}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* Banana.dev */}
                    <div className={fieldCardClass}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">Banana.dev</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">{t('settings.services.gpuCloud')}</span>
                        </div>
                        <input
                            type="password"
                            value={bananaKey}
                            onChange={(e) => setBananaKey(e.target.value)}
                            placeholder={t('settings.services.enterApiKey')}
                            className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                        />
                    </div>

                    <div className={`${fieldCardClass} lg:col-span-2`}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">{t('settings.services.localAiRuntime')}</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">{t('settings.services.local')}</span>
                        </div>
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={ollamaBaseUrl}
                                onChange={(event) => {
                                    setOllamaBaseUrl(event.target.value);
                                    setOllamaCheck({ state: 'idle', message: '', modelFound: undefined });
                                }}
                                placeholder={DEFAULT_OLLAMA_BASE_URL}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                            />
                            <input
                                type="text"
                                value={ollamaModel}
                                onChange={(event) => {
                                    setOllamaModel(event.target.value);
                                    setOllamaCheck({ state: 'idle', message: '', modelFound: undefined });
                                }}
                                placeholder={DEFAULT_OLLAMA_MODEL}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                            />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void handleCheckOllama()}
                                className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors"
                                disabled={ollamaCheck.state === 'checking' || isInstallingOllamaModel}
                            >
                                {t('settings.services.checkOllama')}
                            </button>
                            {ollamaCheck.modelFound === false ? (
                                <button
                                    type="button"
                                    onClick={() => void handleInstallOllamaModel()}
                                    className="h-7 px-2 rounded border border-border text-[11px] font-semibold hover:bg-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isInstallingOllamaModel || ollamaCheck.state === 'checking'}
                                >
                                    {isInstallingOllamaModel
                                        ? t('settings.services.installing')
                                        : t('settings.services.installModel', { model: ollamaModel.trim() || DEFAULT_OLLAMA_MODEL })}
                                </button>
                            ) : null}
                            {ollamaCheck.state === 'checking' ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                            {ollamaCheck.message ? (
                                <span className={`text-[10px] ${ollamaCheck.state === 'success' ? 'text-green-500' : 'text-amber-500'}`}>
                                    {ollamaCheck.message}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            {t('settings.services.localAiHint')}
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}

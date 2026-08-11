'use client';

import { ArrowUpWideNarrow } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { UPSCALE_PROVIDERS, getUpscaleProvider } from '@/lib/upscale/upscaleProviders';
import type { ApiKeysSettings } from '../hooks/useApiKeysSettings';
import { modalSectionClass, fieldCardClass } from '../settingsTypes';

interface UpscaleServicesSectionProps {
    apiKeys: ApiKeysSettings;
}

/**
 * Upscale service configuration: which service the Upscale tool defaults to,
 * its dials, and an API key per provider — each card carries the one-line
 * "best for" guidance so choosing a service doesn't require reading docs.
 */
export default function UpscaleServicesSection({ apiKeys }: UpscaleServicesSectionProps) {
    const { t } = useI18n();
    const {
        upscaleKeys, setUpscaleKey,
        upscalePreferences, setUpscalePreferences,
    } = apiKeys;

    const defaultProvider = getUpscaleProvider(upscalePreferences.defaultProvider) || UPSCALE_PROVIDERS[0];

    return (
        <section className={`${modalSectionClass} xl:col-span-12`}>
            <h4 className="font-semibold text-sm flex items-center gap-2 text-foreground/90 uppercase tracking-wider">
                <ArrowUpWideNarrow size={16} className="text-primary" />
                {t('settings.upscale.title')}
            </h4>

            <div className={fieldCardClass}>
                <label className="text-xs font-semibold mb-1.5 block">{t('settings.upscale.defaults')}</label>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={upscalePreferences.defaultProvider}
                        onChange={(event) => {
                            const provider = getUpscaleProvider(event.target.value) || UPSCALE_PROVIDERS[0];
                            setUpscalePreferences((current) => ({
                                ...current,
                                defaultProvider: provider.id,
                                defaultScale: provider.scales.includes(current.defaultScale) ? current.defaultScale : provider.scales[0],
                            }));
                        }}
                        aria-label={t('settings.upscale.defaultService')}
                        className="h-9 px-2 rounded-md bg-background border border-border text-xs outline-none focus:border-primary"
                    >
                        {UPSCALE_PROVIDERS.map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.name}</option>
                        ))}
                    </select>
                    <select
                        value={upscalePreferences.defaultScale}
                        onChange={(event) => setUpscalePreferences((current) => ({ ...current, defaultScale: Number(event.target.value) }))}
                        aria-label={t('settings.upscale.defaultScale')}
                        className="h-9 px-2 rounded-md bg-background border border-border text-xs outline-none focus:border-primary"
                    >
                        {defaultProvider.scales.map((scale) => (
                            <option key={scale} value={scale}>{scale}x</option>
                        ))}
                    </select>
                    {defaultProvider.supportsCreativity ? (
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {t('settings.upscale.creativity')}
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={upscalePreferences.creativity}
                                onChange={(event) => setUpscalePreferences((current) => ({ ...current, creativity: Number(event.target.value) }))}
                                className="w-32 accent-primary"
                            />
                            <span className="font-mono">{upscalePreferences.creativity.toFixed(2)}</span>
                        </label>
                    ) : null}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{t('settings.upscale.defaultsHint')}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 mt-3">
                {UPSCALE_PROVIDERS.map((provider) => (
                    <div key={provider.id} className={fieldCardClass}>
                        <div className="flex justify-between mb-1.5">
                            <label className="text-xs font-semibold">{provider.name}</label>
                            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 rounded">
                                {provider.scales.map((scale) => `${scale}x`).join(' / ')}
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-2">{t(provider.guidanceKey)}</p>
                        {provider.isLocal ? (
                            <p className="text-[10px] text-green-500">{t('settings.upscale.noKeyNeeded')}</p>
                        ) : provider.id === 'stability' ? (
                            <p className="text-[10px] text-muted-foreground">{t('settings.upscale.usesStabilityKey')}</p>
                        ) : (
                            <input
                                type="password"
                                value={upscaleKeys[provider.id] || ''}
                                onChange={(event) => setUpscaleKey(provider.id, event.target.value)}
                                placeholder={t('settings.services.enterApiKey')}
                                className="w-full h-9 px-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-xs font-mono placeholder:font-sans"
                            />
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

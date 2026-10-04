'use client';

import { useI18n } from '@/providers/I18nProvider';
import {
    OLLAMA_GENERATION_NOTE_KEY,
    OLLAMA_GENERATION_PROFILES,
    type OllamaGenerationProfileId,
} from '@/lib/ollamaGenerationProfiles';

interface OllamaQualityPickerProps {
    value: OllamaGenerationProfileId;
    onChange: (next: OllamaGenerationProfileId) => void;
}

/** Speed/detail choice for local generation, with what each option costs. */
export default function OllamaQualityPicker({ value, onChange }: OllamaQualityPickerProps) {
    const { t } = useI18n();
    return (
        <fieldset className="mt-3" data-testid="ollama-quality">
            <legend className="text-[11px] font-semibold">{t('ollamaProfile.label')}</legend>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
                {OLLAMA_GENERATION_PROFILES.map((profile) => (
                    <label
                        key={profile.id}
                        className={`cursor-pointer rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                            value === profile.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/50'
                        }`}
                    >
                        <input
                            type="radio"
                            name="ollama-quality"
                            value={profile.id}
                            checked={value === profile.id}
                            onChange={() => onChange(profile.id)}
                            className="sr-only"
                        />
                        <span className="block font-semibold">{t(profile.labelKey)}</span>
                        <span className="block text-muted-foreground">{t(profile.tradeoffKey)}</span>
                    </label>
                ))}
            </div>
            {/* Said before a run, not after a disappointing one. */}
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t(OLLAMA_GENERATION_NOTE_KEY)}</p>
        </fieldset>
    );
}

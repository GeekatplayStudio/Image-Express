# Multilanguage (i18n) Support

Image Express ships with a lightweight, dependency-free i18n layer. This
document explains how it works, how to translate UI strings as you touch
components, and how to add new languages.

## Overview

| Piece | Path | Purpose |
| --- | --- | --- |
| Types & language list | `src/lib/i18n/types.ts` | `LanguageCode`, `SUPPORTED_LANGUAGES`, defaults |
| Locale dictionaries | `src/lib/i18n/locales/<code>.ts` | Flat key → string maps per language |
| Runtime API | `src/lib/i18n/index.ts` | `translate()`, dictionary registry, storage key |
| React provider | `src/providers/I18nProvider.tsx` | `I18nProvider`, `useI18n()` hook |
| Top-bar picker | `src/components/LanguageSelector.tsx` | Globe dropdown in dashboard & editor headers |

Supported languages (initial set): English (`en`, base), Russian (`ru`),
Ukrainian (`uk`), Spanish (`es`), French (`fr`), German (`de`), Italian
(`it`), Portuguese (`pt`), Polish (`pl`), Simplified Chinese (`zh`),
Japanese (`ja`).

## How it behaves

- The user picks a language from the globe dropdown in the top bar
  (dashboard header and editor header). The choice is stored in
  `localStorage` under `image-express-language` and applied instantly —
  no reload needed.
- Server-side rendering always emits English; the stored preference is
  applied right after hydration, so there are no SSR/client mismatches.
- `<html lang>` is kept in sync with the active language.
- **Fallback chain**: active locale → English → the key itself. A missing
  translation can never produce a blank UI; at worst you see the English
  string, and a missing *key* shows the key so it's easy to spot in QA.

## Using translations in a component

```tsx
'use client';
import { useI18n } from '@/providers/I18nProvider';

export default function MyPanel() {
    const { t } = useI18n();
    return <button title={t('common.close')}>{t('common.save')}</button>;
}
```

Outside React (rare — utilities, non-component code), use the pure
function:

```ts
import { translate } from '@/lib/i18n';
const label = translate('de', 'common.close'); // "Schließen"
```

## Key conventions

- Keys are flat, dot-namespaced strings: `"<area>.<name>"`.
  Current areas: `common`, `auth`, `dashboard`, `editor`, `settings`,
  `assets`. Add new areas as needed (e.g. `wizard.*`, `profile.*`).
- **English (`en.ts`) is the source of truth.** Every key MUST exist in
  `en.ts`. Other locales may lag behind — they fall back to English.
- Prefer reusing `common.*` keys (`common.close`, `common.cancel`, …)
  over minting per-screen duplicates.
- Keep the *meaning* in the key name, not the English wording, so
  translations can diverge in phrasing without renaming keys.

## Adding a new string

1. Add the key + English text to `src/lib/i18n/locales/en.ts`.
2. Replace the hard-coded string in the component with `t('your.key')`.
3. (Ideal) Add translations to the other locale files. If you skip this,
   the UI shows English for those languages until someone translates it.

## Adding a new language

1. Add the entry to `SUPPORTED_LANGUAGES` in `src/lib/i18n/types.ts`
   (code, English label, native label).
2. Create `src/lib/i18n/locales/<code>.ts` exporting a
   `LocaleDictionary` (copy `en.ts` and translate; partial is fine).
3. Register it in the `DICTIONARIES` map in `src/lib/i18n/index.ts`.

That's it — the language automatically appears in the top-bar dropdown.

## Migration policy

The app has many legacy hard-coded strings. The agreed approach is
**incremental**: whenever a component/window is being reworked for any
reason, move its user-visible strings to the dictionary at the same
time. Do not do a big-bang translation pass.

Track coverage with `node scripts/i18n-progress.mjs`; `npm run audit:i18n`
lists every remaining string by file and fails the build while any are
left. Fully converted so far: dashboard hub (header, categories, footer),
editor top menus, Login, Setup Wizard, Asset Library, Admin Area, colour
wheel, retouch and Comfy panels, the whole Settings → Workspace folder,
the Services tab, and the 3D view editor. Largest remaining files are the
AI generator modals (`ImageGeneratorModal`, `AICritiqueModal`),
`editorViewConfig.ts` and the paint/gradient tool-option bars.

Shared copy gets its own area rather than being duplicated per panel:
`pack.*` holds the zip install/remove flow used by both interface themes
and dashboard ambience, and `common.*` holds the generic verbs. Reuse
before minting a near-duplicate key.

Two escape hatches exist for text that must not be translated: a
`// i18n-ignore` comment on the same line (proper nouns, stored
identifiers used as placeholder examples), or `// i18n-ignore-file` at the
top of a file. Prefer teaching `scripts/i18n-scan.mjs` a general rule when
the exemption is a whole category (URLs, emails, hostnames) rather than
sprinkling per-line comments.

## Testing notes

- `translate()` is pure and trivially unit-testable
  (`expect(translate('ru', 'common.close')).toBe('Закрыть')`).
- Components under test that call `useI18n()` work without any mock —
  the default context returns English strings.
- When asserting on UI text in Jest, prefer querying by role/aria-label
  where possible so tests survive translation churn.

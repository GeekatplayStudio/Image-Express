import type { Metadata } from "next";
import Script from 'next/script';
import "./globals.css";
import "./ui-theme.css";
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import '@fontsource/pacifico/400.css';

export const metadata: Metadata = {
  title: "Image Express - AI Design Studio",
  description: "Advanced content creation platform with AI-powered 3D generation, templates, and professional design tools.",
  icons: {
    icon: "/icon.svg"
  }
};

import { DialogProvider } from "@/providers/DialogProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { I18nProvider } from "@/providers/I18nProvider";
import ThemePreferenceSync from '@/components/ThemePreferenceSync';
import UiThemeSync from '@/components/UiThemeSync';
import UpdateAutoCheck from '@/components/UpdateAutoCheck';
import SpriteTheater from '@/components/SpriteTheater';
import SupportCorner from '@/components/SupportCorner';
import { buildUiThemeInitScript } from '@/lib/ui-themes-shared';
import RangeResetListener from "@/components/ui/RangeResetListener";
import { buildRuntimePerformanceShimSource } from '@/lib/runtimePerformanceShim';
import {
  buildThemePreferencesInitScript,
  DEFAULT_THEME_PREFERENCES,
  DEFAULT_THEME_RESOLVED_MODE,
} from '@/lib/themePreferences';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const performanceShimSource = buildRuntimePerformanceShimSource();
  const themePreferenceInitScript = buildThemePreferencesInitScript();
  const uiThemeInitScript = buildUiThemeInitScript();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme-mode={DEFAULT_THEME_RESOLVED_MODE}
      data-theme-mode-preference={DEFAULT_THEME_PREFERENCES.mode}
      data-theme-accent={DEFAULT_THEME_PREFERENCES.accentPreset}
      style={{ colorScheme: DEFAULT_THEME_RESOLVED_MODE }}
    >
      <head>
        <Script
          id="runtime-performance-shim"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: performanceShimSource }}
        />
        <Script
          id="theme-preferences-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themePreferenceInitScript }}
        />
        <Script
          id="ui-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: uiThemeInitScript }}
        />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <I18nProvider>
          <DialogProvider>
            <ToastProvider>
              <ThemePreferenceSync />
              <UiThemeSync />
              <UpdateAutoCheck />
              <RangeResetListener />
              {children}
              <div className="ui-theme-overlay" aria-hidden="true" />
              <SpriteTheater />
              <SupportCorner />
            </ToastProvider>
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

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
import ThemePreferenceSync from '@/components/ThemePreferenceSync';
import RangeResetListener from "@/components/ui/RangeResetListener";
import { buildRuntimePerformanceShimSource } from '@/lib/runtimePerformanceShim';
import { buildThemePreferencesInitScript } from '@/lib/themePreferences';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const performanceShimSource = buildRuntimePerformanceShimSource();
  const themePreferenceInitScript = buildThemePreferencesInitScript();

  return (
    <html lang="en">
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
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <DialogProvider>
          <ToastProvider>
            <ThemePreferenceSync />
            <RangeResetListener />
            {children}
          </ToastProvider>
        </DialogProvider>
      </body>
    </html>
  );
}

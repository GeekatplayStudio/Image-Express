import type { Metadata } from "next";
import "./globals.css";
import "./ui-theme.css";

export const metadata: Metadata = {
  title: "Image Express - AI Design Studio",
  description: "Advanced content creation platform with AI-powered 3D generation, templates, and professional design tools.",
  icons: {
    icon: "/icon.svg"
  }
};

import { DialogProvider } from "@/providers/DialogProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import RangeResetListener from "@/components/ui/RangeResetListener";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <DialogProvider>
          <ToastProvider>
            <RangeResetListener />
            {children}
          </ToastProvider>
        </DialogProvider>
      </body>
    </html>
  );
}

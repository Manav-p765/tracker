import type { Metadata, Viewport } from "next";

import "./globals.css";

import { Providers } from "@/components/providers/Providers";
import { fontVariables } from "@/lib/fonts";
import { SentryInit } from "@/lib/sentry";
import { PAPER_DAY, PAPER_NIGHT } from "@/lib/theme-color";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "tracker",
  description: "A dot-grid journal for goals, habits and the daily check-in.",
  applicationName: "tracker",
  appleWebApp: {
    capable: true,
    title: "tracker",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Phone-first, but never block a user from zooming.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER_DAY },
    { media: "(prefers-color-scheme: dark)", color: PAPER_NIGHT },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint so night paper never flashes bone. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="dot-grid min-h-dvh antialiased">
        <Providers>
          <SentryInit />
          {children}
        </Providers>
      </body>
    </html>
  );
}

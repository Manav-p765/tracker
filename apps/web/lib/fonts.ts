import { Fraunces, Inter, Space_Mono } from "next/font/google";

/**
 * Typography (DESIGN.md §3). Self-hosted by next/font at build time — no font
 * CDN at runtime, and the service worker caches the emitted files.
 *
 * Two weights maximum per family. Fraunces and Inter are variable fonts, so the
 * weight range is loaded once and the *usage* is restricted to 400/600 and
 * 400/500 respectively — see the font-weight rules in the components.
 */

/** Editorial serif — screen titles, project titles, section heads. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK"],
});

/** Labels, dates, file tags, and every number in the app. */
export const spaceMono = Space_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-mono",
  weight: ["400", "700"],
});

/** Body and UI. */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const fontVariables = `${fraunces.variable} ${spaceMono.variable} ${inter.variable}`;

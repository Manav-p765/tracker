/**
 * The one documented exception to "hex values live only in tokens.css".
 *
 * The Web App Manifest is JSON and <meta name="theme-color"> is read by the OS
 * before any stylesheet is parsed, so neither can resolve a CSS custom property.
 * Keep these in sync with --paper in styles/tokens.css — DESIGN.md §2.
 */
export const PAPER_DAY = "#E8E2D2";
export const PAPER_NIGHT = "#1E1B17";

/**
 * The one documented exception to "hex values live only in tokens.css".
 *
 * The Web App Manifest is JSON and <meta name="theme-color"> is read by the OS
 * before any stylesheet is parsed, so neither can resolve a CSS custom property.
 * Keep these two in sync with --paper (day) and --paper (night) in
 * styles/tokens.css — DESIGN.md §2.
 */
export const PAPER_DAY = "#F0EDE3";
export const PAPER_NIGHT = "#1E1C18";

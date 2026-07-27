import type { Config } from "tailwindcss";

/**
 * Tailwind is the delivery mechanism for styles/tokens.css — every value below
 * is a var() reference, so a token change flows everywhere and night paper needs
 * no `dark:` variants (the vars flip themselves, DESIGN.md §2).
 *
 * Consequence to know: because the colour tokens are hex strings inside vars,
 * Tailwind's slash-opacity syntax (bg-sage/40) will not work. Use the *-wash
 * tokens instead — that is what they exist for.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        card: "var(--card)",
        dot: "var(--dot)",
        rule: "var(--rule)",
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
        },
        sage: { DEFAULT: "var(--sage)", wash: "var(--sage-wash)" },
        clay: { DEFAULT: "var(--clay)", wash: "var(--clay-wash)" },
        powder: { DEFAULT: "var(--powder)", wash: "var(--powder-wash)" },
        ochre: { DEFAULT: "var(--ochre)", wash: "var(--ochre-wash)" },
        lilac: { DEFAULT: "var(--lilac)", wash: "var(--lilac-wash)" },
      },
      fontFamily: {
        // Fraunces — editorial serif, headings only.
        heading: "var(--font-heading)",
        // Space Mono — labels, dates, file tags, and EVERY number in the app.
        mono: "var(--font-mono)",
        // Inter — body and UI.
        sans: "var(--font-body)",
      },
      fontSize: {
        // The mono file-tag eyebrow (DESIGN.md §4).
        tag: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.08em" }],
        // Axis ticks, weekday initials, grid headers.
        micro: ["0.625rem", { lineHeight: "1", letterSpacing: "0.06em" }],
      },
      /**
       * Everything spaces on the dot-grid pitch so content sits on the paper.
       * dot = 16px, dot-2 = 32px, dot-3 = 48px …
       */
      spacing: {
        dot: "var(--dot-gap)",
        "dot-2": "calc(var(--dot-gap) * 2)",
        "dot-3": "calc(var(--dot-gap) * 3)",
        "dot-4": "calc(var(--dot-gap) * 4)",
        "dot-6": "calc(var(--dot-gap) * 6)",
        // A tap target that clears the 44px minimum on the same rhythm.
        tap: "calc(var(--dot-gap) * 3 - 4px)",
      },
      borderRadius: {
        paper: "var(--radius)",
      },
      borderWidth: {
        hair: "var(--stroke-hair)",
      },
      strokeWidth: {
        hair: "var(--stroke-hair)",
        ink: "var(--stroke-ink)",
      },
      maxWidth: {
        content: "var(--content-max)",
      },
      backgroundImage: {
        // The dot-grid paper itself. Applied via .dot-grid in globals.css.
        "dot-grid": "radial-gradient(var(--dot) var(--dot-size), transparent 0)",
      },
      backgroundSize: {
        "dot-grid": "var(--dot-gap) var(--dot-gap)",
      },
      transitionDuration: {
        // The only motion the design permits (DESIGN.md §8).
        ink: "150ms",
      },
    },
  },
  plugins: [],
};

export default config;

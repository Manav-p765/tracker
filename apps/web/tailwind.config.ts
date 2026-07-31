import type { Config } from "tailwindcss";

/**
 * Tailwind is the delivery mechanism for styles/tokens.css — every value below is
 * a var() reference, so a token change flows everywhere and night paper needs NO
 * `dark:` variants: the vars flip themselves under [data-theme] (DESIGN.md §2).
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
        rule: "var(--rule)",
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
        },
        // The inverted surface, for the hero card.
        dark: {
          DEFAULT: "var(--dark)",
          ink: "var(--dark-ink)",
          rule: "var(--dark-rule)",
        },
        sage: { DEFAULT: "var(--sage)", wash: "var(--sage-wash)" },
        clay: { DEFAULT: "var(--clay)", wash: "var(--clay-wash)" },
        powder: { DEFAULT: "var(--powder)", wash: "var(--powder-wash)" },
        ochre: { DEFAULT: "var(--ochre)", wash: "var(--ochre-wash)" },
        lilac: { DEFAULT: "var(--lilac)", wash: "var(--lilac-wash)" },
      },
      fontFamily: {
        // Fraunces — editorial serif, headings and the oversized numerals.
        heading: "var(--font-heading)",
        // Space Mono — labels, dates, card tags, and EVERY number in the app.
        mono: "var(--font-mono)",
        // Inter — body and UI.
        sans: "var(--font-body)",
      },
      fontSize: {
        // The mono card tag / eyebrow (DESIGN.md §4).
        tag: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.08em" }],
        // Axis ticks, weekday initials, grid headers.
        micro: ["0.625rem", { lineHeight: "1", letterSpacing: "0.06em" }],
      },
      /**
       * The base spacing scale. unit = 16px, unit-2 = 32px, unit-3 = 48px …
       * Formerly named for the dot-grid pitch; the grid is gone, the rhythm stays.
       */
      spacing: {
        unit: "var(--rhythm)",
        "unit-2": "calc(var(--rhythm) * 2)",
        "unit-3": "calc(var(--rhythm) * 3)",
        "unit-4": "calc(var(--rhythm) * 4)",
        "unit-6": "calc(var(--rhythm) * 6)",
        // A tap target that clears the 44px minimum on the same rhythm.
        tap: "calc(var(--rhythm) * 3 - 4px)",
        bento: "var(--bento-gap)",
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
      gap: {
        bento: "var(--bento-gap)",
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

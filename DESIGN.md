# DESIGN.md

> Source of truth for **how this app looks and feels**. Re-read this + `SCOPE.md` +
> `ARCHITECTURE.md` at the start of every session. These decisions are settled. Every visual value
> lives in the token layer (§2) — components consume tokens, never raw hex.

---

## 1. Direction

**Editorial-archival spine + rare pixel accents, on calm bone dot-grid paper.**

Muted, grown-up, personal. It should feel like a well-kept paper journal and a card catalogue —
not a product. Never a slick SaaS dashboard. Never a loud game.

Three ideas, in priority order:

1. **Paper first.** A bone dot-grid sheet is the substrate of every screen. Content sits on the
   grid.
2. **Editorial-archival structure.** Serif headings, mono file tags, folder tabs, hairline rules.
   The organizing logic of an archive, applied to a life.
3. **Pixel accents as a wink.** Tiny pixel glyphs and one small pixel vignette. Rare by design —
   if they show up more than a couple of times per screen, they've been overused.

There is **no single primary accent color.** Five dusty pastels do the color-coding my multicolor
journal pens did. They coordinate; none dominates.

---

## 2. Palette & tokens

Defined once in `apps/web/styles/tokens.css`, exposed through `tailwind.config.ts`
`theme.extend`. **Never hardcode a hex in a component.**

### Day paper (default)

```css
:root {
  /* paper */
  --paper:        #F0EDE3;  /* page background — bone/cream */
  --card:         #E4DFD2;  /* cards, folder tabs, sunken cells — soft oat */
  --dot:          #D6D0C0;  /* dot-grid dot */
  --rule:         #DCD6C7;  /* hairline rule */

  /* ink */
  --ink:          #33302A;  /* primary text, X marks, chart axis */
  --ink-muted:    #6B6659;  /* labels, mono file tags, axis ticks */

  /* accent pastels — dusty, desaturated, coordinated. No primary. */
  --sage:         #A3B18A;
  --clay:         #D9A08C;  /* muted coral */
  --powder:       #9DB4C0;  /* powder blue */
  --ochre:        #E0C79A;  /* buttercream */
  --lilac:        #B3A6C4;  /* dusty lilac */

  /* pastel washes — same hues at low opacity, for fills and heatmap steps */
  --sage-wash:    #A3B18A26;
  --clay-wash:    #D9A08C26;
  --powder-wash:  #9DB4C026;
  --ochre-wash:   #E0C79A26;
  --lilac-wash:   #B3A6C426;

  /* geometry */
  --dot-gap:      16px;     /* dot-grid pitch — the app's base rhythm unit */
  --dot-size:     1px;
  --stroke-hair:  1px;
  --stroke-ink:   1.75px;   /* chart lines, X marks */
  --radius:       3px;      /* paper barely rounds */
  --radius-tab:   6px 6px 0 0;
}
```

### Night paper (dark mode)

Same hues, inverted substrate — a warm charcoal sheet, never blue-black, never pure `#000`.
Pastels stay identical in hue and get a small luminance lift so they hold on the dark ground.

```css
:root[data-theme="dark"] {
  --paper:        #1E1C18;
  --card:         #282520;
  --dot:          #3A362F;
  --rule:         #383430;
  --ink:          #E8E4D9;
  --ink-muted:    #9A9486;
  --sage:         #B2C09A;
  --clay:         #E2AE9B;
  --powder:       #AAC0CC;
  --ochre:        #E8D2AA;
  --lilac:        #C0B4D0;
  /* washes go to 0x33 alpha in dark for equivalent presence */
}
```

Implement with `@media (prefers-color-scheme: dark)` as the default signal **plus** a
`:root[data-theme]` override so an explicit user toggle wins in both directions.

### Semantic assignments — fixed, apply everywhere

| Meaning | Token |
|---|---|
| Daily horizon | `--sage` |
| Weekly horizon | `--powder` |
| Monthly horizon | `--clay` |
| Yearly horizon | `--ochre` |
| Long-term horizon | `--lilac` |
| Mood line (history chart) | `--sage` |
| Energy line | `--clay` |
| Sleep line | `--powder` |
| Overdue / needs attention | `--clay` at full strength + a mono label |
| Today's marker | `--ochre` |

**Rule:** pastels are for fills, strokes, tabs, dots, and washes — **never for body text**. They
do not meet contrast on bone paper. Text is always `--ink` or `--ink-muted`.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Headings | **Fraunces** (fallback Instrument Serif) | Editorial serif. Screen titles, project titles, section heads |
| Labels / data / dates / file tags | **Space Mono** (fallback JetBrains Mono) | All numbers, dates, streaks, axis ticks, mono eyebrows |
| Body / UI | **Inter** | Paragraphs, buttons, form fields, list rows |

- **Two weights maximum per family.** Fraunces 400/600 · Space Mono 400/700 · Inter 400/500.
- Self-host via `next/font` with `display: swap`. No external font CDN.
- Every number in the app is mono. No exceptions — that's the journal-page feel.
- Mono file tags are uppercase with tracking (`letter-spacing: 0.08em`) at ~11–12px.
- Body 16px minimum on mobile. Line height 1.55 for prose, 1.2 for headings.

---

## 4. Structural devices

### Dot-grid paper
The page background, on every screen:

```css
background-color: var(--paper);
background-image: radial-gradient(var(--dot) var(--dot-size), transparent 0);
background-size: var(--dot-gap) var(--dot-gap);
```

All vertical spacing is a multiple of `--dot-gap` (16 / 32 / 48) so content sits on the grid.
Cards (`--card`) sit on top as opaque oat panels; the dots do not show through them.

### Mono "file tag" eyebrows
Small uppercase mono labels above a section: `DAILY //` · `WEEK 04 //` · `PROJECT · JP //`.

- **Section headers only.** Not on rows, not on buttons, not on cards, not on empty states.
- Color `--ink-muted`. The trailing ` //` is part of the device.
- At most **two per screen.** This is the single easiest thing to overuse — if a third one wants
  to exist, the screen needs restructuring instead.

### Hairline rules
Prefer a 1px `--rule` divider over a bordered card wherever a boundary is all that's needed. No
drop shadows anywhere in the app. Elevation is expressed by the oat `--card` fill alone.

### Folder tabs *(learning projects)*
See §5.

---

## 5. Archival folder-tab component *(learning projects)*

Learning projects are presented as archival **file folders**, recolored into the bone/oat + pastel
system so the device feels native rather than bolted-on.

- Each project is a **folder**: an oat (`--card`) panel with a small tab protruding from its top
  edge, offset horizontally so a list of projects reads as a stack of files in a drawer.
- The tab carries the project title in Fraunces, plus a mono file tag (e.g. `PROJECT · JP //`).
- Tab fill is the project's assigned pastel at wash strength, with a `--stroke-hair` `--rule`
  border and `--radius-tab` on the top corners only. The tab's pastel is the project's identity
  color and repeats on its progress rule and its milestone ticks.
- Pastels are assigned round-robin from the five in §2 on project creation, stored on the
  project so the color is stable.
- Tab offsets cycle across a few positions so a stack looks hand-filed, not tabulated.
- Open project = the folder expands in place / routes to a detail sheet that keeps the same tab at
  the top, so you never lose which file you're in.
- Progress shows as a **thin hairline rule filled in the project's pastel** — never a rounded
  progress bar, never a percentage ring.
- No paper-texture images, no skeuomorphic drop shadows or curled corners. The folder reads
  through geometry and color only.

---

## 6. Data display

### History centerpiece — hand-plotted multicolor line chart
Modeled on a real bullet-journal vitals page. This is the payoff screen.

- **Mood, energy, and sleep** as overlaid **thin jagged polylines** — `--sage`, `--clay`,
  `--powder` respectively, at `--stroke-ink`.
- Hand-rolled inline SVG `<polyline>`. **No charting library.**
- `stroke-linejoin: miter`. **No curve smoothing, no area fills, no gradients, no shadows.**
- Missing days **break the line** — render one polyline per run of consecutive days rather than
  interpolating across a gap. Gaps are honest.
- No gridlines of its own; the page's dot grid shows through as the graph paper.
- Axis ticks in mono `--ink-muted`. A small **color key** beneath the chart: a pastel square plus
  a mono label per series.
- Data points are bare vertices — no dots, unless a day is tapped.

### Mood color key (logging + display)
Mood is logged and displayed through a **labeled pastel-square legend** — the color-coding my
journal pens did.

| Label | Value | Token |
|---|---|---|
| ROUGH | 1–2 | `--lilac` |
| LOW | 3–4 | `--powder` |
| STEADY | 5–6 | `--ochre` |
| GOOD | 7–8 | `--sage` |
| GREAT | 9–10 | `--clay` |

- Five squares in a row, each `--dot-gap * 2`, with its mono label beneath. Tap to log.
- Selected square gets a `--stroke-ink` `--ink` border — the selection is drawn in ink, not by
  changing the pastel.
- Energy uses the identical control with its own labels (`DRAINED → CHARGED`).
- The same legend renders read-only in month views, so the squares mean one thing everywhere.

### Habit X-mark grid
- A cell is a `--dot-gap * 2` square with a `--stroke-hair` `--rule` border and `--radius`.
- Done = a small **pixel X glyph** in the habit's pastel (§7), not a font glyph and not a checkbox
  tick.
- Empty cells stay genuinely empty — no gray fill, no placeholder.
- Habits as rows, days as columns. Today's column is marked with an `--ochre` cap rule.
- Tap toggles, optimistically. Column and row headers in mono.

### Habit heatmap (monthly)
- One habit, a month of cells, density in the habit's own pastel at stepped alpha:
  `0 / 0.2 / 0.45 / 0.7 / 1`.
- Single-hue steps only. **Never a multi-hue ramp**, never green-to-red.
- Weekday initials and week numbers in mono `--ink-muted`.

---

## 7. Pixel accents

In — but **rare**, and always drawn from the pastel palette.

Permitted, and nowhere else:
1. **Habit-grid marks** — the X is a tiny pixel glyph; a handful of habit glyphs (a book, a drop,
   a shoe) as 8×8 or 12×12 pixel icons.
2. **One calm pixel vignette** on the home header, and the same family of vignette on empty
   states — a small, soft, quiet-place-style sage scene.

Rules:
- Inline SVG with `shape-rendering: crispEdges`, or a sprite. Sized to whole multiples of the
  pixel unit so nothing blurs. No PNG upscaling.
- Pastels only, at most 3 colors per glyph, plus `--ink` for outlines.
- **Never** in navigation, buttons, form fields, charts, folder tabs, or notifications.
- The vignette is small (≤ 96px tall on the header) and silent. It's a wink, not a theme.
- If a screen has a vignette, it has exactly one.

---

## 8. Layout, motion, accessibility

- **Phone-first, one-handed.** Primary actions sit in the thumb arc at the bottom. Create/edit
  flows are bottom sheets, not full-page forms or centered modals.
- Tap targets ≥ 44px. Spacing on the `--dot-gap` scale. Single-column at mobile widths; a
  comfortable max-width (~720px) centered on larger screens — no multi-column dashboards.
- **Motion is almost absent.** Ink appears; it does not bounce, slide, or spring. Permitted: a
  ≤150ms opacity fade, and the folder expand. No skeleton shimmer — use a quiet mono "…" instead.
  Honor `prefers-reduced-motion` by removing what little there is.
- Contrast: body text ≥ 4.5:1 (`--ink` on `--paper` clears 10:1; `--ink-muted` clears 4.5:1).
  Pastels never carry text or meaning alone — always paired with a mono label, so the horizon and
  mood coding stays readable for colorblind users.
- Visible focus rings drawn in `--ink`, never removed.
- Empty states are written as journal prompts ("Nothing logged yet — start with tonight."), never
  marketing copy, never an illustration-plus-CTA sales block.

---

## 9. Do not

- No drop shadows, glassmorphism, gradients, glows, or neon.
- No candy or saturated color. If a pastel looks bright, it's wrong — keep it dusty.
- No single dominant accent color, and no accent introduced outside the five pastels.
- No charting library, no smoothed or filled charts, no donut/pie charts, no gauges.
- No rounded pill progress bars or percentage rings.
- No badges, medals, trophies, flames, confetti, or streak celebration of any kind
  (`SCOPE.md` §6).
- No mono file tags outside section headers; no pixel art outside the two permitted uses.
- No paper-texture or noise image overlays — the dot grid is the texture.
- No emoji as UI (mood is pastel squares, not faces).

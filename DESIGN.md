# DESIGN.md

> Source of truth for **how this app looks and feels**. Re-read this + `SCOPE.md` +
> `ARCHITECTURE.md` at the start of every session. These decisions are settled. Every visual value
> lives in the token layer (§2) — components consume tokens, never raw hex.

---

## 1. Direction

**Editorial-archival spine + rare pixel accents, on plain warm paper.**

Muted, grown-up, personal. It should feel like a well-kept paper journal and a card catalogue —
not a product. Never a slick SaaS dashboard. Never a loud game.

Three ideas, in priority order:

1. **Paper first.** A plain warm sheet is the substrate of every screen.
2. **Editorial-archival structure.** Serif headings, mono tags, folder tabs, hairline rules.
   The organizing logic of an archive, applied to a life.
3. **Pixel accents as a wink.** Tiny pixel glyphs and one small pixel vignette. Rare by design —
   if they show up more than a couple of times per screen, they've been overused.

> **The dot grid was dropped.** Earlier revisions used a radial-dot substrate on every screen. It
> is gone — there is no dot pattern anywhere, in either theme, and no `--dot` / `--dot-size` token.
> The 16px rhythm it established survives as `--rhythm`, which is still what all spacing is a
> multiple of.

There is **no single primary accent color.** Five accents do the color-coding my multicolor journal
pens did. They coordinate; none dominates.

---

## 2. Palette & tokens

Defined once in `apps/web/styles/tokens.css`, exposed through `tailwind.config.ts`
`theme.extend`. **Never hardcode a hex in a component.**

Colour is **theme-aware**, and this is the load-bearing decision: the two themes are not one
palette lightened and darkened. Pastels that glow on dark paper wash out to nothing on light
paper, so **day paper takes bold saturated accents and night paper keeps the soft glowing ones.**
The hue families and their meanings stay fixed across both.

### Day paper (default) — deeper warm stock, bold accents

```css
:root {
  /* paper — plain warm stock, no pattern */
  --paper:        #E8E2D2;
  --card:         #F2EEE4;
  --rule:         #CDC5B2;

  /* ink */
  --ink:          #2E2B24;
  --ink-muted:    #736C5C;

  /* the inverted surface, for the hero card */
  --dark:         #2E2B24;
  --dark-ink:     #F2EEE4;
  --dark-rule:    #4A463C;  /* hairlines and meter tracks ON the dark card */

  /* accents — bold and saturated, so they hold against warm paper */
  --sage:         #6F8A55;
  --clay:         #C06A48;
  --powder:       #5E8CA0;
  --ochre:        #CF9E42;
  --lilac:        #8B7BA8;

  /* washes — opaque tinted card fills, so text stays legible on them */
  --sage-wash:    #D3DEC0;
  --clay-wash:    #EDD3C6;
  --powder-wash:  #CFE0E6;
  --ochre-wash:   #EFE1C0;
  --lilac-wash:   #DED6E6;

  /* geometry */
  --rhythm:       16px;     /* the app's base spacing unit */
  --stroke-hair:  1px;
  --stroke-ink:   1.75px;   /* chart lines, X marks */
  --radius:       3px;      /* paper barely rounds */
  --radius-tab:   6px 6px 0 0;
  --bento-gap:    11px;     /* the home dashboard's grid gap */
}
```

### Night paper — warm dark stock, soft glowing pastels

Never blue-black, never pure `#000`. The accents revert to the dusty pastels; the bold day accents
would shout on this ground.

```css
:root[data-theme="dark"] {
  --paper:        #1E1B17;
  --card:         #2A2620;
  --rule:         #3A352C;
  --ink:          #EDE7DA;
  --ink-muted:    #A49B8B;
  --dark:         #100E0B;
  --dark-ink:     #EDE7DA;
  --dark-rule:    #332F27;
  --sage:         #A3B18A;
  --clay:         #D9A08C;
  --powder:       #9DB4C0;
  --ochre:        #E0C79A;
  --lilac:        #B3A6C4;
  /* washes are dark tinted fills, not alpha overlays */
  --sage-wash:    #2C3327;
  --clay-wash:    #382C27;
  --powder-wash:  #26313A;
  --ochre-wash:   #3A3324;
  --lilac-wash:   #302B38;
}
```

Implement with `@media (prefers-color-scheme: dark)` as the default signal **plus** a
`:root[data-theme]` override so an explicit user toggle wins in both directions.

**No `dark:` Tailwind variants anywhere.** The vars flip themselves under `[data-theme]`, so a
component written once is correct in both themes. A `dark:` class in this codebase is a bug.

### Semantic assignments — fixed, apply everywhere

| Meaning | Token |
|---|---|
| Daily horizon | `--sage` |
| Weekly horizon | `--powder` |
| Monthly horizon | `--clay` |
| Yearly horizon | `--ochre` |
| Long-term horizon | `--lilac` |
| Mood series (history chart) | `--sage` |
| Habits-per-day series | `--ochre` |
| Tasks-per-day series | `--lilac` |
| Habit heatmap density | `--ochre` |
| Energy series | `--clay` |
| Sleep series | `--powder` |
| Overdue / needs attention | `--clay` at full strength + a mono label |
| Today's marker | `--ochre` |

**Rule:** accents are for fills, strokes, tabs, meters, and washes — **never for body text**. Text
is always `--ink` or `--ink-muted`, or `--dark-ink` on the inverted hero card.

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

### Plain warm paper
The page background, on every screen: `background-color: var(--paper)` and nothing else. No
pattern, no texture image, no radial dots — **the dot grid was removed**. Cards (`--card`, or a
wash) sit on top as opaque panels.

All vertical spacing is a multiple of `--rhythm` (16 / 32 / 48). The grid is gone; the rhythm it
taught is not.

### Mono tag eyebrows
Small uppercase mono labels: `DAILY //` · `WEEK 04 //` · `PROJECT · JP //`.

- Color `--ink-muted`. The trailing ` //` is part of the device.
- **On a normal screen: section headers only, at most two.** Not on rows, not on buttons, not on
  empty states. This is the single easiest thing to overuse.
- **On the bento dashboard (§5a): one per card.** There the tag is the card's title — it is what
  makes a grid of panels legible at a glance — so the two-per-screen cap does not apply. That is
  the only exception, and it exists because the cards *are* the sections.

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

## 5a. The bento dashboard *(home / Today)*

Home is a **dashboard**, not a single column: a bento grid of summary cards that tap through to
their full screens. It answers "where am I today" at a glance and gets out of the way.

- **6-column grid on phone**, `grid-auto-flow: dense`, `gap: var(--bento-gap)` (11px). Cards
  declare a span; dense flow backfills the holes so there are no ragged gaps.
- **One mono tag per card**, which is that card's title (§4).
- **Card treatments**, each carrying meaning rather than decoration:
  - the **hero** is the inverted surface — `--dark` ground, `--dark-ink` text, ochre accents. It is
    the only card on the screen you act on at length, and the inversion says so.
  - **wash cards** take a `*-wash` fill matching their subject's accent (goals → clay, mood →
    sage, project → powder, event → ochre, streak → lilac).
  - **dashed outline** marks a card whose content is a live grid rather than a summary.
- **Graphic devices**, all from palette vars: a corner arrow on cards that navigate, segmented
  bar-meters, a barcode strip, mono index numbers (`01 — A`), and oversized Fraunces numerals for
  the one number a card is about.
- **Interaction rule.** Cards are summaries and navigate. The exceptions are stated on the card:
  the hero's goal rows and the habit grid tick **inline**, optimistically.
- **Every card owns its own state.** Loading is a card-shaped skeleton (no shimmer — §8), empty is
  a calm sentence with a tap-through, and a failed fetch degrades **that card only**, with a
  `// couldn't load` line and a retry. One dead endpoint must never take down the grid.
- **Unbuilt features appear as honest stubs**: correct treatment, correct tag, and a `// SOON`
  mono note. Never fabricated numbers, never a card that looks broken.

---

## 6. Data display

### History centerpiece — hand-plotted month chart
Modeled on a real bullet-journal vitals page. This is the payoff screen.

**One chart, one series at a time**, chosen with a small mono segmented control
(`SERIES: HABITS · SLEEP · TASKS · MOOD · ENERGY`). An earlier revision overlaid mood, energy and
sleep on one axis; that does not survive contact with the data — five jagged lines at a month's
resolution is noise, and the series have incompatible scales (24 hours against 5 mood points).

| Series | Token | Y range |
|---|---|---|
| Habits completed / day *(default)* | `--ochre` | 0 → the month's max |
| Sleep hours | `--powder` | 0 → 24, fixed |
| Tasks (goals) completed / day | `--lilac` | 0 → the month's max |
| Mood | `--sage` | 1 → 5, fixed |
| Energy | `--clay` | 1 → 5, fixed |

The bounded series keep fixed axes so months stay comparable; the counted ones scale to their
data, since there is no natural ceiling on how many habits a day can hold.

- Hand-rolled inline SVG `<polyline>`. **No charting library.**
- `stroke-linejoin: miter`. **No curve smoothing, no area fills, no gradients, no shadows.**
- **Honest gaps.** A day with no data **breaks the line** — one polyline per run of consecutive
  values. Never interpolated, and never drawn as zero: a day you did not log sleep is a gap, not
  "0 hours". A *logged* zero is real data and is plotted.
- **Visible vertices.** Every logged day gets a small square mark, so the plot reads as points
  someone put on paper rather than a computed curve. (This supersedes the earlier "bare vertices,
  no dots" rule.)
- No gridlines of its own — the line sits on plain paper. Axis bounds and day ticks in mono
  `--ink-muted`.

### Mood color key (logging + display)
Mood is logged and displayed through a **labeled pastel-square legend** — the color-coding my
journal pens did.

| Label | Value | Token |
|---|---|---|
| ROUGH | 1 | `--lilac` |
| LOW | 2 | `--powder` |
| STEADY | 3 | `--ochre` |
| GOOD | 4 | `--sage` |
| GREAT | 5 | `--clay` |

**Stored 1–5 — the band IS the value.** An earlier revision stored 1–10 with each band spanning
two values, which bought nothing: the UI only ever offers five squares, so the odd values were
unreachable and the wider range overstated how precise the data is.

- Five squares in a row, each `--rhythm * 2`, with its mono label beneath. Tap to log.
- Selected square gets a `--stroke-ink` `--ink` border — the selection is drawn in ink, not by
  changing the pastel.
- Energy uses the identical control with its own labels (`DRAINED → CHARGED`), also 1–5.
- Sleep is hours (0–24, half-hour steps) on a stepper plus slider — never a keyboard field, which
  would be the slowest thing in a sub-60-second flow.
- The same legend renders read-only in month views, so the squares mean one thing everywhere.

### Habit X-mark grid
- A cell is a `--rhythm * 2` square with a `--stroke-hair` `--rule` border and `--radius`.
- Done = a small **pixel X glyph** in the habit's pastel (§7), not a font glyph and not a checkbox
  tick.
- Empty cells stay genuinely empty — no gray fill, no placeholder.
- Habits as rows, days as columns. Today's column is marked with an `--ochre` cap rule.
- Tap toggles, optimistically. Column and row headers in mono.

### Habit heatmap (monthly)

Two heatmaps, and the difference is the whole point of the density scale:

**Per habit** *(the habits screen)* — one habit, a month of cells. A day is done or it is not, so
the cells are **binary**: the habit's own pastel at full strength, or empty paper. Inventing
intermediate shades for one binary habit would misrepresent the data. The stepped scale drives a
week-density rule down the right edge instead, where 0–7 days is a real gradient.

**All habits stacked** *(the history screen)* — a month grid where each cell's shade is **how many
of that day's active habits were done**, on the stepped alpha `0 / 0.2 / 0.45 / 0.7 / 1` in
`--ochre`. This is where the density scale belongs: a day genuinely has 0–N completions. 0 done is
empty paper; all done is the full accent. A day still in the future is absent — no border, not a
miss. The denominator counts habits that **existed and were unarchived on that day**, so adding a
habit today does not retroactively mark the rest of the month as failures.

- Single-hue steps only in both. **Never a multi-hue ramp**, never green-to-red.
- Weekday initials in mono `--ink-muted`, with a legend so the shading is readable rather than
  decorative.

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
- Tap targets ≥ 44px. Spacing on the `--rhythm` scale. Single-column at mobile widths; a
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
- No paper-texture, noise overlay, or dot grid. The paper is plain.
- No emoji as UI (mood is pastel squares, not faces).

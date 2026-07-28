# BUILD_PROMPTS.md

Sequenced build prompts in dependency order. Paste **one at a time** into a fresh session and let
it finish before moving on. Each prompt is self-contained and opens by re-reading `SCOPE.md`,
`ARCHITECTURE.md`, and `DESIGN.md`.

The order is not optional — every prompt assumes the previous ones landed.

| # | Prompt | Phase | Ships |
|---|---|---|---|
| 0.1 | Monorepo scaffold + PWA shell + DESIGN.md token layer | 0 | The look exists before any feature |
| 0.2 | Express + Mongo + JWT auth + Socket.IO + full schema | 0 | Working backend + login |
| 1.1 | Goals API — horizons, checkoff, parent rollup | 1 | Goals backend |
| 1.2 | Goals UI — horizon tabs, pastel coding, status, rollup | 1 | Goals usable |
| 1.3 | Habits + X-mark grid + heatmap | 1 | Habit tracking |
| 1.4 | Daily check-in — morning + evening ritual | 1 | **The core ritual** |
| 1.5 | History — multicolor vitals chart, heatmap, moments | 1 | "it adds up" |
| 2.1 | Android install + notification gate + subscription | 2 | Push plumbing |
| 2.2 | BullMQ worker + reminder dispatch + settings | 2 | **v1 complete** |
| 3.1 | Learning projects — folder tabs, milestones, resources | 3 | v2 |
| 3.2 | Vault — LLM extraction, tags, search | 3 | v2 |
| 3.3 | Events — recurring, countdowns, reminders | 3 | **v2 complete** |

---

## Phase 0 — Foundation

### Prompt 0.1 — Monorepo scaffold + PWA shell + design tokens

```
Read SCOPE.md, ARCHITECTURE.md, and DESIGN.md in the repo root first — they are the source of
truth and their decisions are settled. Then build Prompt 0.1: the monorepo scaffold, the PWA
shell, and the DESIGN.md token layer. The look must exist before any feature does.

Deliver:
1. pnpm workspaces + Turborepo per ARCHITECTURE.md §2. Root scripts: dev, build, lint, typecheck.
   .gitignore, .env.example with every var from ARCHITECTURE.md §9, tsconfig.base.json strict.
2. packages/shared: buildable TS package exporting the domain types and enums from
   ARCHITECTURE.md §3, the SOCKET_EVENTS and QUEUE_NAMES constants (§5, §6), and the day-key
   helpers toDayKey / parseDayKey / monthRange / addDays with Vitest tests covering timezone
   edges (Asia/Kolkata vs a UTC server, midnight rollover, month boundaries).
3. apps/web: Next.js App Router + TypeScript + Tailwind. Serwist (@serwist/next) with
   app/manifest.ts and app/sw.ts per ARCHITECTURE.md §8 — precache the shell, NetworkFirst for
   API GETs, never cache mutations. Leave the push handler stubbed with a TODO pointing at
   Prompt 2.1. Placeholder maskable 192/512 icons. theme_color = --paper.
4. THE TOKEN LAYER — this is the heart of this prompt. styles/tokens.css with the day-paper and
   night-paper palettes from DESIGN.md §2 EXACTLY as specified (bone #F0EDE3, oat #E4DFD2, ink
   #33302A, muted ink #6B6659, the five pastels, washes, geometry), wired into
   tailwind.config.ts theme.extend so every token is a Tailwind class. Dark mode via
   prefers-color-scheme AS THE DEFAULT SIGNAL plus a :root[data-theme] override so an explicit
   toggle wins both ways. Hex values live ONLY in this file.
5. Fonts per DESIGN.md §3, self-hosted via next/font: Fraunces (headings), Space Mono (labels,
   data, dates, file tags), Inter (body). Two weights max per family. Every number in the app is
   mono.
6. components/paper/: DotGrid (the radial-dot background), PaperSheet, HairlineRule, FileTag (the
   mono "DAILY //" eyebrow — section headers only, max two per screen), SerifHeading. Vertical
   rhythm on multiples of --dot-gap.
7. components/pixel/: PixelGlyph (crispEdges inline SVG, pastels only) and PixelVignette (one
   small calm sage scene for the home header and empty states). Per DESIGN.md §7 these are the
   ONLY two places pixel art appears.
8. A static Today screen at app/(app)/page.tsx using only those primitives and hardcoded data:
   the pixel vignette header, a mono file tag, today's date in mono, a stub habit row of X-mark
   cells, the mood color-key squares, a stub multicolor jagged line, an empty moments list. No
   API calls. Stub the remaining route folders from ARCHITECTURE.md §7 with placeholders.
9. A day/night theme toggle in settings, and Sentry for web (no-op when the DSN is unset).

Obey DESIGN.md §9 (Do not): no shadows, no gradients, no glassmorphism, no candy color, no single
dominant accent, no charting library, no rounded progress bars, no badges, no emoji as UI, no
paper-texture images. Pastels never carry text.

Verify: pnpm build and pnpm typecheck pass, the app runs, Lighthouse reports it installable, and
both day and night paper look right. Then show me the Today screen and stop.
```

---

### Prompt 0.2 — Express + Mongo + JWT auth + Socket.IO + full schema

```
Read SCOPE.md, ARCHITECTURE.md, and DESIGN.md first. Prompt 0.1 is done (monorepo, PWA shell,
token layer, packages/shared). Build Prompt 0.2: the backend foundation.

apps/api (Express + TypeScript, layered routes/ → controllers/ → services/ → models/ per
ARCHITECTURE.md §10):
1. Boot: Zod-validated env (fail fast, non-zero exit on a missing var), Mongoose connection with
   retry, helmet, cors allowlist, express-rate-limit (tight on /auth/*), Winston (JSON in prod,
   requestId per line), Sentry, GET /healthz, and the central error handler with the
   { error: { code, message } } envelope — only 5xx goes to Sentry.
2. ALL Mongoose models from ARCHITECTURE.md §3 — users, goals, habits, habitLogs, checkins,
   learningProjects, projectMilestones, resources, events, pushSubscriptions — with every field,
   enum, and index exactly as specified. Day-keyed data (habitLogs, checkins) uses "YYYY-MM-DD"
   String dates with the regex match and the unique compound index on { userId, date }
   (habitLogs: { userId, habitId, date }). Include the resources text index. Build the v2 models
   now even though their routes come in Phase 3. Note that resources holds BOTH project resources
   and Vault items — there is no separate vault collection.
3. Self-rolled JWT auth: argon2id hashing; 15m access token in the Authorization header; 30d
   refresh token in an httpOnly/secure/SameSite=Lax cookie with rotation, hashed storage, token
   families, and reuse detection (a reused token revokes its family). Routes: POST /auth/register,
   /auth/login, /auth/refresh, /auth/logout, GET /auth/me, PATCH /auth/me. Plus requireAuth
   (puts userId on req) and a Zod validate(schema) middleware sourcing schemas from
   packages/shared.
4. Socket.IO on the same HTTP server: access-token handshake auth, reject unauthenticated
   sockets, auto-join room user:{userId}, and a typed emitToUser(userId, event, payload) helper.
   Notify-only — no client→server writes.
5. apps/web: lib/api.ts (typed fetch wrapper with refresh-on-401-and-retry), lib/socket.ts
   (singleton client), TanStack Query provider, and working login/register screens built from the
   Prompt 0.1 paper primitives. Protect the (app) route group.
6. A seed script creating my single user.

Every query scoped by userId, no exceptions. Vitest tests for refresh rotation and reuse
detection.

Verify: register → login → GET /auth/me → refresh → logout end to end; a socket connects and
joins its room; typecheck passes. Then stop.
```

---

## Phase 1 — v1 core loop

### Prompt 1.1 — Goals API

```
Read SCOPE.md §2 (five horizons), ARCHITECTURE.md §3 goals + §4 goals routes, and DESIGN.md.
Prompts 0.1–0.2 are done. Build Prompt 1.1: the goals backend. No UI in this prompt.

apps/api:
1. All /goals routes from ARCHITECTURE.md §4: list with horizon + status filters, GET
   /goals/today, detail with parent chain + children + rollup, create, patch (including
   currentValue), POST /goals/:id/complete, delete.
2. goalService holding the rules from SCOPE.md §2:
   - status: stored as active | done | archived. OVERDUE IS DERIVED, never stored —
     status === 'active' && dueDate < today(user.timezone). Daily goals get an implicit due date
     of their own day; long-term goals with no dueDate are never overdue.
   - parentGoalId must be a STRICTLY HIGHER horizon (skips allowed — daily → yearly is legal);
     reject same-or-lower with a 422.
   - cycle prevention: a goal can never be its own ancestor. Validate on create AND patch,
     walking the full chain.
   - rollup computed on read via aggregation, never stored:
     progressPercent = round(completedChildren / totalChildren * 100). With no children but a
     targetValue set, progress = currentValue / targetValue. With neither, no ratio.
   - completing sets completedDate; a parent may be completed manually regardless of children.
   - delete detaches children (parentGoalId → null). It does NOT cascade.
3. Timezone-correct "today" via toDayKey(now, user.timezone) from packages/shared — never a bare
   new Date() on the server.
4. Emit goal:created / goal:updated / goal:deleted / goal:completed to user:{userId} after each
   successful write.
5. Zod schemas for every payload in packages/shared.

Vitest: horizon-order validation, cycle rejection (direct and multi-hop), rollup math including
zero children and the targetValue path, overdue derivation across a timezone boundary.

Verify with real requests against a running API, then stop.
```

---

### Prompt 1.2 — Goals UI
i
```
Read SCOPE.md, ARCHITECTURE.md, and DESIGN.md first. Prompts 0.1–1.1 are done; the goals API is
live. Build Prompt 1.2: the goals UI — phone-first, one-handed, in the editorial-archival paper
aesthetic.

apps/web:
1. app/(app)/goals/[horizon]/page.tsx — HorizonTabs across daily / weekly / monthly / yearly /
   long-term, a StatusFilter for active / done / overdue, and a list of GoalRow items. Each
   horizon carries its FIXED pastel from DESIGN.md §2: daily=sage, weekly=powder, monthly=clay,
   yearly=ochre, long-term=lilac. Use that pastel consistently everywhere the horizon appears.
   One mono FileTag per screen (e.g. "MONTHLY //").
2. GoalRow: title in Inter, due date and any value counter in mono, and a tap-to-check X mark.
   Overdue rows are marked with --clay PLUS a mono "OVERDUE" label — never color alone.
3. ProgressRule for goals with children: "3/12 monthly done · 25%" in mono above a thin hairline
   rule filled in the horizon's pastel. NO rounded progress bar, NO percentage ring.
4. app/(app)/goals/[id]/page.tsx — notes, tappable parent breadcrumb up the chain, children with
   their own checkoffs, the rollup, and difficulty / target-value display when set.
5. Create and edit as BOTTOM SHEETS (not full-page forms, not centered modals): title, notes,
   horizon, optional parent picker showing only valid higher-horizon goals, optional due date,
   optional difficulty and targetValue. Primary action in the thumb arc, tap targets ≥44px.
6. TanStack Query for all server state. Optimistic checkoff. Subscribe to goal:* socket events
   and patch the cache with setQueryData — do not blanket-invalidate.
7. Empty states as journal prompts with the pixel vignette, per DESIGN.md §8.

No gamification — a completed goal gets an X mark, never a celebration.

Verify on a mobile viewport: create goals in two horizons, link a child to a parent, watch the
rollup update, exercise all three status filters, confirm both day and night paper. Then stop.
```

---

### Prompt 1.3 — Habits + X-mark grid + heatmap

```
Read SCOPE.md §4.2, ARCHITECTURE.md §3 habits/habitLogs + §4 habits routes, and DESIGN.md §6–§7.
Prompts 0.1–1.2 are done. Build Prompt 1.3: habits, full stack.

apps/api:
1. Habit CRUD + POST /habits/:id/archive (archiving keeps all history and drops the habit from
   today's grid). Habits carry a stable pastel and an optional pixelGlyph key.
2. POST /habit-logs — one idempotent upsert on { userId, habitId, date }; done:false deletes the
   row. Reject future dates; allow backfill.
3. GET /habits/grid?from=&to= → a habits × days matrix in ONE aggregation (no N+1).
4. GET /habits/:id/heatmap?month=YYYY-MM and GET /habits/:id/streak → { current, longest },
   computed in a service with Vitest tests for gaps, single-day streaks, and a streak that
   includes today vs one that ended yesterday.
5. Emit habit:created / habit:updated / habit:archived / habitLog:changed.

apps/web:
6. components/habit/XMarkCell — a --dot-gap*2 square with a hairline --rule border and --radius.
   Done renders a tiny PIXEL X GLYPH in the habit's pastel (crispEdges SVG, not a font glyph, not
   a checkbox tick). Empty cells stay genuinely empty — no gray fill. Tap toggles, optimistic.
7. components/habit/HabitGrid — habits as rows, the last ~7 days as columns, headers in mono,
   today's column capped with an --ochre rule. The check-in screen reuses this component.
8. components/habit/HabitHeatmap — one habit, one month, density in that habit's OWN pastel at
   stepped alpha 0 / 0.2 / 0.45 / 0.7 / 1. Single hue only — never a multi-hue ramp, never
   green-to-red. Weekday initials in mono.
9. app/(app)/habits/ — manage habits (add, rename, pick pastel + pixel glyph, reorder, archive)
   plus per-habit heatmap and streak. Streak is a plain mono number — no flame, no badge, no
   celebration.

Verify: create three habits, tick across several days including a backfilled one, confirm
double-tap idempotency, confirm streak and heatmap agree. Then stop.
```

---

### Prompt 1.4 — Daily check-in

```
Read SCOPE.md §3 (the daily check-in ritual) closely, plus ARCHITECTURE.md §3 checkins + §4
check-in routes, and DESIGN.md §6. Prompts 0.1–1.3 are done. Build Prompt 1.4 — the most
important screen in the app.

apps/api:
1. GET /checkins/:date (empty shell when none exists), PUT /checkins/:date/morning, PUT
   /checkins/:date/evening, GET /checkins?month=YYYY-MM, GET /checkins/moments?month=.
2. One document per { userId, date }, upserted idempotently. Both halves patch the SAME document
   via $set on explicit paths — never whole-document replacement, and saving one half must never
   wipe or duplicate the other. Set morningLoggedAt / eveningLoggedAt.
3. Every field except date is optional; a partial check-in is valid. Reject future dates; allow
   backfilling past dates.
4. Ticking goals in the evening writes `completed` AND completes those goals through goalService —
   one code path, so rollups stay correct.
5. Emit checkin:updated { date, half, checkin }.

apps/web — app/(app)/checkin/:
6. Morning: 1–5 intention lines, optional pick of today's goals from GET /goals/today. ~15
   seconds.
7. Evening, in this exact order: (a) the HabitGrid X-marks from Prompt 1.3, (b) MOOD AND ENERGY
   VIA THE COLOR-KEY SQUARES from DESIGN.md §6 — five labeled pastel squares (ROUGH/LOW/STEADY/
   GOOD/GREAT mapped to 1–10, selection drawn as an ink border, never by changing the pastel),
   energy the same control with DRAINED→CHARGED labels, plus an optional sleep-hours mono
   stepper, (c) one optional memorable-moment line prompted "What's worth remembering about
   today?", (d) today's goal checkoff list.
8. THE EVENING FLOW MUST BE COMPLETABLE IN UNDER 60 SECONDS WITH ONE THUMB. Everything saves as
   you go — no submit-everything button, no blocking spinners, optimistic writes confirmed by the
   socket echo. No keyboard needed except the moment line.
9. Show "morning logged / evening logged" plainly. No score, no streak celebration, no
   gamification.
10. A date switcher for backfilling. No future dates.
11. Wire the Today screen (app/(app)/page.tsx) to real data — today's intention, the habit row,
    today's goals, the pixel vignette header — with one quiet call to action into whichever half
    is unlogged.

Verify: log a morning, then an evening, confirm ONE document holds both; save the evening twice
and confirm idempotency; backfill a past day; then time the evening flow and tell me the count.
Then stop.
```

---

### Prompt 1.5 — History: multicolor vitals chart, heatmap, moments

```
Read SCOPE.md, ARCHITECTURE.md §4 history routes, and DESIGN.md §6 (the history centerpiece).
Prompts 0.1–1.4 are done. Build Prompt 1.5 — the "my month adds up to something" payoff.

apps/api:
1. GET /history/vitals?month=YYYY-MM → [{ date, mood, energy, sleep }] for the whole month.
2. GET /history/summary?month=YYYY-MM → checkin count, habit completion %, goals completed,
   moments count. One aggregation per metric, no N+1.

apps/web — app/(app)/history/:
3. components/charts/VitalsChart — the hand-plotted multicolor line chart, modeled on a real
   bullet-journal vitals page. Mood in --sage, energy in --clay, sleep in --powder as OVERLAID
   THIN JAGGED POLYLINES at --stroke-ink. Hand-rolled inline SVG polylines — DO NOT ADD A
   CHARTING LIBRARY. stroke-linejoin: miter. No curve smoothing, no area fill, no gradients, no
   shadows, no dots on vertices.
4. MISSING DAYS BREAK THE LINE — render one polyline per run of consecutive days rather than
   interpolating across a gap. Gaps are honest.
5. No gridlines of its own; the page's dot grid shows through as the graph paper. MonthAxis ticks
   in mono --ink-muted. A ColorKey beneath the chart: a pastel square + mono label per series.
6. The monthly habit heatmap, all habits stacked, each in its own pastel at the stepped alphas.
7. The month's memorable moments as a plain dated mono-and-Inter list — the journal-like reward
   for logging.
8. A month switcher and a compact summary strip from /history/summary, all numbers in mono, stated
   plainly — never framed as a score or a grade.
9. A sparse or empty month must look like a blank page with the pixel vignette, not a broken
   chart.

Verify against a month seeded with deliberate gaps: confirm the lines break at gaps instead of
interpolating, that the color key matches the line colors, and that an empty month renders
cleanly in both day and night paper. Then stop.
```

---

## Phase 2 — Reminders (completes v1)

### Prompt 2.1 — Android install + notification gate + subscription

```
Read SCOPE.md §4.6 and ARCHITECTURE.md §8 (the PWA + push flow — follow its ordering exactly),
plus DESIGN.md. Prompts 0.1–1.5 are done. Build Prompt 2.1: the client-side push plumbing.

apps/web:
1. Install flow: capture beforeinstallprompt, stash it, show a quiet one-line paper banner
   offering install. Detect installed state with matchMedia('(display-mode: standalone)') and
   never show the banner when already installed.
2. The permission gate — ORDER MATTERS: only after the app is INSTALLED AND OPENED do we show the
   reminder card. Never on first paint, never on a cold browser visit. On tap:
   Notification.requestPermission() → on grant, pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY) }) → POST
   /api/push/subscriptions with { endpoint, keys, userAgent, timezone }.
3. lib/push.ts owning permission state, subscribe, unsubscribe, and a re-sync on app open. Handle
   the denied state honestly — explain how to re-enable in Android settings, and do not nag or
   re-prompt.
4. Finish app/sw.ts: a push handler calling showNotification with a TAG PER REMINDER KIND (so an
   unread evening reminder is replaced, not stacked), a notificationclick handler that focuses an
   existing client if one exists and otherwise openWindow's the deep link (/checkin, /goals/:id,
   /events), and a pushsubscriptionchange handler that re-subscribes and re-POSTs.
5. app/(app)/settings/: notification status, enable/disable, and a "send test notification"
   button, alongside the existing day/night toggle.

apps/api:
6. POST /push/subscriptions (upsert on the unique endpoint — one user, many devices), DELETE
   /push/subscriptions, and POST /push/test which sends via web-push to every subscription of the
   user and prunes any returning 404/410.

Notification copy is quiet and factual per SCOPE.md §4.6 — no streak language, no urgency.

Verify on a real installed Android PWA if possible, otherwise desktop Chrome: subscribe, confirm
the row in Mongo, fire the test push, tap the notification, confirm the deep link. Then stop.
```

---

### Prompt 2.2 — BullMQ worker + reminder dispatch + settings

```
Read SCOPE.md §4.6 and ARCHITECTURE.md §5 (BullMQ jobs). Prompts 0.1–2.1 are done. Build Prompt
2.2 — this completes v1.

apps/worker (a standalone BullMQ worker process):
1. Boot: Zod-validated env, Mongoose connection, shared Redis connection, Winston, Sentry, queue
   names from packages/shared, and graceful shutdown that drains in-flight jobs.
2. The jobs from ARCHITECTURE.md §5:
   - reminders / scan-checkin-reminders — repeatable every 5 min; users whose LOCAL time matches
     reminderTime within the window and whose today's eveningLoggedAt is unset; skips anyone who
     already logged; respects remindersEnabled + remindCheckin
   - reminders / scan-goal-reminders — daily; active goals due today (user-local); respects
     remindGoals
   - push / send-push — web-push to all of the user's subscriptions; deletes on 404/410,
     increments failureCount, lets 429/5xx retry
   - maintenance / roll-recurring-events — daily; a harmless no-op until Prompt 3.3
3. Job defaults: attempts 5, exponential backoff from 5000ms, removeOnComplete { count: 100 },
   removeOnFail { count: 500 }.
4. Idempotency via deterministic jobIds — checkin-reminder:{userId}:{YYYY-MM-DD} — so a repeated
   scan can never double-send. Declare repeatable jobs once at boot and RECONCILE them (remove
   stale repeat keys) rather than blindly re-adding.
5. TIMEZONE CORRECTNESS IS THE HARD PART: every scan compares against each user's IANA timezone,
   never server time. Vitest tests for the scan window (a user at 21:00 IST while the server runs
   UTC), the already-logged skip, and jobId idempotency.

apps/api + apps/web:
6. Settings UI + PATCH /auth/me for reminderTime ("HH:mm"), timezone, remindersEnabled, and the
   per-kind toggles. Changing the time takes effect on the next scan — there is no per-user
   scheduled job to reschedule.
7. Notification copy: quiet and factual. "Evening check-in" — not "Don't break your streak!"

Verify: set my reminder time two minutes out, watch the worker log the scan, receive the push, log
the evening, and confirm the next scan skips me. Then stop and tell me v1 is complete.
```

---

## Phase 3 — v2 features

### Prompt 3.1 — Learning projects (folder-tab UI)

```
Read SCOPE.md §4.3, ARCHITECTURE.md §3 learningProjects/projectMilestones/resources + §4 v2
routes, and DESIGN.md §5 (the archival folder-tab component). v1 (Prompts 0.1–2.2) is complete.
Build Prompt 3.1: learning projects.

apps/api:
1. Project CRUD, milestone CRUD with reorder and POST /milestones/:id/complete, resource CRUD via
   /resources. GET /projects/:id returns the project + ordered milestones + attached resources +
   progressPercent.
2. Progress: derived from milestones (done / total); the stored `progress` value overrides when
   set, for projects without discrete milestones. Derived on read, same discipline as goal
   rollup. Vitest for both paths and the zero-milestone case.
3. Assign each project a stable pastel round-robin from the five at creation.
4. Emit project:updated / milestone:updated.

apps/web — app/(app)/projects/:
5. components/folder/FolderTab + FolderStack per DESIGN.md §5: an oat --card panel with a tab
   protruding from its top edge, horizontally offset so a list reads as a stack of files in a
   drawer. Tab fill = the project's pastel at wash strength, hairline --rule border,
   --radius-tab on the top corners only. Tab carries the title in Fraunces plus a mono file tag
   ("PROJECT · JP //"). Offsets cycle so the stack looks hand-filed. Opening keeps the same tab at
   the top so you never lose which file you're in. Geometry and color only — no skeuomorphic
   shadows, no curled corners, no paper textures.
6. Project detail: description, target date, the milestone checklist with X-mark checkoffs and
   drag-to-reorder, the progress as a thin hairline rule filled in the project's pastel (never a
   rounded bar, never a ring), and the attached resources section (links + notes) so everything
   for that topic lives in one place.
7. Add/edit as bottom sheets, phone-first, same aesthetic.

Verify: create a project, add five milestones, complete two, confirm 40%; set the manual progress
override and confirm it wins; attach a link and a note; confirm a stack of three projects reads as
filed folders in both day and night paper. Then stop.
```

---

### Prompt 3.2 — Vault

```
Read SCOPE.md §4.4 (read the scraping reality check carefully), ARCHITECTURE.md §3 resources +
§4 v2 routes + §5 process-resource, and DESIGN.md. Prompts 0.1–3.1 are done. Build Prompt 3.2:
the Vault.

The point: stop saving whole reels/videos you never rewatch — save the useful content as written
text. Vault items live in the `resources` collection alongside project resources.

apps/api:
1. POST /vault { source, url?, rawText? } → creates a pending resource, enqueues process-resource,
   returns 202 immediately. Plus POST /vault/:id/reprocess, GET
   /resources?q=&tag=&projectId=&source=&page= (Mongo text search + tag filter + pagination), and
   GET/PATCH/DELETE /resources/:id.

apps/worker — process-resource:
2. When the source is a URL: ONE best-effort fetch of page text/caption with a short timeout. DO
   NOT build scraping infrastructure — no headless browser, no unofficial platform APIs, no proxy
   rotation, no retry storms against Instagram or TikTok. On failure set processingStatus
   'failed' with a clear processingError and stop; the UI recovers.
3. LLM extraction (Claude via LLM_API_KEY / LLM_MODEL) over rawText, whether pasted or fetched —
   ONE prompt, ONE code path. Extract: a short summary that is the ACTUAL TAKEAWAY (not a
   description of the video), links [{ url, label }] for any resources/tools/books mentioned, and
   suggested tags. Enforce the output shape with a Zod schema; a malformed response fails the item
   rather than writing garbage. Always retain rawText for reprocessing.
4. Emit resource:processed { id, processingStatus }.

apps/web — app/(app)/vault/:
5. Add flow with two inputs: paste a URL, or paste the caption/transcript text. THE
   CAPTION/TRANSCRIPT PASTE IS THE PRIMARY PATH and the UI must read that way. When a URL fetch
   fails, fall through IMMEDIATELY to "paste the caption or transcript instead" — never a
   dead-end error screen. Do not over-promise direct scraping anywhere in the copy.
6. List with search + tag filter; a pending item shows a quiet mono processing state and resolves
   live via the socket (no skeleton shimmer, per DESIGN.md §8).
7. Item detail: the summary as the hero (this is written text you actually reread) in Inter, the
   extracted links, editable tags, the original source URL in mono, attach-to-a-learning-project,
   and a reprocess action.

Verify: paste a transcript and confirm a useful summary + links + tags; paste an Instagram URL,
confirm it fails gracefully with the paste fallback one tap away; confirm search finds an item by
a word from its transcript; attach an item to a project and confirm it appears on that folder.
Then stop.
```

---

### Prompt 3.3 — Important events

```
Read SCOPE.md §4.5, ARCHITECTURE.md §3 events + §4 event routes + §5 roll-recurring-events /
scan-event-reminders, and DESIGN.md. Prompts 0.1–3.2 are done. Build Prompt 3.3 — this completes
v2.

apps/api:
1. Event CRUD and GET /events/upcoming?days=90 → next occurrences with day counts, sorted.
   Fields: title, "YYYY-MM-DD" date, recurring (none/weekly/monthly/yearly), reminderLeadDays,
   optional goalId, notes.
2. Next-occurrence computation per recurrence kind, timezone-correct via the packages/shared
   day-key helpers. Vitest for yearly across a year boundary, monthly for a 31st in a 30-day
   month, and weekly.

apps/worker:
3. Implement maintenance / roll-recurring-events for real: advance past-dated recurring events to
   their next occurrence, set lastRolledAt, and make it IDEMPOTENT — running twice in one day must
   not skip an occurrence.
4. Implement reminders / scan-event-reminders: events where date minus reminderLeadDays is today
   (user-local) → enqueue send-push, respecting remindEvents. Deterministic jobId per event per
   date.

apps/web — app/(app)/events/:
5. Upcoming list sorted by next occurrence with a live "in N days" countdown — the number in mono,
   and --ochre reserved for the single nearest event only.
6. Add/edit sheet with a recurrence picker, lead-time picker, and optional goal link. Show the
   linked goal on the event and the linked event on the goal detail.
7. Surface the nearest event or two on the Today screen as one quiet line — no badge, no pixel
   art.

Verify: create a dated event and a yearly recurring one dated yesterday, run the rollover job,
confirm it advanced by exactly one year and that a second run changes nothing; confirm an event
reminder fires at its lead time. Then stop and tell me v2 is complete.
```

---

## After Phase 3

Backlog once v1 and v2 ship. Not prompts — do not start these unsolicited.

- Deployment: web on Vercel, api + worker on a container host, Mongo Atlas, managed Redis.
- Scheduled Mongo backup.
- A weekly (not just monthly) history view, if the monthly one earns it.
- Do **not** add anything from `SCOPE.md` §6 — no gamification, no social, no native app, no AI
  chat.

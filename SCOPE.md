# SCOPE.md

> Source of truth for **what** this app is. Re-read this + `ARCHITECTURE.md` + `DESIGN.md` at the
> start of every session before writing code. These decisions are settled — if a request conflicts
> with this doc, flag it rather than silently drifting.

---

## 1. Product thesis

A phone-first PWA (Android) personal tracker that digitizes the feeling of a physical
bullet journal. Calm, focused, personal.

**The single job:** make me want to open it every morning and night, log what I did, and see my
week/month add up to something.

Every feature is judged against that sentence. If it doesn't serve the daily open → log →
see-it-add-up loop, it's v2 or out of scope.

Single user for now (me), but the data model is multi-user-ready from day one — every user-owned
document carries a `userId`.

Look and feel is specified in full in `DESIGN.md`: editorial-archival spine + rare pixel accents
on plain warm paper. Muted, grown-up, personal. Never a slick SaaS dashboard, never a
loud game.

---

## 2. Goals — five horizons

Horizons: **daily, weekly, monthly, yearly, long-term**.

Every goal:
- belongs to exactly one horizon
- has a checkoff (done / not done) with a completion date
- optionally has a `parentGoalId` pointing at a goal in a **higher** horizon
- optionally has `difficulty` and a `targetValue` / `currentValue` pair for measurable goals
  (e.g. "read 12 books" → 3/12)

### Parent linking & rollup

A goal may link upward to a parent at any higher horizon (daily → weekly, monthly → yearly,
yearly → long-term). Skips are allowed: daily → yearly is legal.

Parent progress is **derived on read, never stored as truth**:

```
progressPercent = round(completedChildren / totalChildren * 100)
```

- Displayed as `3/12 monthly done → 25%`.
- If the goal has `targetValue` set and no children, progress comes from
  `currentValue / targetValue` instead.
- A parent with neither children nor a target shows only its own checkoff state.
- A parent can be checked off manually regardless of child state; the child ratio still shows
  underneath.
- Rollup displays one level deep (a goal shows its own children's ratio, not grandchildren's),
  though the link chain itself may be arbitrarily deep.
- **Cycle prevention:** a goal can never be its own ancestor. Validate on every write.

### Status view

Each horizon screen filters by:

| Status | Definition |
|---|---|
| **Active** | `status === 'active'` and (no `dueDate` or `dueDate >= today`) |
| **Done** | `status === 'done'` (`completedDate` set) |
| **Overdue** | `status === 'active'` and `dueDate < today` |

`overdue` is **derived**, not a stored status value. Daily goals get an implicit due date of
their own day. Long-term goals with no `dueDate` are never overdue.

---

## 3. Daily check-in — the core ritual

The most important screen in the app. Two moments, **one document per day**.

### Morning — intention
- Set today's intention: **one line**, entered straight on the home hero card.
- Optionally pick which of today's goals you intend to hit.
- ~15 seconds, no sheet.

### Evening — the log
In this order on screen:

1. **Habit grid** — user-defined habits as a row of cells; tap to fill with an X mark.
2. **Mood** — logged via the **color-key pastel squares** (`DESIGN.md` §6): tap a labeled square.
   Stored **1–5**, one value per square, and plotted as a jagged line on the history page.
3. **Energy** — the same control, own labels (DRAINED → CHARGED). Also 1–5.
4. **Sleep** — hours, 0–24 in half-hour steps, on a stepper and slider rather than a keyboard.
5. **Memorable moment** — one optional line. "What's worth remembering about today?"
6. **Goal checkoff** — today's daily goals plus anything due today, as a tick list.

### Rules
- One `checkin` per `{userId, date}`, `date` as `"YYYY-MM-DD"`. Unique compound index.
- Morning and evening write to the **same** document; either half can be filled independently and
  out of order. Saving one half must never wipe or duplicate the other.
- Everything except `date` is optional. A partial check-in is a valid check-in.
- Idempotent upsert — reopening and re-saving never duplicates.
- Backfill of past dates is allowed. Future dates are rejected.
- Habit ticks live in `habitLogs` (their own collection), not embedded in the check-in, so the
  grid and heatmap query them directly.
- Completion state is shown plainly. `completed` turns true only when the evening flow is actually
  finished; a partial day stays false. Never scored.
- **The evening flow must be completable in under 60 seconds with one thumb.**
- **What saves when.** The evening sheet commits with a single "Done" — one upsert for mood,
  energy, sleep hours, moment and goal ticks together. Two things write immediately instead,
  because they stand on their own: **habit ticks** (their own collection) and the **one-tap mood
  square on the home card**. An abandoned sheet leaves no partial row, while the one-tap paths
  stay instant.
- Backfill reaches back **14 days**; further than that is refused, on the grounds that it is more
  likely a mistyped date than a memory.

---

## 4. Feature specs

### 4.1 Goals *(v1)*
CRUD across all five horizons. Fields per `ARCHITECTURE.md` §3. Views: per-horizon list with the
active/done/overdue filter; goal detail showing parent breadcrumb, children, and derived rollup;
quick-add from the check-in screen. Horizons are color-coded with the pastel palette
(`DESIGN.md` §3) — one pastel per horizon, used consistently everywhere a horizon appears.

### 4.2 Habits *(v1)*
User-defined habits (name, optional weekly target, sort order, archive). One `habitLog` per
`{userId, habitId, date}`.

Views:
- **X-mark grid** on the check-in screen — habits as rows, recent days as columns. Marks are tiny
  pixel glyphs (`DESIGN.md` §7).
- **Monthly heatmap** — one habit's month at a glance, pastel density steps.
- **Streak** — current + longest, as a plain mono number. Not a reward, not a flame.

Archiving keeps all history and removes the habit from today's grid.

### 4.3 Learning projects *(v2)*
A project for a topic you're deliberately getting better at (Japanese, 3D modeling). Everything
for that topic lives in one place.

- Fields: title, description, `progress`, status (`active | paused | done`), optional target date.
- **Milestone checklist** — ordered `projectMilestones`, each with its own checkoff.
- **Progress %** — derived from milestones (`done / total`) by default; a manual value may
  override for projects without discrete milestones.
- **Attached resources** — links + notes from the `resources` collection, scoped to the project.
- Vault items (also `resources`) can attach to a project.
- Presented as **archival folder-tab "files"** — see `DESIGN.md` §5. Each project gets a pastel
  tab color.

### 4.4 Vault *(v2)*
The point: **stop saving whole reels/videos you never rewatch. Save the useful content as written
text.** Vault items are stored in the `resources` collection alongside project resources.

Two inputs:
1. **Paste a URL** — best-effort fetch of page text / caption.
2. **Paste caption or transcript text** — the primary, reliable path.

An LLM then extracts:
- a short written **summary** — the actual takeaway, not a description of the video
- any **links** / resources / tools / books mentioned
- suggested **tags**

Saved as searchable, taggable text. Optionally attached to a learning project.

> **Reality check — do not over-promise:** Instagram and TikTok actively block scraping. Direct
> URL fetch **will often fail**. The UI treats URL fetch as opportunistic and the
> caption/transcript paste as the primary path — on fetch failure, fall through immediately to
> "paste the caption or transcript instead", never a dead-end error. The LLM structures the
> content identically either way. No headless browsers, no unofficial platform APIs, no proxy
> rotation.

Views: list with full-text search + tag filter; item detail with the summary as the hero, the
extracted links, the tags, the original source URL, the retained raw text, and attach-to-project.

### 4.5 Important events *(v2)*
Dated items with countdowns: birthdays, launches, deadlines.

- Fields: title, date, optional recurrence (`none | weekly | monthly | yearly`), optional `goalId`
  link, reminder lead days, notes.
- List sorted by next occurrence with a live "in N days" countdown.
- Recurring events roll forward automatically after their date passes (worker job).
- Wired into reminders.

### 4.6 Reminders *(v1)*
Server-scheduled web push. Three kinds:

| Kind | Trigger |
|---|---|
| **Evening check-in** | daily at a user-set time; skipped if the evening half is already logged |
| **Goal due date** | on a goal's `dueDate`. One goal → its own nudge; **two or more → a single "N goals due today" digest**, because five buzzes in a morning trains you to swipe the app away |
| **Event reminder** | event date minus its lead days *(v2)* |

Flow: ask notification permission **after** the app is installed and opened (never on first
paint), subscribe via `PushManager`, store the subscription server-side, worker sends on schedule
with retries and backoff. Prune subscriptions returning 404/410.

Settings: reminder time, timezone, per-kind toggles.

Notification copy is quiet and factual — "Evening check-in", never "Don't break your streak!"

---

## 5. v1 vs v2

### v1 — the daily loop
Auth · installable PWA shell + the full `DESIGN.md` token layer · goals across five horizons with
checkoff, parent linking, status views · habits + X-mark grid + heatmap · daily check-in (morning
intention; evening habits, mood/energy color-key, memorable moment, goal checkoff) · history
(multicolor jagged line chart, habit heatmap, moments list) · reminders (install/push gate, worker
dispatch, reminder-time settings).

### v2 — the depth
Learning projects (folder-tab UI, milestones, progress, attached resources) · Vault (LLM
extraction, tags, search, attach-to-project) · important events (dated/recurring, countdowns,
reminder integration).

Both are fully specified in these docs. `BUILD_PROMPTS.md` sequences v1 to completion **before**
v2.

---

## 6. Out of scope

Deliberately cut. Do not add these, and do not propose them as improvements.

- **No gamification** — no XP, no levels, no points, no badges, no trophies, no streak
  celebrations. Cut on purpose. Streaks appear as plain numbers only.
- **No social** — no sharing, no friends, no leaderboards, no public profiles, no comments.
- **No native app** — Android PWA only. No React Native, no Capacitor, no Play Store.
- **No AI chat** — the LLM does exactly one job: structuring pasted Vault content. No chatbot, no
  coach, no "ask your journal", no AI-generated goals or insights.
- No calendar sync, no third-party integrations (Notion/Todoist/Google Fit).
- No multi-user UI (invites, sharing, teams) — the schema is ready, the product is not.
- No iOS-specific push work.
- No offline-first write sync (CRDTs, queued mutations). The service worker caches shell and
  reads; writes require network in v1.
- No user-customizable theming beyond the built-in day/night paper modes.

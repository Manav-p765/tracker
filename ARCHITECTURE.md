# ARCHITECTURE.md

> Source of truth for **how** this app is built. Re-read this + `SCOPE.md` + `DESIGN.md` at the
> start of every session before writing code. The stack is **settled** — do not re-litigate it.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router, TypeScript)** | File routing + RSC + first-class PWA story; one framework for the client |
| PWA | **Serwist** (`@serwist/next`) | Maintained successor to next-pwa; manifest + service worker + push event handling |
| Backend | **Node + Express (TypeScript)** | Explicit and boring; full control over auth, sockets, and job producers |
| DB | **MongoDB + Mongoose** | Document shape fits day-keyed logs and nested checklists; schemas + indexes declared in code |
| Jobs | **BullMQ (Redis)** | Repeatable jobs for reminder dispatch and recurring-event rollover, with retries/backoff built in |
| Realtime | **Socket.IO** | Keeps phone and tabs in sync; instant feedback on writes |
| Auth | **Self-rolled JWT** (access + refresh with rotation) | No vendor, full control; refresh rotation + reuse detection |
| Password hashing | **argon2id** | Modern default, tuned memory cost |
| Push | **web-push + VAPID** | Standard Android PWA push; no FCM project needed |
| Logging | **Winston + Sentry** | Structured logs from day one, across web, api, and worker |
| Styling | **Tailwind + design-token layer** | Utilities for speed; tokens carry `DESIGN.md` |
| Data layer (client) | **TanStack Query** | Server-state cache that the socket can patch directly |
| Validation | **Zod** in `packages/shared` | One schema per payload, shared by client and server |
| Monorepo | **pnpm workspaces + Turborepo** | Fast, simple, good TS project references |

Node 20+, pnpm 9+, TypeScript `strict` everywhere.

---

## 2. Monorepo layout

```
tracker/
├── apps/
│   ├── web/                  # Next.js App Router PWA
│   ├── api/                  # Express + Socket.IO
│   └── worker/               # BullMQ worker process
├── packages/
│   ├── shared/               # TS types, Zod schemas, day-key utils, constants
│   └── db/                   # Mongoose models — the schema, in exactly one place
├── SCOPE.md  ARCHITECTURE.md  DESIGN.md  BUILD_PROMPTS.md
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

`packages/shared` is the only cross-app dependency, and exports:
- domain types and enums (`Goal`, `Habit`, `Checkin`, `Horizon`, `GoalStatus`, …) — one definition,
  imported by both Mongoose models and React components
- Zod schemas for every API payload
- `SOCKET_EVENTS` and `QUEUE_NAMES` constants (no stringly-typed names)
- day-key helpers: `toDayKey(date, tz)`, `parseDayKey`, `monthRange(yyyyMm)`, `addDays`
- shared derivation logic used by both api and worker: goal status, rollup math, streaks

`packages/db` holds the Mongoose models. It exists because **both** `api` and `worker` need the
schemas, and the rule below forbids the worker reaching into the API's source. It depends on
`shared` (for the enums the schemas validate against) and is never imported by `web` — Mongoose has
no business in a browser bundle.

Rule: **no app imports from another app.** `web` never imports from `api`; `worker` never imports
from `api`. Anything two apps need goes in a package.

---

## 3. Data model (Mongoose)

Conventions applied to every collection:
- `_id` ObjectId; `timestamps: true`.
- Every user-owned doc carries `userId: ObjectId, ref 'User', required, indexed`.
- **Day-keyed data (`habitLogs`, `checkins`) uses `date: String` in `"YYYY-MM-DD"` form**, never a
  `Date` — no timezone drift, sorts lexicographically, indexes cleanly. Enforce with
  `match: /^\d{4}-\d{2}-\d{2}$/`. `dueDate`, `completedDate`, and event `date` use the same form.
- Soft-delete via `archivedAt` where history matters (habits, projects); hard delete elsewhere.
- **Every query is scoped by `userId`. No exceptions.**

### users
| Field | Type | Notes |
|---|---|---|
| email | String | required, unique, lowercase, trimmed |
| passwordHash | String | required, `select: false` |
| name | String | optional |
| timezone | String | IANA, default `"Asia/Kolkata"` |
| theme | String enum | `day \| night \| system`, default `system` |
| reminderTime | String | `"HH:mm"`, default `"21:00"` |
| remindersEnabled | Boolean | default `true` |
| remindCheckin / remindGoals / remindEvents | Boolean | default `true` |
| refreshTokens | `[{ tokenHash, family, expiresAt, revokedAt, userAgent }]` | rotation + reuse detection |

Index: `{ email: 1 }` unique.

### goals
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| title | String | required, max 200 |
| notes | String | optional |
| horizon | String enum | `daily \| weekly \| monthly \| yearly \| longterm` |
| parentGoalId | ObjectId ref goals | optional; must be a **strictly higher** horizon; no cycles |
| difficulty | String enum | `easy \| medium \| hard`, optional |
| targetValue | Number | optional — measurable goals ("read 12 books") |
| currentValue | Number | optional, default 0 |
| status | String enum | `active \| done \| archived`, default `active` |
| dueDate | String | `"YYYY-MM-DD"`, optional |
| completedDate | String | `"YYYY-MM-DD"`, set when status → done |
| sortOrder | Number | default 0 |

Indexes: `{ userId: 1, horizon: 1, status: 1 }`, `{ userId: 1, parentGoalId: 1 }`,
`{ userId: 1, dueDate: 1 }`, `{ userId: 1, completedDate: 1 }` (history: goals completed per day).

**`overdue` is derived, never stored** — `status === 'active' && dueDate < today(user.tz)`.
Rollup (`completedChildren` / `totalChildren` / `progressPercent`) is computed on read via
aggregation, never stored. Horizon-order and acyclicity are validated in the service layer and a
pre-save hook.

### habits
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| name | String | required, max 60 |
| pastel | String enum | `sage \| clay \| powder \| ochre \| lilac` — stable identity color |
| pixelGlyph | String | optional glyph key (`book`, `drop`, `shoe`, …), default `x` |
| targetPerWeek | Number | optional 1–7, display only |
| sortOrder | Number | default 0 |
| archivedAt | Date | null = active |

Index: `{ userId: 1, archivedAt: 1, sortOrder: 1 }`.

### habitLogs
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| habitId | ObjectId ref habits | required |
| date | String | `"YYYY-MM-DD"`, required |
| done | Boolean | default true |

Indexes: **`{ userId: 1, habitId: 1, date: 1 }` unique**, `{ userId: 1, date: 1 }` (grid),
`{ userId: 1, habitId: 1, date: -1 }` (streak / heatmap).

Write path is one idempotent `updateOne(..., { upsert: true })`; un-ticking deletes the row.

### checkins
One document per user per day. Morning and evening halves patch the same document.

| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| date | String | `"YYYY-MM-DD"`, required |
| intention | String | morning, one line, max 280 |
| mood | Number | **1–5**, optional — one value per colour-key square |
| energy | Number | **1–5**, optional |
| sleepHours | Number | hours, 0–24 in half-hour steps, optional — the third line on the history chart |
| moment | String | the memorable moment, optional, max 280 |
| completedGoalIds | `[ObjectId]` | ref goals — goals ticked during this check-in |
| completed | Boolean | default false — true once the evening flow is finished |

Indexes: **`{ userId: 1, date: 1 } unique`**, `{ userId: 1, date: -1 }`.

Every write is an **upsert against the unique index**, so two submissions on the same day update
one row rather than racing into two. Patch with `$set` on explicit paths only — never a
whole-document replacement — so a partial save cannot wipe a field it did not mention. `null` is
distinct from absent: absent leaves a field alone, `null` clears it. Without that, a one-tap mood
log would blank the moment you just typed.

Backfill is allowed for **14 days** (`BACKFILL_WINDOW_DAYS`); future dates are rejected in the
user's own timezone. `completedGoalIds` is applied through `goalService.setGoalCompleted`, never
re-implemented, so the completion date is stamped once in the user's timezone.

### learningProjects *(v2)*
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| title | String | required |
| description | String | optional |
| progress | Number | 0–100; manual override, null = derive from milestones |
| status | String enum | `active \| paused \| done`, default `active` |
| pastel | String enum | folder-tab identity color, assigned round-robin at creation |
| targetDate | String | `"YYYY-MM-DD"`, optional |
| archivedAt | Date | optional |

Index: `{ userId: 1, status: 1 }`.

### projectMilestones *(v2)*
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| projectId | ObjectId ref learningProjects | required |
| title | String | required |
| completedDate | String | `"YYYY-MM-DD"`, null = not done |
| sortOrder | Number | default 0 |

Index: `{ userId: 1, projectId: 1, sortOrder: 1 }`.

### resources *(v2 — holds both project resources and Vault items)*
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| title | String | required |
| url | String | optional — the source URL when there is one |
| summary | String | optional — LLM-extracted takeaway (Vault) or hand-written note |
| rawText | String | pasted caption/transcript or fetched text; retained for reprocessing |
| links | `[{ url, label }]` | resources mentioned inside the content |
| tags | `[String]` | lowercased; LLM-suggested + user-edited |
| source | String enum | `vault-url \| vault-paste \| manual-link \| manual-note` |
| platform | String enum | `instagram \| tiktok \| youtube \| web \| none`, optional |
| projectId | ObjectId ref learningProjects | optional — attach to a learning project |
| processingStatus | String enum | `pending \| ready \| failed` (Vault items only) |
| processingError | String | optional |

Indexes: `{ userId: 1, createdAt: -1 }`, `{ userId: 1, tags: 1 }`, `{ userId: 1, projectId: 1 }`,
and a **text index** on `{ title: 'text', summary: 'text', rawText: 'text', tags: 'text' }` for
Vault search.

### events *(v2)*
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| title | String | required |
| date | String | `"YYYY-MM-DD"` — next/only occurrence |
| recurring | String enum | `none \| weekly \| monthly \| yearly`, default `none` |
| reminderLeadDays | Number | default 1 |
| goalId | ObjectId ref goals | optional |
| notes | String | optional |
| lastRolledAt | Date | set by the rollover job |

Indexes: `{ userId: 1, date: 1 }`, `{ userId: 1, recurring: 1, date: 1 }`.

### pushSubscriptions
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | required |
| endpoint | String | required, **unique** |
| keys.p256dh / keys.auth | String | required |
| userAgent / timezone | String | optional |
| lastSuccessAt / lastFailureAt | Date | optional |
| failureCount | Number | default 0 |

Indexes: `{ endpoint: 1 }` unique, `{ userId: 1 }`.

---

## 4. REST API surface

Base `/api`, JSON only. Access token in `Authorization: Bearer`; refresh token in an
httpOnly/secure/SameSite=Lax cookie. Every route except auth requires a valid access token and
scopes by `req.userId`.

Envelope: `{ data }` on success, `{ error: { code, message, details? } }` on failure.

### Auth
```
POST   /auth/register        { email, password, name?, timezone? }
POST   /auth/login           { email, password } → { accessToken, user } + refresh cookie
POST   /auth/refresh         (cookie) → new access + rotated refresh
POST   /auth/logout          revoke current refresh token
GET    /auth/me              → user + settings
PATCH  /auth/me              { name?, timezone?, theme?, reminderTime?, remind* }
```

### Goals *(v1)*
```
GET    /goals?horizon=&status=active|done|overdue&parentGoalId=
GET    /goals/today                  daily goals + anything due today (check-in screen)
GET    /goals/:id                    → goal + parent chain + children + { completedChildren, totalChildren, progressPercent }
POST   /goals
PATCH  /goals/:id                    incl. currentValue for measurable goals
POST   /goals/:id/complete           { completed: boolean }
DELETE /goals/:id                    detaches children; does NOT cascade
```

### Habits *(v1)*
```
GET    /habits?includeArchived=false
POST   /habits            PATCH /habits/:id          POST /habits/:id/archive
GET    /habits/grid?from=YYYY-MM-DD&to=YYYY-MM-DD    → habits × days matrix (one aggregation)
GET    /habits/:id/heatmap?month=YYYY-MM
GET    /habits/:id/streak                            → { current, longest }
POST   /habit-logs        { habitId, date, done }    idempotent upsert / delete
```

### Check-ins *(v1)*
```
POST   /checkins        { date?, intention?, mood?, energy?, sleepHours?, moment?,
                          completedGoalIds?, completed? }   upsert; date defaults to today
GET    /checkins/today                   → today's doc, or { date, exists: false }
GET    /checkins/:date                   → that day's doc, or an empty shell
GET    /checkins?month=YYYY-MM           → the month, oldest first (charts + moments)
```

One POST serves the whole ritual — the evening sheet's Done, a one-tap mood log, and a backfill
all take the same path, so there is exactly one place the day could be duplicated and the unique
index makes sure it isn't. Emits `checkin:changed`.

### History *(v1)*
```
GET    /history?month=YYYY-MM   → ONE batched read for the whole screen:
                                   { month, days[], series{habits,sleep,tasks,mood,energy}[],
                                     heatmap[{date,done,total}], moments[{date,moment}], futureFrom }
                                   Every series uses null for a day with no row — never zero-filled.
                                   Relies on goals { userId, completedDate }.
```

### Push *(v1)*
```
GET    /push/vapid-public-key   → { publicKey }   UNAUTHENTICATED — public by design
GET    /push/status             → { subscribed, deviceCount, endpoints[] }
POST   /push/subscribe          PushSubscription.toJSON() + { userAgent?, timezone? }
DELETE /push/subscribe          { endpoint }
```

**The upsert key is `endpoint`, not `userId`.** A push endpoint is issued to one browser profile on
one device, so it is already globally unique; a user with a phone and a laptop legitimately owns two
rows. Keying on the user would silently drop a device every time you subscribed on another one.
Re-subscribing reassigns `userId`, so a shared device follows whoever subscribed last — otherwise
the next push to it would reach the wrong person.

The VAPID **public** key is served rather than baked into the web bundle, so regenerating the
keypair does not require rebuilding the client; a mismatch there produces subscriptions the server
can never push to. The private key never leaves the API process.

No send endpoint yet — dispatch is the worker's job (Prompt 2.2).

### v2
```
GET|POST         /projects              PATCH|DELETE /projects/:id
GET              /projects/:id          → project + milestones + resources + progressPercent
GET|POST         /projects/:id/milestones
PATCH|DELETE     /milestones/:id        POST /milestones/:id/complete
POST   /vault                           { source, url?, rawText? } → 202 + pending resource
POST   /vault/:id/reprocess
GET    /resources?q=&tag=&projectId=&source=&page=
GET|PATCH|DELETE /resources/:id
GET|POST         /events                PATCH|DELETE /events/:id
GET    /events/upcoming?days=90         → next occurrences + day counts
```

Cross-cutting: `helmet`, `cors` allowlist, `express-rate-limit` (tight on `/auth/*`), Zod
validation middleware sourcing schemas from `packages/shared`, a central error handler mapping to
the error envelope with only 5xx reported to Sentry, and `GET /healthz`.

---

## 5. BullMQ jobs

Redis is shared by `api` (producer) and `worker` (consumer). Queue names live in
`packages/shared`.

**One repeatable sweep, not a cron per user.** A single job on the `reminders` queue runs every
`SCAN_INTERVAL_MINUTES` (default 5) and asks each scanner what is due *right now, in each user's own
zone*. Per-user schedules would mean N crons to create, update and tear down every time a setting
changed; the sweep has no state to drift.

| Scanner | Local slot | Window | Fires when | jobId |
|---|---|---|---|---|
| check-in | user's `reminderTime` | 15 min | today's check-in `completed` is false | `checkin-reminder:{userId}:{day}` |
| goal due (1) | `09:00` local | 30 min | exactly one `active` goal has `dueDate` == today | `goal-reminder:{goalId}:{day}` |
| goal due (2+) | `09:00` local | 30 min | two or more — one digest replaces them | `goal-digest:{userId}:{day}` |
| streak at risk | `22:00` local | 30 min | check-in unfinished **and** a run ≥ 2 days | `streak-risk:{userId}:{day}` |
| events *(3.3)* | — | — | inert scaffold; returns nothing until events exist | `event-reminder:{eventId}:{day}` |

| Queue | Job | Schedule | Does |
|---|---|---|---|
| `reminders` | `scan-checkin-reminders` | repeatable, every 5 min | Runs **all** scanners; enqueues `send-push` per hit |
| `push` | `send-push` | on demand | `web-push` to every subscription of the user; prunes 404/410 |
| `maintenance` | `roll-recurring-events` *(v2)* | repeatable, daily 00:30 UTC | Advances past-dated recurring events to their next occurrence |
| `vault` *(v2)* | `process-resource` | on demand | Best-effort URL fetch → LLM extraction → fills `summary`, `links`, `tags` → `processingStatus` |

Every scanner is a **pure read that returns jobs** — it never touches Redis. That is what makes the
timezone and idempotency rules testable without any queue infrastructure, which matters because they
are the two things most likely to be wrong.

**Midnight wrap.** A reminder's `day` is the day the *slot* belongs to, not the day the scan ran. A
23:58 reminder swept at 00:01 is still yesterday's — otherwise the jobId would change at midnight and
the user would be notified twice for one reminder.

**No empty pushes.** Scanners only consider users who have at least one stored subscription and the
relevant toggle on, so a job is never enqueued that would deliver nothing.

Defaults on every job: `attempts: 5`, `backoff: { type: 'exponential', delay: 5000 }`,
`removeOnComplete: { count: 100 }`, `removeOnFail: { count: 500 }`.

**Idempotency:** deterministic `jobId`s (`checkin-reminder:{userId}:{YYYY-MM-DD}`) so a repeated
scan can't double-send. Repeatable jobs are declared once at worker boot and **reconciled** (stale
repeat keys removed) rather than blindly re-added.

**Timezone correctness** is the hard part: every scan compares against each user's IANA
`timezone`, never server time.

---

## 6. Socket.IO events

One room per user: `user:{userId}`. Handshake auth via the access token; unauthenticated sockets
are rejected. The API emits after each successful write so other devices update without refetching.

Server → client (names in `packages/shared/SOCKET_EVENTS`):

```
goal:created      goal:updated      goal:deleted      goal:completed
habit:created     habit:updated     habit:archived
habitLog:changed   { habitId, date, done }
checkin:changed    { date, checkin }
project:updated    milestone:updated                    (v2)
resource:processed { id, processingStatus }              (v2)
event:updated                                            (v2)
push:test
```

Client → server: nothing but the implicit join. **All writes go through REST**, so there is one
validation path; sockets are a read/notify channel only.

Client behavior: on an event, patch the TanStack Query cache with `setQueryData` — do not
blanket-invalidate. Writes are optimistic; the socket echo confirms.

---

## 7. Frontend structure

```
apps/web/
├── app/
│   ├── layout.tsx              # paper surface, fonts, theme, providers
│   ├── manifest.ts
│   ├── sw.ts                   # Serwist: precache + push + notificationclick
│   ├── (auth)/login|register/
│   └── (app)/
│       ├── page.tsx            # Today — pixel vignette header, intention, habit row, goals
│       ├── checkin/            # morning + evening ritual
│       ├── goals/[horizon]/    # + goals/[horizon]/[id] for detail
│       ├── habits/
│       ├── history/            # multicolor vitals chart, heatmap, moments
│       ├── projects/           # v2 — folder tabs
│       ├── vault/              # v2
│       ├── events/             # v2
│       └── settings/           # reminder time, theme, push gate, account
├── components/
│   ├── paper/                  # DotGrid, PaperSheet, HairlineRule, FileTag, SerifHeading
│   ├── habit/                  # HabitGrid, XMarkCell, HabitHeatmap
│   ├── charts/                 # VitalsChart, JaggedLine, MonthAxis, ColorKey  (hand-rolled SVG)
│   ├── mood/                   # ColorKeySquares (log + read-only)
│   ├── goals/                  # GoalRow, HorizonTabs, ProgressRule, StatusFilter
│   ├── folder/                 # FolderTab, FolderStack   (v2 projects)
│   ├── pixel/                  # PixelGlyph, PixelVignette
│   └── ui/                     # Button, Sheet, Stepper, TagInput, EmptyState
├── lib/
│   ├── api.ts                  # typed fetch wrapper, refresh-on-401 retry
│   ├── socket.ts               # singleton client + cache patching
│   ├── push.ts                 # permission + subscribe + POST
│   └── query.ts                # TanStack Query config
└── styles/tokens.css           # DESIGN.md §2 — the only place hex values live
```

Server state lives in TanStack Query; ephemeral UI state in `useState`. No global store.

---

## 8. Android PWA + push flow

### Install
- `app/manifest.ts`: `display: "standalone"`, `start_url: "/"`, maskable 192/512 icons,
  `theme_color` = `--paper` (`#F0EDE3`), `orientation: "portrait"`.
- Serwist service worker at `app/sw.ts`: precache the shell, `NetworkFirst` for API GETs,
  `CacheFirst` for fonts/icons. **Never cache mutations.**
- Custom install prompt: capture `beforeinstallprompt`, stash the event, show a quiet one-line
  paper banner. Detect installed state via
  `window.matchMedia('(display-mode: standalone)')`.

### Push subscription — order matters
1. App **installed and opened** → only then show the reminder card. Never on first paint, never on
   a cold browser visit.
2. Tap "Turn on reminders" → `Notification.requestPermission()`.
3. On grant → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })`, where `key` comes from `GET /push/vapid-public-key`.
4. `POST /api/push/subscribe` with `{ endpoint, keys: { p256dh, auth }, userAgent, timezone }`.
5. Server upserts on the unique `endpoint`. One user, many devices.
6. `pushsubscriptionchange` in the SW → re-subscribe and re-POST.

The client models this as an explicit state machine (`lib/push.ts`): `UNSUPPORTED`,
`NOT_INSTALLED`, `INSTALLED_NO_PERMISSION`, `PERMISSION_DENIED`, `SUBSCRIBED`, `ERROR`. **The server
is the authority on `SUBSCRIBED`** — a browser can hold a subscription the server never received, and
the UI must not claim reminders are on when nothing will ever be sent. Standalone is detected via
`display-mode` **and** `navigator.standalone`, so the check does not depend on one signal.

### Dispatch
Worker → `web-push.sendNotification(sub, payload)`.
- `404` / `410 Gone` → delete the subscription (dead device).
- `429` / `5xx` → let BullMQ retry with backoff.
- SW `push` → `showNotification` with a **tag per reminder kind**, so an unread evening reminder is
  replaced rather than stacked.
- SW `notificationclick` → focus an existing client if one exists, else `openWindow` the deep link
  (`/checkin`, `/goals/:id`, `/events`).

The client only ever sees the VAPID **public** key, and fetches it from the API rather than holding
it as a build-time constant — so `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is no longer needed in apps/web.

---

## 9. Env / secrets checklist

`.env.example` at the root; per-app `.env` files gitignored. Validate with Zod at boot and exit
non-zero on a missing var.

### apps/api
```
NODE_ENV=            PORT=4000
MONGODB_URI=
REDIS_URL=
JWT_ACCESS_SECRET=       JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=      JWT_REFRESH_TTL=30d
CORS_ORIGIN=http://localhost:3000
VAPID_PUBLIC_KEY=        # served to the client via GET /push/vapid-public-key
VAPID_PRIVATE_KEY=       # SERVER ONLY — never shipped, never logged
VAPID_SUBJECT=mailto:you@example.com
SENTRY_DSN=              LOG_LEVEL=info
```

### apps/worker
```
NODE_ENV=
MONGODB_URI=
REDIS_URL=
VAPID_PUBLIC_KEY=        VAPID_PRIVATE_KEY=      VAPID_SUBJECT=
SENTRY_DSN=              LOG_LEVEL=info
LLM_API_KEY=             # v2 Vault extraction — unset until Phase 3
LLM_MODEL=               # v2
```

### apps/web
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_SENTRY_DSN=
```

No VAPID key here: the client fetches the public one from `GET /push/vapid-public-key` at subscribe
time, so the two can never drift out of sync.

VAPID keys: `npx web-push generate-vapid-keys`, or `webpush.generateVAPIDKeys()`. JWT secrets:
`openssl rand -base64 48`. **`VAPID_PRIVATE_KEY` is server-only and must never reach the client** —
it is what authenticates this server to the push service; anyone holding it can send notifications to
your users. Never commit a real `.env`.

---

## 10. Conventions

- TypeScript `strict`; no `any` in committed code; no non-null `!` without a comment.
- API layering: `routes/ → controllers/ → services/ → models/`. Controllers never touch Mongoose
  directly; services hold the rules (rollup math, streaks, cycle checks, next-occurrence).
- Zod-validate every body and query at the route edge, from `packages/shared`.
- Winston: JSON in production, pretty in dev, `requestId` on every line. Typed
  `AppError(code, status, message)`; only 5xx reaches Sentry.
- Dates: **never** build a day key from a bare `new Date()` on the server — always
  `toDayKey(now, user.timezone)` from `packages/shared`.
- Tests: Vitest. Priority coverage — goal rollup + cycle validation, streak math, day-key/timezone
  helpers, check-in upsert idempotency, reminder scan windows, next-occurrence math.

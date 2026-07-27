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
│   └── shared/               # TS types, Zod schemas, day-key utils, constants
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

Rule: **no app imports from another app.** `web` never imports from `api`.

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
`{ userId: 1, dueDate: 1 }`.

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
| intention | `[String]` | morning, max 5 lines |
| mood | Number | 1–10, optional (logged via the color-key squares) |
| energy | Number | 1–10, optional |
| sleep | Number | hours, optional — the third line on the history chart |
| moment | String | the memorable moment, optional, max 280 |
| completed | `[ObjectId]` | ref goals — goals ticked during this check-in |
| morningLoggedAt / eveningLoggedAt | Date | optional |

Indexes: **`{ userId: 1, date: 1 } unique`**, `{ userId: 1, date: -1 }`.

Patch with `$set` on explicit paths only — **never** whole-document replacement, so saving one
half cannot wipe the other.

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
GET    /checkins/:date                   → the day's doc, or an empty shell
PUT    /checkins/:date/morning           { intention }
PUT    /checkins/:date/evening           { mood?, energy?, sleep?, moment?, completed? }
GET    /checkins?month=YYYY-MM           → the month (charts + moments)
GET    /checkins/moments?month=YYYY-MM   → memorable moments only
```

### History *(v1)*
```
GET    /history/vitals?month=YYYY-MM     → [{ date, mood, energy, sleep }] for the multicolor chart
GET    /history/summary?month=YYYY-MM    → checkin count, habit completion %, goals done, moments count
```

### Push *(v1)*
```
POST   /push/subscriptions      { endpoint, keys, userAgent?, timezone? }   (upsert on endpoint)
DELETE /push/subscriptions      { endpoint }
POST   /push/test               send a test notification to all of this user's devices
```

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

| Queue | Job | Schedule | Does |
|---|---|---|---|
| `reminders` | `scan-checkin-reminders` | repeatable, every 5 min | Users whose **local** time matches `reminderTime` (± window) and whose today's `eveningLoggedAt` is unset → enqueue `send-push` |
| `reminders` | `scan-goal-reminders` | repeatable, daily 08:00 UTC | Active goals with `dueDate` == today (user-local) → `send-push` |
| `reminders` | `scan-event-reminders` *(v2)* | repeatable, daily 08:00 UTC | Events where `date − reminderLeadDays` == today → `send-push` |
| `push` | `send-push` | on demand | `web-push` to every subscription of the user; prunes 404/410 |
| `maintenance` | `roll-recurring-events` *(v2)* | repeatable, daily 00:30 UTC | Advances past-dated recurring events to their next occurrence |
| `vault` *(v2)* | `process-resource` | on demand | Best-effort URL fetch → LLM extraction → fills `summary`, `links`, `tags` → `processingStatus` |

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
checkin:updated    { date, half: 'morning' | 'evening', checkin }
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
│       ├── goals/[horizon]/    # + goals/[id]
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
3. On grant → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY) })`.
4. `POST /api/push/subscriptions` with `{ endpoint, keys: { p256dh, auth }, userAgent, timezone }`.
5. Server upserts on the unique `endpoint`. One user, many devices.
6. `pushsubscriptionchange` in the SW → re-subscribe and re-POST.

### Dispatch
Worker → `web-push.sendNotification(sub, payload)`.
- `404` / `410 Gone` → delete the subscription (dead device).
- `429` / `5xx` → let BullMQ retry with backoff.
- SW `push` → `showNotification` with a **tag per reminder kind**, so an unread evening reminder is
  replaced rather than stacked.
- SW `notificationclick` → focus an existing client if one exists, else `openWindow` the deep link
  (`/checkin`, `/goals/:id`, `/events`).

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is the only VAPID value the client ever sees.

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
VAPID_PUBLIC_KEY=        VAPID_PRIVATE_KEY=      VAPID_SUBJECT=mailto:you@example.com
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
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
NEXT_PUBLIC_SENTRY_DSN=
```

VAPID keys: `npx web-push generate-vapid-keys`. JWT secrets: `openssl rand -base64 48`. Never
commit a real `.env`; never expose the VAPID private key or the LLM key to the client.

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

# Command Center — architecture

One application, three workspaces (Personal, TPS Business, Creative Lab), one data model.
This document describes how it fits together. Deployment: [DEPLOY.md](DEPLOY.md).

## 1. Shape of the app

```
App shell (Sidebar + workspace switcher + ⌘K + editors/drawers)
├── Mission  /home(/goals)   mission screen (modules) · focus mode · goals
├── School     /school/*     overview · exams · homework · grades · subjects
├── Fitness    /fitness/*    today · logger(/:id) · routines · progress · bodyweight
├── Money      /money/*      overview · ledger · split · subscriptions · savings
├── Personal   /personal/*   today · calendar · tasks · plan tomorrow · weekly planning
├── TPS        /tps/*        overview · clients(/:id/:tab) · deliverables(/:id) · studio(/:client/:tab) · pipeline · content · scorecard · integrations
├── Lab        /lab/*        overview · planner · analyses(/:id) · library(/:id) · insights(/:id) · history
├── Cue        /cue/*        team · runs · approvals                                  (CC2)
├── Knowledge  /knowledge/*  brain(/:id) · inbox · canvas(/:id) · universe            (CC2)
├── My Space   /me/*         overview · vision · journal · achievements · letters · travel · affirmations · focus (CC2)
├── Home extra /home/*       analytics · timeline                                     (CC2)
└── Settings   /settings
```

* **Routing** — hash routes `#/<space>/<page>/<id>/<sub>` (`src/store/ui.ts`). Hash routing keeps the app
  deployable as static files and working inside embeds. Each workspace remembers its last page.
* **Navigation** — workspace switcher (top-left), contextual sidebar per workspace, "Shared" links
  (Today/Tasks/Calendar) from every workspace, `G` then `H/P/B/L` to switch, `1–6` for pages,
  ⌘K for global search + quick capture. Phones get a workspace bar with page chips and a bottom
  nav (Home · Today · Capture · TPS · Lab).

## 2. Data model

All entities live in one persisted store (`src/store/app.ts`, types in `src/domain/entities.ts`).
**Every record exists exactly once.** Relationships are ids or *entity refs* (`"type:id"`, see
`src/domain/refs.ts`), never copies.

| Entity | Owns | Links |
| --- | --- | --- |
| Task | title, due, priority, category, estimate | `link` → client / project / deliverable / lead |
| CalEvent | time block, recurrence | `link` → any actionable entity (task, deliverable, analysis…) |
| Client → Project → Deliverable | agreed work, quantity, stage, due, feedback, history | deliverable `insightIds` (mirror of insight links) |
| Stage | user-named workflow step | `kind` ∈ backlog · working · internal_review · client_review · revisions · approved |
| Opportunity | pipeline lead, touches (outreach, follow-up, call, proposal, note) | `clientId` once won |
| AdRef | swipe-library item, tags, media ids (IndexedDB) | — |
| Analysis | structured/quick notes, timestamps, status | `adId`, `planId` |
| PracticePlan / PracticeTemplate | weekly target, focus | analyses via `planId` |
| Insight | reusable lesson | `links: Ref[]` → ads, analyses, insights, deliverables |
| Metric / WeekScore | definition / per-week snapshot of targets + manual values | — |
| FocusLog | logged focus minutes | `occurrenceKey` (dedupe), `link` |
| ActivityEntry | append-only history | `ref` |
| Countdown | date that matters | — |
| Proposal | planner/AI change set (`items` with `undo`), pending → applied/rejected | refs of touched events |
| Subject / Exam / Assignment / Grade | school; exam `size` big/small, `pace` set by you | `subjectId` |
| Exercise / Routine / WorkoutSession / BodyweightEntry | training; built-in exercises `exb-*` | `routineId`, `exerciseId` |
| Transaction / MoneyAccount / Subscription / SavingsGoal / AllocationMove | private money planner; amounts converted to EUR at your saved rates | `clientId` for business income |
| Goal | horizon + period + measure (manual, milestones, revenue, savings, lift, bodyweight, grade, metric) | measure ids |
| Board | named set of swipes | `adIds`, optional `clientId` → “Reference ads” context |

### Derived, never stored

* **Work items** (`src/domain/workItems.ts`) — a unified "what's actionable" list built from tasks,
  deliverables where the ball is in *your* court, planned analyses, and pipeline follow-ups. Tasks,
  Home, top three, Plan Tomorrow and the calendar's "For" field all read this. Ticking a work item
  updates its source record (`toggleWorkItem` in `src/lib/work.ts`): a deliverable moves to the
  first "done — not sent" stage, an analysis is marked done, a follow-up logs a touch.
* **Top three** stores refs per date, so a priority can be a task, a deliverable or a practice item.
* **Client health** and **attention lists** are computed from deliverables (`src/features/tps/hooks.ts`).

### Deliverable states stay separate

Stage changes go through one pure function, `moveDeliverable` (`src/domain/stages.ts`), which sets
one-time timestamps:

* `completedAt` — first time it reached internal review or later ("my part is done")
* `firstDeliveredAt` / `lastDeliveredAt` — sent to the client
* `revisionRounds` — incremented on entering revisions
* `approvedAt` — first approval

Users can rename/add/reorder stages; the app only reasons about the stage *kind*.

### Scorecards

* Auto metrics read exactly **one timestamp per record** (`metricActual` in `src/domain/metrics.ts`),
  so nothing counts twice: concepts delivered = `firstDeliveredAt` × quantity; re-sending after
  revisions doesn't count again. Practice = `analysis.completedAt`. Effort hours = `FocusLog`s,
  de-duplicated per calendar occurrence.
* Each week gets a **snapshot** of targets the first time it's viewed after it starts. Changing a
  metric's default only affects weeks without a snapshot. Archiving removes a metric from the
  running week onward; past weeks keep it.
* Carry-over adds last week's shortfall (capped at one week's target) for metrics that opt in.
* Output vs effort is a property of each metric.

## 3. Client knowledge, AI Studio and the creative chain (V3)

* **Client workspace** tabs: Overview · Brand (13 structured sections) · Research (draft/approved,
  origin manual/AI/Manus/MCP) · Assets (uploads with previews, links) · Feedback (revision/approval
  log per deliverable) · Performance (manual metrics + verdicts → insights) · Activity.
* **Context packs** (`src/domain/context.ts`, shared by the app and the MCP server) assemble exactly
  what an AI sees for a client. Only *approved* research is included unless explicitly selected.
  The Studio shows the full prompt before anything leaves the app.
* **Workflows** (`src/domain/aiWorkflows.ts`): 10 built-ins with editable templates
  (`{{client}}`, `{{context}}`, `{{input.key}}`). Outputs are stored as `aiOutputs` drafts and can
  become research drafts, concepts, deliverables, tasks or notes; `savedAs` records where they went.
  Nothing is ever sent to a client.
* **Chain**: Ad → Analysis → Insight (`links`) → Concept (`insightIds`) → Deliverable
  (`deliverableId`). `insightChain` (`src/domain/chain.ts`) takes the union of direct and
  concept-mediated deliverables, so applied-work counts never double up.

## 3b. V4: mission, planner and life areas

* **Pure domain modules, shared by app and Worker**: `mission.ts` (risks, countdowns), `planner.ts`,
  `school.ts`, `fitness.ts` (e1RM/Epley, double progression, PRs), `money.ts` (month summary,
  split buckets, CSV parsing), `goals.ts` (period math, progress + status vs elapsed time).
* **Planner** — demands (exam pace, ongoing subjects, routine days) → free slots from
  `expandEvents` with buffers → proposals with content-addressed ids (idempotent reruns). Safety:
  only `origin:'planner'`, local, unlocked events are ever moved or removed. In the app it runs on
  change (`lib/plannerRunner.ts`); on the server nightly from 03:00 and on `POST /api/planner/run`.
  Same-day clashes apply immediately with undo data; the rest waits as one pending proposal.
* **Briefs** — morning: at-risk, planned blocks, heads-ups, what the planner moved/needs review.
  Evening: pending changes count. Both respect shutdown.
* **Privacy** — Money and grades are off for AI by default (MCP area permissions `school`, `grades`,
  `fitness`, `money`, enforced in `visible()`); goals measured by money/grades read “(private)”.
  *Hide amounts* is device-local (`LOCAL_SETTINGS`), never synced.
* **Swipe vault** — capture via `/?url=…` (iPhone Shortcut) or the PWA share target, read once in
  `boot.ts` then stripped from the URL; duplicates by normalised URL; media in R2 when enabled
  (`cloud:<key>` ids cached in IndexedDB), else device-local.

## 3c. Command Center 2.0

* **Navigation** — `SECTIONS` in `src/components/layout/nav.ts` maps the flat sidebar
  (Home, Cue, Today, Clients, Acquisition, Projects, Creative Lab, Content, Knowledge, Calendar, Life group)
  onto the existing `space/page` routes; `sectionFor()` picks the active section and its page tabs.
* **New collections** (`src/domain/entities2.ts`, synced like every other array collection, no
  migration): visionBoards, journal, achievements, snapshots, futureLetters, places, affirmations,
  playlists, focusSessions, dayRoutines, routineRuns, agentRuns, approvals, knowledgeDocs, captures,
  contacts, meetings, decisions, onboardings, portfolio, appDrafts, canvases.
* **Pure domain modules** shared by app and Worker: `knowledge2.ts` (Business Brain items + ranked
  search with client isolation and private exclusion), `analytics.ts`, `timeline.ts`, `graph.ts`
  (graph + deterministic force layout).
* **Cue boundary** — agents run in Manus. Command Center stores requests (`agentRuns`) and approvals;
  the MCP tools let an agent pick up work, report output, ask for approval and report execution.
  Approval is a recorded decision, never an execution; `cue_report_execution` is refused unless the
  request was approved, and only once.
* **Privacy** — the MCP `visible()` filter empties all My Space collections and captures, drops private
  knowledge documents and applies the hidden-client filter to the new collections.
* **Zustand rule** — never return a new array (filter/map/sort) from a `useApp` selector; select the raw
  array and derive with `useMemo`, otherwise React re-renders forever.

## 4. Persistence and sync

Two data sets, chosen per device (`src/store/mode.ts`):

| Mode | Store key | Contents | Synced |
| --- | --- | --- | --- |
| Local / demo | `command-center:v1` | V1/V2 data and sample data | no |
| Account | `command-center:account` | your real data; starts empty, demo blocked | yes |

* Store schema **version 3**; `migrateState` runs v1 → v2 → v3 (deliverable feedback becomes
  `FeedbackEntry` records, workflows seeded). Covered by tests.
* **Import wizard** (`src/lib/migration.ts`, Settings → Account & sync) reads the local store
  without modifying it, excludes demo records by default, offers a JSON backup, and seeds the
  account store.
* **Sync** (`src/lib/sync.ts`, shared mapping in `src/domain/syncSchema.ts`): every array item,
  map entry and config singleton is one server record with a monotonically increasing revision.
  The client keeps `[rev, hash]` per record from the last sync, pulls changes since its revision
  (skipping records it has edited but not pushed), then pushes everything whose hash changed with
  the revision it was based on. The server resolves concurrent edits last-writer-wins by change
  time and stores the loser in `conflicts` (restorable from Settings). Offline edits stay local and
  sync on reconnect/focus/every minute.
* Files: account mode uploads to R2 (`/api/files`, served sandboxed); local mode and deployments
  without R2 keep media in IndexedDB (`src/lib/media.ts`).
* Backups: local JSON export/import (version 3, older versions migrated) and a server export of
  every record (`/api/export`).

## 5. Backend (`server/`, Cloudflare Worker)

| Module | Responsibility |
| --- | --- |
| `index.ts` | Hono routes, session middleware, OAuth provider wiring, scheduled handler |
| `auth.ts` | owner password → HttpOnly session cookie (60 days), login rate limit (8 failures / 15 min / IP) |
| `records.ts` | revisioned record store, conflict logging, server-side writes (MCP) |
| `mcp.ts` | MCP JSON-RPC over Streamable HTTP; scoped tools; permission, area and hidden-client checks. V4 tools: `get_school_overview`, `get_grades`, `get_fitness_overview`, `get_money_summary`, `get_goals`, `search_swipes`, `save_swipe` |
| `google.ts` | server OAuth (refresh token AES-GCM encrypted), calendar selection, incremental sync, confirmed writes |
| `push.ts`, `cron.ts` | VAPID Web Push (payload-free), 07:00 brief and evening reminder (never after shutdown), nightly planner run |
| `ai.ts`, `manus.ts` | optional paid API calls, usage + integration logging |

**MCP security**: OAuth 2.1 with PKCE and dynamic client registration
(`@cloudflare/workers-oauth-provider`); the owner signs in and approves each client on a consent
page; scopes `mcp:read` / `mcp:write`. Write tools need `mcp:write` *and* the "Allow saving drafts"
toggle; `update_deliverable_status` additionally needs the "status changes" toggle and a second
call with `confirm: true` after a preview. Every call is logged; grants are listed and revocable.

**Never in the browser**: OAuth client secrets, refresh tokens, API keys, VAPID private key — all
are Worker secrets. The browser only holds the session cookie.

## 6. Tests

* `npm test` — vitest: stage transitions, metric counting, snapshots/carry-over, pace, work items,
  availability, migrations v1→v2→v3, sync schema round-trip/diff, sync hashing, creative-chain
  counting, demo-free import, cross-links on delete, demo removal, backup round-trip.
* `npm run test:e2e` — Playwright smoke test of the UI across all three workspaces, persistence,
  and mobile layouts.
* `npm run test:v3` — V3 workflows: brand intel, research + upload, AI context → deliverable,
  task from deliverable, scheduling, reload, export/erase/recover, Google edit/delete guard.
* `npm run test:v4` / `test:school` / `test:fitness` / `test:money` / `test:goals` / `test:vault` —
  V4 areas end to end (mission modules, planner proposals + undo, focus mode, exam pacing, logger
  progression, CSV import + split, goal tracking, phone capture + boards).
* `npm run test:cc2` — CC2 end to end: dashboard, affirmations (simulated speech), journal, sealed
  letters, Cue hand-off, approve-with-edit, Business Brain add + search, capture filing, projects,
  canvas → task, universe/analytics/timeline, phone overflow.
* `npm run test:server` — API + MCP against `wrangler dev`: auth, sync + conflicts, files, OAuth
  (DCR + PKCE + consent), tools, permissions, revocation, push queue, unconfigured providers,
  Cue run + approval flow, Business Brain isolation/privacy/versioning, opportunity dedupe, content drafts.
* `npm run test:sync` — two browsers (Mac + iPhone viewport): import wizard, cross-device sync,
  offline conflict + restore, demo blocked in the account.

## 7. Decisions and risks

| Decision / risk | Why / mitigation |
| --- | --- |
| Cloudflare Worker + D1 instead of Supabase | One deployable unit serving app + API + MCP + cron on a free plan; the pure domain layer is shared by both sides. |
| Single owner, password auth | It's a personal system. No multi-tenant model, no billing. Rate-limited login, HttpOnly cookie. |
| Last-writer-wins per record | Simple and predictable at one-person scale; the losing version is always kept and restorable. |
| Free-plan CPU limit (10 ms/request) | Fine for normal use; Workers Paid ($5/mo) if very large data ever trips it. |
| Google consent in "Testing" | Refresh tokens expire after 7 days; publish the consent screen (unverified is fine for yourself). |
| Manus API shapes | From public docs, not yet verified against a live account. |
| ChatGPT write access by plan | Unclear for Plus/Pro in developer mode; read tools work regardless. |

## 8. Integrations

See TPS → Integrations in the app (live status from the server). Google Calendar, MCP (Claude and
ChatGPT), Claude/OpenAI API and Manus are built; Upwork (GraphQL API, key application, scopes fixed
at registration, 24h caching limit) and X (pay-per-use since Feb 2026) are researched with manual
tracking in Pipeline and the Content planner. Nothing ever sends proposals, posts or messages
automatically.

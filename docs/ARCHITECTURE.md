# Command Center — architecture

One application, three workspaces (Personal, TPS Business, Creative Lab), one data model.
This document describes how it fits together and what production needs.

## 1. Shape of the app

```
App shell (Sidebar + workspace switcher + ⌘K + editors/drawers)
├── Home                     cross-workspace snapshot
├── Personal   /personal/*   today · calendar · tasks · plan tomorrow · weekly planning
├── TPS        /tps/*        overview · clients(/:id) · deliverables(/:id) · pipeline · scorecard · integrations
├── Lab        /lab/*        overview · planner · analyses(/:id) · library(/:id) · insights(/:id) · history
└── Settings   /settings
```

* **Routing** — hash routes `#/<space>/<page>/<id>` (`src/store/ui.ts`). Hash routing keeps the app
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

## 3. Persistence

* Records: `localStorage` via zustand `persist` (`command-center:v1` key, schema **version 2**).
* Media (screenshots/videos): IndexedDB, downscaled on import (`src/lib/media.ts`).
* Migration v1 → v2 (`migrateState`): `event.taskId` → `event.link`, `task.eventId` dropped
  (the event owns the link), top-three ids → refs, new collections added. Covered by tests.
* Backup: Settings → Export/Import (`src/store/backup.ts`), versioned and migrated on import.
* Demo data: every sample record carries `isDemo`; "Remove demo data" deletes them and strips
  links that pointed at them. Starter metrics and stage definitions are configuration, not demo.

## 4. Tests

* `npm test` — vitest: stage transitions, metric counting, snapshots/carry-over, pace, work items,
  availability, migration, cross-links on delete, demo removal, backup round-trip.
* `npm run test:e2e` — Playwright smoke test of the real UI across all three workspaces, persistence,
  and mobile layouts (needs a running server; `BASE_URL=…`).

## 5. Decisions and risks

| Decision / risk | Why / mitigation |
| --- | --- |
| Vite SPA instead of Next.js | Everything runs client-side today; static build deploys anywhere and powers the single-file preview. When a backend is needed (Phase E) it can be a separate API/edge functions, or the app can move into Next.js without changing the domain layer. |
| One store, many slices | Simple and fast at personal scale (thousands of records). The domain layer (`src/domain`) is pure and portable to a server. |
| localStorage limits (~5 MB) | Media is in IndexedDB; activity log is capped at 800 entries. Cloud persistence removes the limit. |
| Single device | Data doesn't sync between Mac and iPhone until Phase E. Export/import is the stop-gap. |
| Google Calendar from the browser | Token model, no secret, access token in memory only. Server-side OAuth (refresh tokens) arrives with Phase E. |
| Deleting a client cascades | Projects/deliverables are deleted, every link to them is removed; requires a two-step confirm. |

## 6. Production (Phase E) — proposed, not built

Nothing here is deployed or paid for yet. Recommended path, all with free tiers — **confirm before
creating accounts**:

1. **Hosting**: static deploy (Vercel / Netlify / Cloudflare Pages). Gives HTTPS, a stable origin for
   Google OAuth, and installability (manifest is already in `public/`).
2. **Auth + database**: Supabase (Postgres + Auth + row-level security). Tables mirror
   `src/domain/entities.ts` one-to-one, each row with `user_id` and `updated_at`; RLS policy
   `user_id = auth.uid()`. Leaves room for team accounts later (`workspace_members`).
3. **Sync**: keep the local store as a cache (offline-first); push changes per record with
   `updated_at` last-write-wins, pull deltas on focus/realtime. Media → Supabase Storage.
4. **Backups**: managed Postgres backups + the existing JSON export.
5. **Morning briefing**: a scheduled function at 07:00 local time builds the text with
   `buildMorningBrief` (`src/domain/brief.ts`, already pure) and sends one Web Push (VAPID) to the
   installed PWA. iOS needs the app added to the home screen (iOS 16.4+). One notification a day,
   no per-task pings.
6. **Google Calendar as source of truth**: server-side OAuth with refresh tokens, incremental sync
   via `syncToken`, conflict rule "Google wins for Google events", never auto-delete.

## 7. Integrations (Phase F)

See TPS → Integrations in the app. Summary: Google Calendar is implemented; Upwork (GraphQL API,
key application, scopes fixed at registration, 24h caching limit) and X (pay-per-use since Feb 2026)
are researched, not built. Nothing will ever send proposals, posts or messages automatically.

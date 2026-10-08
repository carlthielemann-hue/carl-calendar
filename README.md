# Command Center

A personal operating system for school, The Profit Script (TPS), training, money and creative practice.
**One app, one mission screen, one execution system.** Less planning. More execution.

Desktop-first, dark by default, built for phones too. Works fully in the browser out of the box;
deploy the included Cloudflare Worker (free plan) to sync your real data between Mac and iPhone,
connect Google Calendar, get a 07:00 push brief, and let Claude/ChatGPT work with your data over MCP.

## Workspaces

| Workspace | Pages |
| --- | --- |
| **Mission** | Now / next · the mission (top three) · at risk · countdowns · this week · autopilot (planner changes, undo) · training · money · goals · clients · practice — modules can be hidden/reordered · **Focus mode** (fullscreen timer) · **Goals** (month / quarter / year, auto-tracked from your records) |
| **Personal** | Today · Calendar (day/week/month, recurrence, drag & resize) · Tasks (incl. items from TPS & Lab) · **Plan tomorrow** (5-minute evening flow with capacity check) · Weekly planning |
| **TPS Business** | Overview · Clients (health, per-state counts, next action) · Client workspace (overview, brand intelligence, research, asset library, feedback, performance & learnings, activity) · Deliverables board with configurable stages · **AI Studio** (10 client-aware workflows, exact-context preview, drafts → research/concepts/deliverables/tasks) · Pipeline (CRM-lite with touch log, Upwork links, proposal tracking) · X content planner · Weekly scorecard · Integrations (live status) |
| **School** | Overview · Exams (big/small, heads-up 21/10 days before, you set the pace) · Homework · Grades (points, averages) · Subjects (ongoing = daily study, or test-only) |
| **Fitness** | Today (quick weigh-in, start workout) · Logger (steppers, last time, double-progression suggestion, PRs) · Routines (splits, days) · Progress (e1RM curves, records) · Bodyweight (7-day average) |
| **Money** | Overview (month, savings rate, put-away status) · Ledger (quick add `−12.99 spotify`, CSV import from German banks, export) · Split (default 30% reserves / 50% invest / 20% spend, adjustable) · Subscriptions · Savings goals · *Hide amounts* per device |
| **Creative Lab** | Overview · Practice planner (Sunday flow, templates, calendar blocks) · Analyses (quick or deep, custom templates, video timestamps) · Swipe vault (platform/awareness/funnel fields, transcripts, boards, client reference boards, save-from-phone, duplicate check) · Insights (linked to ads, analyses and client deliverables) · Practice history |

**Autopilot planner** (`src/domain/planner.ts`): from exam paces, ongoing subjects and gym routines it places study/gym blocks into free time around your calendar. Only same-day clashes are fixed automatically (with Undo); everything else is a proposal you review in Plan tomorrow, the evening reminder and the morning brief. It only ever touches blocks it created itself — never your own or Google events, never locked blocks.

**Pop-ups and widgets**: push alerts (morning brief, evening planning, before blocks start, exams, still-open-today, renewals, Sunday planning, quiet hours), an app-icon badge, and iPhone home/lock-screen widgets via Scriptable with a read-only key — see [docs/DEPLOY.md](docs/DEPLOY.md#notifications-and-widgets).

Everything is connected, not copied: a planned analysis is one record that shows up in the Lab, in Tasks, on Home and (if scheduled) on the calendar, and counts toward the practice quota when done. A deliverable lives in its client project and appears in Tasks only when it's your move. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Keyboard

`⌘K`/`Ctrl K` search everything & quick add · `G` then `H` / `P` / `B` / `L` switch workspace · `1–6` pages · `N` new task · `E` new event · `?` all shortcuts.
Calendar: `T` today · `D`/`W`/`M` views · `←`/`→`. Tasks: `/` focus quick add.

## Your data: local/demo vs account

- **Local / demo** — the browser-only store. First open fills it with clearly labelled sample data.
- **Account** — your real data on your own server, synced across devices, offline-safe. It starts
  empty; demo data can't be added to it. Settings → Account & sync → **Set up account…** imports
  your existing browser data (demo excluded by default, backup offered, original left untouched).

Deploying the server: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Demo mode

On first open the app is filled with **sample data** (clearly labelled as demo): a weekday school timetable, TPS deep-work blocks, gym, basketball, rest, example tasks, sample clients/deliverables/leads (names marked “sample”), and a sample swipe library with analyses and insights. It's generated relative to the current week. Nothing in it is a real commitment.

Everything is editable and saved in this browser (`localStorage`, ad media in IndexedDB). Settings → Data lets you reset or remove the demo data, or export/import everything as JSON. Weekly targets start from editable starter metrics.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (deploy anywhere: Vercel, Netlify, GitHub Pages)
npm run build:single # one self-contained HTML file in dist-single/
```

Checks:

```bash
npm run typecheck
npm run lint
npm test             # domain + store unit tests (vitest)
npm run test:e2e     # headless Chromium end-to-end test against a running server (BASE_URL=…)
npm run test:v3      # V3 workflows end to end (BASE_URL=…)
npm run test:v4      # Mission, planner, focus mode — plus test:school, test:fitness, test:money, test:goals, test:vault, test:widgets (signed in, against the Worker)

# with the Worker running locally (npm run server:dev):
npm run test:server  # API, sync conflicts, files, MCP OAuth + permissions (NODE_TLS_REJECT_UNAUTHORIZED=0)
npm run test:sync    # run on a fresh local DB (rm -rf .wrangler/state) — two devices: import, sync, offline conflict + restore (BASE_URL=https://localhost:8787)
```

## Google Calendar (optional)

**With the server (recommended):** server-side OAuth, read-only by default, choose which calendars
to mirror, incremental sync every 15 minutes, Europe/Berlin. Editing needs a second explicit
consent and every change to an existing Google event asks for confirmation. Setup in
[docs/DEPLOY.md](docs/DEPLOY.md#4-google-calendar).

**Browser-only fallback:** Settings → Google Calendar with a public OAuth Client ID (Google
Identity Services, token in memory only, ≈1 hour). Authorise the origin you run the app at under
*Authorised JavaScript origins*. Doesn't work inside sandboxed embeds like the hosted preview.

Either way: syncing only reads; re-syncs can't duplicate (keyed by Google event id); demo data is
never uploaded; nothing is deleted or bulk-changed on connect.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS v4 · Radix primitives (shadcn-style components) · Lucide icons · Zustand (persisted, schema v3 with migrations) · date-fns · Sonner · Vitest · Playwright.
Server: Cloudflare Workers · Hono · D1 · R2 · KV · `@cloudflare/workers-oauth-provider` · `@anthropic-ai/sdk` (optional).

Calendar views are custom-built (no heavy calendar library) so they match the design and support drag/resize precisely.

```
src/
  domain/           entities, refs, stage transitions, metrics, work items, morning brief, demo (pure, tested)
  pages/            Home, Settings, personal/*, tps/*, lab/*
  features/         overview cards, calendar grids, tasks, events, tps/*, lab/*, scorecard, palette
  components/       app shell (workspace switcher, sidebars), ui primitives
  lib/              dates & recurrence, quick-add parser, Google clients, media, sync engine, import wizard, push, work-item glue
  store/            app state (persisted) + data mode + UI/routing state + backup
server/             Cloudflare Worker: API, sync, MCP, OAuth, Google, push, cron
migrations/         D1 schema
tests/              e2e (smoke, v3, sync) and server integration tests
docs/ARCHITECTURE.md · docs/DEPLOY.md
```

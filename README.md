# Command Center

A personal operating system for school, The Profit Script (TPS) and creative practice.
**One app, three workspaces, one execution system.** Less planning. More execution.

Desktop-first, dark by default, built for phones too. Runs fully in the browser — no account, no backend, no API keys needed.

## Workspaces

| Workspace | Pages |
| --- | --- |
| **Home** | Now / up next · top three (from any workspace) · client work needing attention · practice progress · weekly targets |
| **Personal** | Today · Calendar (day/week/month, recurrence, drag & resize) · Tasks (incl. items from TPS & Lab) · **Plan tomorrow** (5-minute evening flow with capacity check) · Weekly planning |
| **TPS Business** | Overview · Clients (health, per-state counts, next action) · Client workspace (projects, deliverables, units agreed/done/delivered/approved, tasks, links, history) · Deliverables board with configurable stages · Pipeline (CRM-lite with touch log) · Weekly scorecard · Integrations |
| **Creative Lab** | Overview · Practice planner (Sunday flow, templates, calendar blocks) · Analyses (quick or deep, custom templates, video timestamps) · Swipe library (search, tags, favorites, screenshots) · Insights (linked to ads, analyses and client deliverables) · Practice history |

Everything is connected, not copied: a planned analysis is one record that shows up in the Lab, in Tasks, on Home and (if scheduled) on the calendar, and counts toward the practice quota when done. A deliverable lives in its client project and appears in Tasks only when it's your move. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Keyboard

`⌘K`/`Ctrl K` search everything & quick add · `G` then `H` / `P` / `B` / `L` switch workspace · `1–6` pages · `N` new task · `E` new event · `?` all shortcuts.
Calendar: `T` today · `D`/`W`/`M` views · `←`/`→`. Tasks: `/` focus quick add.

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
```

## Google Calendar (optional)

The integration is implemented client-side with Google Identity Services + the official Calendar REST API. It needs only a public **OAuth Client ID** — no client secret, no server.

1. [Google Cloud Console](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) → create a project → enable **Google Calendar API**.
2. OAuth consent screen → External → add your Google account as a test user.
3. Credentials → Create OAuth client ID → **Web application** → add the URL you run the app at under *Authorised JavaScript origins* (e.g. `http://localhost:5173`).
4. Paste the Client ID in **Settings → Google Calendar** (or put it in `.env.local` as `VITE_GOOGLE_CLIENT_ID`) and click **Connect**.

How it behaves:

- **Sync is read-only.** Events from your primary calendar (−30 / +120 days, recurring series expanded by Google) are mirrored and replaced on each sync, keyed by Google event id — re-syncing can't create duplicates.
- Google is only changed when **you** create, edit, drag or delete a Google event. Editing one occurrence of a Google series changes only that occurrence.
- Demo data is never uploaded. Local events stay local unless you choose "Save to Google Calendar" when creating.
- Access tokens live in memory only (≈1 hour). After a reload use **Reconnect & sync**.
- Google sign-in won't work inside sandboxed embeds (like the hosted preview); run it from an origin you authorised.

## Stack

Vite · React 18 · TypeScript · Tailwind CSS v4 · Radix primitives (shadcn-style components) · Lucide icons · Zustand (persisted, schema v2 with migration) · date-fns · Sonner · Vitest · Playwright.

Calendar views are custom-built (no heavy calendar library) so they match the design and support drag/resize precisely.

```
src/
  domain/           entities, refs, stage transitions, metrics, work items, morning brief, demo (pure, tested)
  pages/            Home, Settings, personal/*, tps/*, lab/*
  features/         overview cards, calendar grids, tasks, events, tps/*, lab/*, scorecard, palette
  components/       app shell (workspace switcher, sidebars), ui primitives
  lib/              dates & recurrence, availability, quick-add parser, Google client, media (IndexedDB), work-item glue
  store/            app state (persisted) + UI/routing state + backup
docs/ARCHITECTURE.md
```

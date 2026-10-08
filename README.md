# Command Center

A personal command center for school, TPS client work, training and life.
**Less planning. More execution.**

Desktop-first, dark by default, works on mobile. Runs fully in the browser — no account, no backend, no API keys needed.

## What's inside

| Page | What it does |
| --- | --- |
| **Overview** | Live clock, *Now / Up next* with time remaining, today's top three, today's timeline with a now-line and free gaps, week at a glance, shutdown countdown (default 20:30). |
| **Calendar** | Day / week / month views, create / edit / delete, recurring events (daily, weekdays, weekly on chosen days, monthly, optional end date), "this event" vs. "whole series" edits, drag to move, drag the bottom edge to resize. |
| **Tasks** | Quick add with natural language (`Write hooks tomorrow 17:00 !1 #tps`), Today / Upcoming / All / Completed views, category filter, sorting, star up to three daily priorities, link a task to a calendar block. |
| **Weekly planning** | A 20-minute reset: review last week (computed from your data), clear carry-over tasks, set three weekly priorities, see fixed commitments + school deadlines, one-click TPS focus blocks in free windows before shutdown. |
| **Settings** | Theme, default view, shutdown time, week start, time format, visible hours, category colours, demo data reset/remove, export/import, Google Calendar connection, storage status. |

### Keyboard

`⌘K`/`Ctrl K` command palette · `N` new task · `E` new event · `1–5` switch page · `?` all shortcuts
Calendar: `T` today · `D`/`W`/`M` views · `←`/`→` navigate. Tasks: `/` focus quick add.

## Demo mode

On first open the app is filled with **sample data** (clearly labelled as demo): a weekday school timetable, TPS deep-work blocks, gym, basketball, rest, and example tasks. It's generated relative to the current week. Nothing in it is a real commitment.

Everything is editable and saved in this browser's `localStorage`. Settings → Data lets you hide, reset or remove the demo data, or export/import everything as JSON.

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
npm run test:e2e     # headless Chromium smoke test against a running server (BASE_URL=…)
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

Vite · React 18 · TypeScript · Tailwind CSS v4 · Radix primitives (shadcn-style components) · Lucide icons · Zustand (persisted to localStorage) · date-fns · Sonner.

Calendar views are custom-built (no heavy calendar library) so they match the design and support drag/resize precisely.

```
src/
  pages/            Overview, Calendar, Tasks, Planning, Settings
  features/         overview cards, calendar grids, task row/editor, event editor/detail, command palette
  components/ui     Button, Input, Dialog, Sheet, Segmented, Checkbox, …
  lib/              dates + recurrence expansion, quick-add parser, demo data, Google client, event actions
  store/            app state (persisted) + UI state
```

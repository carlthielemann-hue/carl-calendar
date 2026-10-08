# Command Center V4 — spec for sign-off

Status: **draft, not built**. Order: V4.0 Foundations + **Mission screen** → V4.1 **Planner engine
(Autopilot)** + School → V4.2 Fitness → V4.3 Money → V4.4 Goals → V4.5 Swipe Vault → V4.6 Ask
Command Center.
This document details V4.0, V4.1 and V4.3; the rest stay as scoped in the roadmap and get their
own short spec before they start.

Rules carried over from V3: one record per thing (links, not copies) · derived numbers are
computed, never stored · real account starts empty, demo stays separate · nothing changes the
calendar or anything external without your approval · AI sees nothing sensitive by default.

---

## V4.0 Foundations (≈1 session)

### Navigation for 7 workspaces
| Space | Key | Pages |
| --- | --- | --- |
| Home | G H | — |
| Personal | G P | Today · Calendar · Tasks · Plan tomorrow · Weekly planning |
| TPS Business | G B | (unchanged) |
| Creative Lab | G L | (unchanged) |
| **School** | G S | Overview · Exams · Assignments · Grades · Study planner |
| **Fitness** | G F | Today · Log · Routines · Progress · Bodyweight |
| **Money** | G M | Overview · Ledger · Subscriptions · Savings · Set-aside |
| Goals | (Home-level page) | — |

- Settings → "Workspaces": show/hide each space (hidden spaces disappear from nav, Home and the brief).
- Phone bottom nav becomes: Home · Today · Capture (+) · **Spaces** (sheet with all spaces) · Search.

### Mission screen (replaces Home)
One command screen for what matters — not a second dashboard. Big type, dark, phone-first.
Modules appear as their phases land; each can be hidden.

| Module | Shows |
| --- | --- |
| **Now / Next** | current block with live countdown, next block; **Start focus** → fullscreen timer that logs focus time and marks the block done |
| **Today's mission** | top three (any workspace) with progress; one-tap complete |
| **At risk** (red) | overdue work, client deadlines ≤ 48 h, exams whose study hours don't fit, set-aside money still to move, workouts missed this week |
| **Countdowns** | Abitur, next exams, deliverable deadlines, savings-goal dates |
| **This week** | scorecard pace bars, goal progress rings, study/training hours |
| **Autopilot log** | what the planner changed and why, each with **Undo** |
| **Money pulse** | (only if Money is on and amounts not hidden) month net, savings rate, still to put away |

The morning push brief mirrors the screen: mission, at-risk items, what Autopilot changed overnight.

### Proposals (one approval pattern for everything)
`Proposal { id, kind: 'study-plan' | 'ai-suggestion', title, createdAt, status: pending|approved|rejected|partly, items: ProposalItem[] }`
`ProposalItem { id, action: 'create-event' | 'create-task' | …, payload, selected: boolean }`
- Shown on an approval screen: tick/untick items, edit times, then **Approve** creates the real records.
- Nothing in a proposal touches the calendar until approved. MCP/AI can only create proposals.

### Per-area AI permissions (Settings → AI connections)
| Area | Default | What AI can see when on |
| --- | --- | --- |
| Tasks, calendar, TPS, Lab | on | as today |
| School (subjects, exams, assignments) | on | names, dates, study plans |
| School **grades** | **off** | grades and averages |
| Fitness | on | routines, logs, PRs, bodyweight |
| **Money** | **off** | nothing at all unless switched on |

Enforced on the server (MCP + Ask), not just hidden in the UI.

### Sync
New collections are added to the sync schema; nothing else changes. Big logs stay inside their
parent record (sets inside a workout session) to keep sync fast and conflicts rare.

---

## V4.1 Planner engine (Autopilot) + School Planner (≈3 sessions)

### Planner engine — schedules that adjust themselves
Generalises the study scheduler to every kind of **planner-owned block**: study sessions, TPS
deep-work blocks for deliverables, Creative Lab practice, workouts.

- **What it may move**: only blocks it created (`origin: planner`). Never your own events, the
  school timetable, basketball, or Google events. Blocks you **lock** (📌) are never moved.
- **Priority score** per item = urgency (time to deadline vs work left) × importance (your
  priority, client work, linked to a goal, Abitur weighting) × slip penalty (already moved or missed).
- **Triggers**: a block passes without being done · new deadline/exam/deliverable · calendar
  change · priority change · nightly run on the server (before the morning brief).
- **Rules**: study windows, daily maxima, shutdown 20:30, buffers, rest day, max N changes per day
  so the week doesn't churn; tomorrow's plan stays stable after you confirm it in Plan Tomorrow
  unless something urgent appears.
- **Modes** (Settings → Planner): **Autopilot** — changes its own blocks and logs each change with a
  reason and Undo; **Ask me** — same changes arrive as a Proposal to accept. Default: Ask me for the
  first week, then you decide.
- **Explanations**: every change has a one-line reason, e.g. *"Moved Mathe review 15:00 → 17:00 —
  basketball moved to 15:30."* Shown on the Mission screen and in the brief.
- **Can't fit** → never silently drops work: it goes to *At risk* with options (start earlier, raise
  the daily max, lower the estimate, drop something lower priority).

### School Planner

### Data
| Entity | Fields |
| --- | --- |
| `Subject` | name, colour, teacher?, level (Leistungskurs/Grundkurs), Abitur subject? (written/oral/none) |
| `Exam` | subject, title, date + time, kind (Klausur, Abitur written, Abitur oral, test), topics[], **estimated study hours**, **study start date** (default: 14 days before), priority (normal/high), notes, links (docs) |
| `Assignment` | subject, title, due date/time, estimated minutes, status (open/done), notes → also appears in Tasks and Home like other work items |
| `Grade` | subject, kind (Klausur, mündlich, test…), points **0–15**, weight, date, semester (Q11/1 …) |
| `StudyPrefs` | study windows per weekday (default Mon–Fri 15:00–20:00, Sat–Sun 10:00–18:00), session length (default 60 min, min 30, max 90), max study per day (default 2 h weekdays, 4 h weekends), buffer around events (15 min), rest day (optional), never after shutdown (20:30) |

Study sessions are ordinary calendar events (category School) linked to `exam:<id>` and marked
`origin: study-planner`. Marking one done (or logging focus time) counts toward the exam's hours.

### The scheduler
1. **Hours left** per exam = estimate − hours already done (completed linked sessions).
2. **Days available** = from max(today, study start) to the day before the exam.
3. **Busy time** = every event in that range — local and Google, school timetable, gym,
   basketball — plus buffers, plus outside your study windows, plus after shutdown.
4. **Distribute**: earliest exam first, weighted by priority; spread sessions across days with a
   ramp (lighter at the start, heavier near the exam) and reserve the last two days for review.
   Never more than the daily max across all subjects combined.
5. **Place** each session in the best free window (preferred times first, no slivers < 30 min).
6. **Result** = a Proposal plus warnings, e.g. *"Mathe: 12 h needed, 8 h fit before 14 Nov —
   start earlier, raise the daily max, or lower the estimate."*

### Approval screen
Grouped by day: subject colour, time, exam it's for. Untick, drag to another time, change
length. **Approve** creates the events. **Replan** later only touches future, not-yet-done
sessions that the planner created — never your own events.

### Views
- **Overview**: next exams with countdown and "planned / done / needed" hours bars, assignments due this week, grade averages per subject.
- **Grades**: per-subject average (weighted), semester view; Abitur projection later (optional).
- **Home card**: next exam + today's study blocks; **morning brief** gets "Study: Mathe 16:00–17:00 (Analysis)".
- **Scorecard**: new auto-metric *study hours*.
- **MCP**: read subjects/exams/assignments; `propose_study_plan` creates a Proposal (never events); grades only if switched on.

---

## V4.3 Money — private planner, not accounting (≈1.5 sessions)

Your own spreadsheet, made fast: what came in, what went out, what's put away. **No invoices,
nothing sent to anyone, only you see it.** Not bookkeeping or tax software — keep official
records with a tax adviser or proper tool.

### Data
| Entity | Fields |
| --- | --- |
| `Transaction` | date, amount, currency (EUR/USD), EUR amount (rate you enter or a saved default), **in / out**, **business / personal**, category, client (optional, links to TPS), note, account |
| `Category` | name, in/out, business/personal, monthly budget (optional) |
| `Account` | name (e.g. Girokonto, Savings, PayPal, Upwork), starting balance |
| `Subscription` | name, amount, cycle (monthly/yearly), next renewal, business/personal, category, active |
| `SavingsGoal` | name, target, target date (optional), current amount (manual or from an account) |
| `SetAsideRule` | name, **percentage**, applies to (business income / all income), destination account |

### "Always put a percentage away"
- You set rules once, e.g. **Tax reserve 25 %** and **Savings 20 %** of business income (any number you want; ask a tax adviser what your tax reserve should be).
- Every income entry immediately shows: *"€1,200 in → put away €300 tax + €240 savings."*
- **Set-aside page**: per rule, *owed so far this month / moved / still to move*, with a **"Moved"** button that records the transfer. Home shows a nudge only when something is still to move.
- Savings rate this month = (saved + set aside) ÷ income.

### Views
- **Ledger**: spreadsheet-style table — inline editing, keyboard entry (Enter for a new row), filters (month, in/out, business/personal, category, client), totals row, CSV import and export.
- **Quick add** from ⌘K / phone: `-12.99 spotify sub`, `+1200 Lumen invoice paid #business`.
- **Overview** (per month and year): income, expenses, net, savings rate, budgets vs actual, **TPS revenue by client**, **business profit** (business income − business expenses), subscriptions per month, 12-month chart.
- **Subscriptions**: total per month/year, renewals in the next 14 days.
- **Savings goals**: progress bars and "€X/month to reach it by <date>".
- **Hide amounts** toggle (blurs numbers when someone looks at your screen).

### Connections
- Income linked to a client feeds the TPS client page (*revenue from this client*) and a new scorecard/goal source (*monthly revenue*).
- Subscriptions can add a renewal reminder task 3 days before (optional).
- AI: **off by default**. When switched on, Ask/MCP can read summaries; writes only as proposals.
- No bank connection (EU bank APIs are paid/restricted) — CSV import from your bank covers it.

---

## Later phases (short spec before each)
- **V4.2 Fitness** — routines/splits, phone-first logger with last time's numbers, progression suggestions, PRs, e1RM charts, bodyweight with 7-day average, Home card. No basketball tracking.
- **V4.4 Goals** — month/quarter/year goals with milestones; progress computed from metrics, tasks, PRs, savings goals, grade averages or manual.
- **V4.5 Swipe Vault** — synced ad media (needs R2), richer fields, boards, phone share-sheet capture, `save_swipe` MCP tool (Claude + Adlicio fill it).
- **V4.6 Ask Command Center** — in-app chat with source links and the permissions above; paid API with a monthly cap.

## Open questions for you
0. Planner mode to start with: **Ask me** (suggests, you accept) or straight **Autopilot**?
1. Default set-aside rules: start with **Tax reserve 25 % + Savings 20 %** of business income, editable?
2. Study windows default **Mon–Fri 15:00–20:00, Sat–Sun 10:00–18:00**, max **2 h / 4 h** per day — right?
3. Do you want the Abitur grade projection in V4.1, or later?

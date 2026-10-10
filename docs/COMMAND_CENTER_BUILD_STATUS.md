# Command Center 2.0 — build status

Last updated: 2026-10-10 · branch `claude/personal-command-center-j4seaw`

This file is the honest state of the build. "Done" means built **and** covered by an automated
test, or checked by hand where noted. Anything that depends on a real outside account
(Manus, Google, a phone's voices or microphone) is listed under **Not verified** until it has
been tried for real.

## Done

### Shell & dashboard
- Cinematic dark shell: CUE / COMMAND CENTER wordmark, search, flat main navigation (Home, Cue,
  Today, Clients, Acquisition, Projects, Creative Lab, Content, Knowledge, Calendar), a
  collapsible **Life** group (My Space, School, Fitness, Money), Settings, vision card and user card
  with an explicit mode label (*Demo mode · sample data* / *Local mode · this browser* / *Account · synced*).
- Home: greeting, intention, "today at a glance" chips, quote, quick actions; modules for priorities,
  Focus Hub, clients, recent activity, at-risk work, countdowns, affirmations, routines, vision strip,
  deliverables, practice, autopilot, weekly targets, training and money; right rail with calendar,
  inbox, goals & milestones. **Customize** (show/hide, reorder) and **Command / Focus** modes.
- Appearance: wallpapers (built-in photo, generated scenes, your own photo), accent colour, dim,
  density, your name, intention and quote.
- Phone: bottom nav (Home, Today, Capture, Cue, More → "Everything" sheet); no horizontal overflow
  on the new pages (tested at 390 px).

### Focus Hub, affirmations, routines
- Timer with 25 / 50 / 90 / custom presets, pause/resume, breaks (optional auto-break), fullscreen
  Focus Mode, history (`focusSessions` + legacy focus logs), chime + notification when done.
- Brain.fm: **launch only** — opens your configured Brain.fm link. Brain.fm has no public playback API.
- Affirmations Studio: categories, one-per-line bulk add, reorder, read aloud with the device voice
  (voice, rate, pitch, pause, repeat), your own microphone recordings per line, playlists
  ("your voice first" option), quick-play on Home.
- Routines (morning / pre-study / evening templates): step-by-step runner that can start a playlist,
  a focus timer on the next work item, or open a page.

### My Space (private)
- Vision boards (drag/resize collage, featured items, linked goals), journal with mood + daily
  snapshot, achievements (wins with photos), Future-Me letters (sealed until their date),
  travel list (places with status and photos), overview.
- Private: My Space is **never** exposed over MCP (the server empties those collections before any
  tool sees them) and never appears in the Business Brain or Time Machine unless you switch on
  "personal" there.

### Cue / AI team
- Team page with the five Cue agents (Main, Acquisition, Creative, Operations, Content) and honest
  connection state: an agent counts as connected only after an MCP client has actually called in
  (shown with last-seen time from `/api/mcp/clients`).
- Hand off work → saved as a queued `AgentRun`, with a copyable hand-off prompt for Manus/ChatGPT.
  Nothing runs inside Command Center — the agents' runtimes stay in Manus.
- Runs page: status, output, "save to knowledge", "make task".
- Approval Inbox: exact payload, edit before approving, approve / reject / request changes with a
  note. **Approving records a decision; it never executes anything.** The agent reads the final
  (possibly edited) payload with `cue_get_approval` and reports with `cue_report_execution`, which
  is refused unless approved and only accepted once.
- MCP tools: `cue_list_requests`, `cue_update_run`, `cue_record_run`, `cue_request_approval`
  (+ push notification), `cue_get_approval`, `cue_list_approvals`, `cue_report_execution`.

### Business Brain, capture
- Knowledge documents (note, link, file with text extraction for text-like files, Google Doc/Drive
  **reference**), categories, tags, access level (business / client-only / private), versioning,
  document registry and detail page.
- One ranked search over documents, client research, brand intelligence, insights, concepts,
  feedback, meetings, decisions and portfolio. Client isolation: a client filter never returns
  another client's records. Private documents are never returned to AI tools.
- Universal capture inbox (text, links, pasted screenshots, files, voice memo, opt-in browser
  dictation) with a destination suggestion and one-click filing (opportunity, swipe, content idea,
  client note, task, knowledge).
- MCP: `search_business_knowledge`, `get_knowledge_doc`, `save_knowledge_doc` (dedupe by
  external id, version increments only when the text changes).

### Business workspaces
- Projects with milestones; client onboarding checklist and people (contacts) tabs; meetings and
  decisions; portfolio (results only as you enter them — nothing is invented).
- Acquisition pipeline with stages New → Qualified → Applied/contacted → Replied → Conversation →
  Call scheduled → Proposal → Won / Lost (rename/hide stages), budget + evidence, fit 1–5 with notes,
  portfolio matches, application studio with templates, convert to client.
- Creative Lab insights carry a confidence level (hypothesis / tested / proven); only "proven" ones
  are shown as such.
- Content OS for X and LinkedIn: Idea → Research → Draft → Review → Approved → Published, with
  hooks, pillars, formats and manually entered performance. Nothing is ever auto-published.
- MCP: `get_projects_overview`, `get_acquisition_pipeline`, `create_opportunity` (dedupe by URL,
  lands in New, contacts nobody), `save_content_draft` (never published).

### Insight views
- Analytics from real records only (no estimates): business stats and weekly charts, personal stats.
- Business Time Machine: one timeline of wins, new clients, approvals, decisions, proven insights,
  published posts, completed Cue runs and activity (personal memories only when switched on).
- Idea canvas: notes, images, links, connections, zoom/pan; any card converts into a task,
  content idea, insight or knowledge note and stays linked.
- Knowledge Universe: graph of clients, projects, deliverables, documents, research, insights,
  opportunities, concepts, decisions, meetings and portfolio (private documents excluded).

### Fixed during this build
- **Planner re-proposing right after approval**: on some days (e.g. weekends, or close to shutdown)
  the exam ramp couldn't place every minute, and the next run found those slots and proposed again.
  The planner now fills leftover minutes into any day with room in the same run. Covered by a
  960-case stability test (`src/domain/__tests__/cc2.test.ts`).

## Not verified with real accounts / devices
- **Manus actually picking up Cue requests and approvals.** The MCP tools are tested end to end
  against a local Worker with a simulated client, but a real Manus agent has not run against them yet.
- **iPhone read-aloud voices** (which voices appear, how Safari handles pauses/rate) — tested only
  with a simulated speech engine in Chromium.
- **Microphone recording** on iPhone/Mac Safari — implemented with `MediaRecorder`; not tried on a device.
- **Browser dictation** (SpeechRecognition) — Chrome/Safari only, opt-in; not tried on a device.

## Not built
- Gmail thread records / email inbox inside Command Center.
- Live Google Drive / Docs sync. Documents store a reference; their text gets in when you paste it
  or when an agent saves it with `save_knowledge_doc`.
- Travel map (travel is a list with photos).
- Speech-to-text beyond what the browser itself offers (no paid transcription service).
- Automatic import of X / LinkedIn post metrics (entered by hand).

## Known issues
- Uploaded photos/recordings live on the device unless R2 file storage is enabled on the Worker.
- The Brain.fm button opens a link; it cannot start or stop audio.
- Older desktop browsers without `speechSynthesis` show a clear message instead of reading aloud.

## Tests run for this build (all passing)
| Suite | Result |
| --- | --- |
| `npm test` (vitest, incl. new `cc2.test.ts`) | 71 passed |
| `test:e2e` smoke | 19 passed |
| `test:v3` / `test:v4` | 9 / 9 passed |
| `test:school` / `test:fitness` / `test:money` / `test:goals` / `test:vault` | 10 / 10 / 12 / 5 / 6 passed |
| `test:cc2` (new) | 13 passed |
| `test:server` (fresh local D1, incl. 5 new Cue/Brain/acquisition checks) | 29 passed |
| `test:sync` two-device (fresh local D1) | 14 passed |
| `test:widgets` | 5 passed |

No new D1 migration is needed: new collections use the existing generic record table.

## Next actions
1. Deploy (`git pull` → `npm run deploy`) — nothing here is live until you do.
2. In Manus, give each Cue agent the Command Center connector and the hand-off prompt; run one
   real request end to end (hand off → run → approval → execution report).
3. On the iPhone, try Affirmations read-aloud and a recording once; note the voice you like.

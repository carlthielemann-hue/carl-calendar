# Command Center OS → Cue runtime: integration handoff

Machine-readable twin: [`docs/cue-integration-handoff.json`](cue-integration-handoff.json).

## 1. Repository state

| | |
| --- | --- |
| Branch | `claude/personal-command-center-j4seaw` |
| Parent commit | `9dcacbdf923b0b7cc36b4005ee0a79d51edc2554` |
| Handoff commit | The single commit directly on top of the parent above. A file can't contain its own SHA; use `git log -1`. |
| Git status | Clean after the handoff commit, verified with `git status --porcelain`. |
| Pushed | **No.** The commit is local and waits for explicit authorisation to push. |
| Production deployment | **None.** Nothing was deployed, published, sent or connected. |

**Existing Cue runtime code:** none. There is no `server/cues/` directory, and no Cue-runtime
code exists in this repository or on any remote branch. I checked with `ls server/cues`,
`git ls-remote --heads origin` (one branch) and `git grep server/cues`. Nothing was protected or
modified on its behalf.

## 2. What this pass completed

Earlier passes built the OS. This pass closed the gaps found while auditing the integration seam:

1. **Approval Center contract.**
   - `ApprovalDecision.by` records who decided.
   - `ApprovalRequest.actionType` gains `status_change` and `internal_task`, for proposed internal changes.
   - "Reopen" is now an audited decision (`decision: 'pending'`, `by: 'carl'`) instead of a silent status change.
   - The Approval Center UI shows the requested time, the run, the payload hash, the target record and who decided.
2. **`cue_request_approval`** now accepts `target_ref` (validated), `run_id` (validated and linked into `AgentRun.approvalIds`) and `idempotency_key`, and stores `payloadHash`. **`cue_get_approval`** additionally returns `action_type`, `target_ref`, `payload_hash`, `final_payload_hash`, `decided_by`, `run_id`, `requested_at` and the full `history`. **`cue_list_approvals`** returns `target_ref` and `run_id`.
3. **Reading runs back.** New MCP tools `cue_list_runs` and `cue_get_run` return run outputs, refs, sources, the linked task and the approvals each run requested.
4. **Post approvals.** Approving a `post:` approval in the Approval Center marks the post approved (exact text and hash). It creates **no** publication job; scheduling stays a separate step in the content calendar.
5. **Tests.**
   - New `src/domain/__tests__/schema.test.ts` guards drift: every synced collection exists in state and `emptyData`, has a ref type, and round-trips through sync.
   - `tests/ops21-server.mjs` gained two integration-seam steps.
   - `tests/ops21.mjs` gained an Approval Center step.

## 3. Validation (commands run in this pass, all on this commit's code)

| Command | Result |
| --- | --- |
| `npx tsc -b` | passed |
| `npx tsc -p tsconfig.server.json --noEmit` | passed |
| `npx eslint src server --quiet` | passed |
| `npx vitest run` | passed — 92 tests |
| `npm run build` | passed (local build only; nothing deployed) |
| `node tests/smoke.mjs` | passed — 19 |
| `node tests/v3.mjs` | passed — 9 |
| `node tests/v4.mjs` | passed — 9 |
| `node tests/school.mjs` | passed — 10 |
| `node tests/fitness.mjs` | passed — 10 |
| `node tests/money.mjs` | passed — 12 |
| `node tests/goals.mjs` | passed — 5 |
| `node tests/vault.mjs` | passed — 6 |
| `node tests/cc2.mjs` | passed — 14 |
| `node tests/ops21.mjs` | passed — 16 |
| `node tests/ops21-server.mjs` (local `wrangler dev`, fresh local D1) | passed — 17 |
| `node tests/server.mjs` (local `wrangler dev`, fresh local D1) | passed — 29 |
| `node tests/widgets.mjs` (local `wrangler dev`, fresh local D1) | passed — 5 |
| `node tests/sync-e2e.mjs` (local `wrangler dev`, fresh local D1) | passed — 14 |
| `git diff --check` | passed |
| `jq empty docs/cue-integration-handoff.json` | passed |

Browser suites ran against the local Vite dev server (`http://localhost:5173`). Server suites ran
against `wrangler dev --local-protocol https` with a fresh local D1 database. No remote resources
were used.

## 4. Data model inventory

Shared locations for every record below:
- **State:** `src/domain/state.ts` (`Data`) and `src/store/app.ts` (`Collections`, defaults, `COLL_REF`).
- **Sync:** `src/domain/syncSchema.ts` → `ARRAY_COLLS`.
- **Server persistence:** D1 `records` table (`migrations/0001_init.sql`), accessed through `server/records.ts` (`applyChange`, `writeRecord`, `loadState`).
- **Client persistence:** zustand persist, localStorage key `command-center:v1`.
- **Export/restore:** `src/store/backup.ts` (`KEYS = ARRAY_COLLS + MAP_COLLS`).
- **Conflicts:** last writer wins per record, with the losing version kept in the D1 `conflicts` table (`server/records.ts applyChange`).

**IDs and timestamps:** every record has a stable string `id`, prefixed by type (`o-`, `apr-`, `run-`, `at-`…). Every record has `createdAt`. Records that change after creation carry `updatedAt` (runs, tasks, approvals, drafts, posts, jobs, companies, schedules, knowledge docs, research). Older business records (opportunity, insight, feedback, concept) rely on the server row's `updated_at` and `rev` for ordering and conflict detection.

| Record | Collection | Type | UI | Statuses | Relationships | Provenance fields |
| --- | --- | --- | --- | --- | --- | --- |
| Client | `clients` | `src/domain/entities.ts:98` | `pages/tps/Clients.tsx`, `ClientDetail.tsx` | active · paused · past | parent of projects, deliverables, research, feedback, concepts; `companies.clientId` | brand sections |
| Project | `projects` | `entities.ts:126` | `pages/tps/Projects.tsx` | active · paused · done | `clientId` | — |
| Deliverable | `deliverables` | `entities.ts:153` | `pages/tps/Deliverables.tsx` | `stageId` → stage kind backlog · working · internal_review · client_review · revisions · approved | `clientId`, `projectId`, `insightIds` | `insightIds` |
| Task | `tasks` | `src/lib/types.ts:46` | `pages/personal/Tasks.tsx` | `completed` boolean | `link` ref | `link` |
| Feedback | `feedback` | `entities.ts:527` | `ClientDetail.tsx`, `pages/lab/Improve.tsx` | open · addressed (kind revision · approval · comment) | `clientId`, `projectId`, `deliverableId` | — |
| Research | `research` | `entities.ts:484` | `ClientDetail.tsx` | draft · approved | `clientId` | `source`, `origin` |
| Insight | `insights` | `entities.ts:364` | `pages/lab/Insights.tsx` | confidence hypothesis · tested · proven | `links[]` | `links` |
| Concept (brief/concept draft) | `concepts` | `entities.ts:561` | `pages/tps/Studio.tsx` | draft · approved · rejected | `clientId`, `insightIds` | `origin` |
| Analysis (practice) | `analyses` | `entities.ts:322` | `pages/lab/Analyses.tsx` | planned · in_progress · done | `adId`, `planId` | — |
| Knowledge doc | `knowledgeDocs` | `src/domain/entities2.ts:291` | `pages/knowledge/Brain.tsx` | access business · client · private | `clientId`, `projectId` | `source`, `url`, `externalId` |
| Company | `companies` | `src/domain/entities3.ts:112` | `pages/tps/Companies.tsx` | — | `clientId`; opportunities and contacts point to it | `sourceRefs`, `socials`, `aliases` |
| Contact | `contacts` | `entities2.ts:333` | `features/tps/ClientExtras.tsx`, `features/acquisition/Intel.tsx` | — | `clientId?`, `companyId?` | `source`, `profiles`, `history` |
| Opportunity | `opportunities` | `entities.ts:193` | `pages/tps/Acquisition.tsx`, `Pipeline.tsx` | lead · qualified · contacted · replied · conversation · call · proposal · won · lost | `companyId`, `contactId`, `clientId` | `evidence[]`, `researchRefs`, `scores[].why`, `source`, `via` |
| Proposal / outreach draft | `appDrafts` | `entities2.ts:412` | `pages/tps/Applications.tsx` | draft · review · approved · sent (+ outcome) | `opportunityId`, `contactId`, `companyId`, `approvalId` | `personalization`, `versions[]`, `executionRef`, `sentVia` |
| Content post | `posts` | `entities.ts:634` | `pages/tps/Content.tsx`, `ContentCalendar.tsx` | idea · research · draft · review · approved · scheduled · posted · failed · canceled | `opportunityId`, `approvalId` | `researchRefs`, `versions[]`, `approvedHash`, `metrics` (manual) |
| Publication job | `publications` | `entities3.ts:183` | `ContentCalendar.tsx` | queued · claimed · published · failed · canceled | `postId`, `approvalId` | `hash`, `manusRef`, `url`, `executor` |
| Content idea | `contentOpps` | `entities3.ts:210` | `pages/tps/ContentIdeas.tsx` | new · drafting · drafted · used · dismissed | `postIds`, `sourceRef` | `sourceRef`, `excerpt`, `origin` |
| Client performance | `performance` | `entities.ts:545` | `ClientDetail.tsx` | — | `clientId`, `deliverableId` | — |
| **Approval request** | `approvals` | `entities2.ts:232` (+ `ApprovalDecision` `:221`) | `pages/cue/Approvals.tsx` | pending · approved · rejected · changes; actionType email · post · proposal · dm · file · calendar · status_change · internal_task · other | `runId`, `targetRef`, `resubmittedFrom` | `sourceRefs`, `payloadHash`, `decisions[]{at, decision, by, note, editedPayload}`, `approver`, `executionRef` |
| **Agent run** | `agentRuns` | `entities2.ts:187` | `pages/cue/Runs.tsx`, `Team.tsx` | queued · running · completed · failed · cancelled | `taskId`, `scheduleId`, `approvalIds`, `refs`, `clientId` | `outputRefs`, `sourceRefs`, `externalId`, `manusUrl`, `via` |
| Agent task / hand-off | `agentTasks` | `entities3.ts:20` | `pages/cue/Tasks.tsx` | open · in_progress · blocked · done · cancelled | `parentId`, `runIds`, `refs` | `outputRefs`, `via` |
| Schedule (mirror) | `schedules` | `entities3.ts:54` | `pages/cue/Schedules.tsx` | configured · active · paused · error | agent | `manusRef`, `manusUrl` |
| Notification | `notifications` | `entities3.ts:79` | `features/notifications/Center.tsx` | category urgent · review · intel · routine; `readAt` | `ref` | `agent`, `dedupeKey` |
| Activity | `activity` | `entities.ts:444` | Home "Recent activity", `pages/home/Timeline.tsx` | — | `ref` | text names the connector |
| Finding | `findings` | `entities3.ts:267` | `pages/knowledge/Intel.tsx` | new · reviewed · archived; strength; action | `sourceId`, `relatedIds`, `refs` | `url`, `creator`, `evidence` |
| Watch source | `watchlist` | `entities3.ts:248` | `pages/knowledge/Watchlist.tsx` | `active` | findings | `url`, `handle` |
| Feedback observation | `observations` | `entities3.ts:298` | `pages/lab/Improve.tsx` | polarity weakness · strength · neutral | `clientId`, `deliverableId`, `sourceRef` | `sourceRef`, `by` |
| Improvement | `improvements` | `entities3.ts:316` | `pages/lab/Improve.tsx` | suggested · active · done · dismissed | `taskId`, `evidence` | `evidence` |

## 5. Server / API route map

**HTTP (`server/index.ts`, Hono).** Everything under `/api/*` requires the owner session cookie
(middleware after `/api/widget`). There are no API keys.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/session` | — | `{ signedIn, features \| null, configured }` (public) |
| POST | `/api/login` | `{ password }` | 200 + HttpOnly `cc_session` cookie, or 401 (public, rate-limited) |
| GET | `/api/sync?since=&limit=` | — | `{ rev, records:[{coll,id,data,rev,updated_at}], more }` |
| POST | `/api/sync` | `{ device, changes:[{coll,id,data,baseRev,updatedAt}] }` | `{ rev, results:[{coll,id,status,rev?,data?,error?}] }` |
| GET | `/api/sync/conflicts` | — | `{ conflicts:[…] }` |
| GET | `/api/export` | — | full server backup (attachment) |
| GET | `/api/mcp/tools` | — | `{ tools }` |
| GET/PUT | `/api/mcp/permissions` | `{ write?, consequential?, hiddenClients?, areas? }` | permissions |
| GET | `/api/mcp/clients` | — | connected MCP clients with last-seen |
| GET/DELETE | `/api/mcp/grants[/:id]` | — | grants / revoke |

**MCP: the runtime seam.** `POST /mcp` takes JSON-RPC 2.0 (`initialize`, `tools/list`,
`tools/call`). It's mounted by `OAuthProvider` in `server/index.ts`, and calls go through
`server/mcp.ts` → `mcpFetch` / `handleRpc`.

- **Auth:** OAuth 2.1 bearer token, issued through dynamic client registration (`/oauth/register`), PKCE and one owner consent at `/authorize`. Scopes are `mcp:read` and `mcp:write`.
- **Server-side permissions:** write tools need `perms.write` (on by default). Consequential tools (`update_deliverable_status`) need `perms.consequential` and `confirm: true`.
- **Tools** are defined in `server/mcp.ts` (`TOOLS`) and `server/mcp21.ts` (`TOOLS_21`).

| Capability | Tool (file) | Request → response |
| --- | --- | --- |
| Start / record a run | `cue_record_run` (mcp.ts) | `{agent,title,status?,input?,output?,task_id?,schedule_id?,refs?,source_refs?,manus_url?,idempotency_key?}` → `{ok,id}` |
| Update a run | `cue_update_run` (mcp.ts) | `{run_id,status,output?,output_refs?,error?}` → `{ok,id,status}` |
| Retrieve runs | `cue_list_runs` (mcp21.ts) **new** | `{agent?,status?,task_id?,limit?,cursor?}` → `{items,next_cursor,total}` |
| Retrieve run output | `cue_get_run` (mcp21.ts) **new** | `{run_id}` → full run + task + approvals |
| Assign / hand off | `cue_create_task`, `cue_list_tasks`, `cue_update_task` (mcp21.ts) | see JSON |
| Create approval | `cue_request_approval` (mcp.ts) **extended** | `{agent,title,action_type,destination,payload,context?,source_refs?,risk?,run_id?,target_ref?,idempotency_key?}` → `{ok,approval_id,status:'pending'}` |
| Read approval | `cue_get_approval` / `cue_list_approvals` (mcp.ts) **extended** | → `{status,may_execute,final_payload,final_payload_hash,decided_by,history,…}` |
| Report execution | `cue_report_execution`, `record_outreach_sent`, `report_publication_result` | refused unless approved; hash-checked; idempotent |
| Validated drafts | `submit_outreach_draft`, `save_content_draft`, `create_draft_concept`, `save_research_draft`, `attach_research`, `save_content_opportunity`, `create_task` | records only |
| Context | `get_client_context_pack`, `search_business_knowledge`, `get_opportunity`, `cue_get_coordination_state`, `get_daily_briefing` | read-only |

**Recording an approval or rejection is deliberately not an agent tool.** Only Carl decides, in
the UI (`src/lib/ops.ts decideApproval`), and the decision reaches the server through `/api/sync`.

## 6. UI route / component map

| Surface | Route | Component |
| --- | --- | --- |
| Dashboard + "Ready for you" | `/home` | `src/pages/Home.tsx`, `src/pages/home/Briefing.tsx` (`ReadyCard`) |
| Main Cue daily briefing | `/home/briefing` | `src/pages/home/Briefing.tsx` (`src/domain/briefing.ts`) |
| Acquisition | `/tps/acquisition`, `/tps/pipeline`, `/tps/companies`, `/tps/applications` | `Acquisition.tsx`, `Pipeline.tsx` + `features/acquisition/Intel.tsx`, `Companies.tsx`, `Applications.tsx` |
| Creative Lab / research / insights / concepts | `/lab/*`, `/tps/studio`, `/tps/clients/:id` | `pages/lab/*`, `pages/tps/Studio.tsx`, `ClientDetail.tsx` |
| Projects / deliverables / feedback / ops | `/tps/projects`, `/tps/deliverables`, `/lab/improve` | `Projects.tsx`, `Deliverables.tsx`, `pages/lab/Improve.tsx` |
| Content library / drafts / calendar / performance | `/tps/content-calendar`, `/tps/content-ideas`, `/tps/content` | `ContentCalendar.tsx`, `ContentIdeas.tsx`, `Content.tsx`, `features/content/Publish.tsx` |
| Agent runs / activity | `/cue/runs`, `/cue/tasks`, `/cue/team`, `/cue/schedules` | `pages/cue/Runs.tsx`, `Tasks.tsx`, `Team.tsx`, `Schedules.tsx` |
| Approval Center / audit | `/cue/approvals` | `pages/cue/Approvals.tsx` |
| Notifications | bell (sidebar, mobile top bar) | `features/notifications/Center.tsx` |

None of these screens generate Cue intelligence. They show records the runtime writes, and they
are where Carl approves.

## 7. Approval Center data flow

1. The runtime calls `cue_request_approval`. This creates an `ApprovalRequest` with `status: 'pending'`, `payloadHash`, `targetRef`, `runId` and `sourceRefs`, and pushes a notification.
2. Carl decides in `/cue/approvals`, `/tps/applications` (outreach) or the content calendar (posts). `decideApproval` appends `{at, decision, by:'carl', note?, editedPayload?}` and sets `approver`. For `appdraft:` targets the draft follows the decision. For `post:` targets the post is marked approved with the exact text and hash, and no job is created.
3. The decision syncs to D1 through `/api/sync`.
4. The runtime polls `cue_get_approval`. It may act only if `may_execute === true`, and must use `final_payload` exactly.
5. The runtime executes **outside** Command Center, then reports with `cue_report_execution`, `record_outreach_sent` (text must match the approved hash) or `report_publication_result` (claim first). Reporting is refused unless the request is approved, and is idempotent.

Approval records never trigger execution. `status_change` and `internal_task` approvals change
nothing by themselves. After approval, the runtime performs them through `update_deliverable_status`
(which also needs the consequential permission and `confirm: true`) or `create_task`.

## 8. Private-data boundaries

`server/mcp.ts visible()` runs before any tool sees state. It:
- empties all My Space collections (vision boards, journal, achievements, snapshots, letters, places, affirmations, playlists, routines, focus sessions);
- empties `captures` and `notifications`;
- drops `access: 'private'` knowledge documents;
- removes money and grades unless enabled (Settings → AI connections);
- removes hidden clients and everything linked to them (projects, deliverables, research, feedback, concepts, docs, runs, contacts, companies, opportunities, observations, related drafts).

On top of that:
- Content ideas from client work are marked `generalize`.
- `postChecks` flags client names, emails and money or performance figures before approval.
- Credentials live only in Worker secrets and are never in synced records.

## 9. External integrations: intentionally unconnected

Unconnected:
- Cue runtime
- Manus (contract tested only with a simulated MCP client)
- X / Twitter
- LinkedIn
- Upwork
- Gmail / email
- Discord
- Anthropic / OpenAI (AI Studio keys not configured here)

Configured in code but not verified here:
- Google Calendar
- Web Push to real devices

## 10. Cue integration points (do this)

1. Register the runtime as an OAuth client, complete owner consent once, and keep the refresh token in the runtime's secret store. Access tokens last 1 h; refresh tokens last 60 days.
2. Map runtime agents to `main | acquisition | creative | operations | content`, and run states to `queued | running | completed | failed | cancelled`.
3. Per run, call `cue_record_run` (`idempotency_key` = runtime run id), then `cue_update_run` with output and `output_refs`.
4. Every external action goes through `cue_request_approval` (with `target_ref`, `run_id`, `idempotency_key`) → `cue_get_approval` → execute → report.
5. Create drafts only through the validating tools listed in §5.
6. Before going live, run `tests/ops21-server.mjs` against a staging Worker with the runtime's client.

## 11. Known blockers, risks, TODOs

- No Cue runtime code was available, so compatibility is asserted from the Command Center side only.
- There's no API-key auth: a headless runtime must handle OAuth (one consent, then refresh tokens).
- If the runtime keeps its own run store, it must mirror runs into Command Center. There is no bulk-import endpoint.
- Fixed unions: `ApprovalRequest.actionType`, `AgentRun.status` and the agent ids. Extending them requires a type change plus the MCP enum.
- No migrations are required: records are generic D1 rows and all new fields are optional.
- No real external execution has been verified.

## 12. Deployment confirmation

No production deployment occurred in this pass. I didn't run `npm run deploy`, didn't call
`wrangler deploy`, and made no remote D1 changes. I didn't publish, send or post anything, and
used no credentials. The commit was not pushed.

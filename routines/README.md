# Routines

Claude scheduled tasks that feed the Scriptroom Engine. They only write drafts; Carl approves on Today.

| Routine | File | Schedule (Europe/Berlin) | Heartbeat job |
|---|---|---|---|
| Daily acquisition (P3) | `acquisition.md` | weekdays 06:40 — `CRON_TZ=Europe/Berlin 40 6 * * 1-5` | `acquisition_routine` |
| Content drafts (P5) | `content.md` | Mon + Thu 07:20 — `CRON_TZ=Europe/Berlin 20 7 * * 1,4` | `content_routine` |

Both start before the 18:00 batch assembly, so drafts land in the same day's batch.

## Set up (claude.ai → Code → Scheduled tasks, or ask Claude "create a scheduled task")
1. New scheduled task, **fresh session per run**, repo `carl-calendar` attached (so the routine can read
   `playbook/outreach.md` and the skills).
2. Prompt: everything below the `---` line in the routine file.
3. Schedule: the cron above. Notifications: push on completion is enough.
4. Connectors to grant the task (only these):
   - **Scriptroom Engine / Command Center** (MCP, with write access ticked; or an Engine key `cce_…` for
     `POST /api/engine/mcp` — see `docs/ENGINE_CONTRACT.md`). Needed for `queue_outreach`, `save_audit`,
     `list_outreach`, `update_outreach_item`, `find/add/update/log`, `job_heartbeat`, `save_content_draft`.
   - **Adlicio** — ads (`find_competitor_brands`, `find_competitor_ads`, `inspect_landing_page`) need the Growth plan
     (Scale for `find_competitor_brands`/`research_competitor`); on Free the routine runs in web-search fallback.
   - **Apollo.io** — `apollo_people_match` needs a plan that includes People Enrichment via MCP; on the current
     plan every cold email becomes "find contact".
   - **Upwork** — read tools only (`find_jobs`). The routine must never call `manage_proposals`, `save_job`, `send_message`.
   - **Google Drive** (optional) — upload teardown PDFs/statics and store share links in the audit.
5. Environment network: allow at least `facebook.com` (Ad Library), `trustpilot.com`, `reddit.com`, `x.com`,
   `linkedin.com` and brand domains, or WebFetch fallbacks fail (the 2026-11-05 dry run hit this).

## Health
Every run ends with `job_heartbeat`; Today shows a red dot if a job misses its window. Check with
`engine_status` or `list_jobs`. A run with `ok:false` still writes its run report via `log`.

## Dry runs
`dryrun/<date>/` holds a manual run's output (batch.json in the `queue_outreach` format, audits, statics, PDFs,
run_report.md) for review before the routine is switched on.

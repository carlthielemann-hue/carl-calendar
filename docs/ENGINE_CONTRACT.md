# Scriptroom Engine — contract for routines, skills and Claude chat

The Engine is the Command Center Worker (this repo). AI writes into it over MCP; Carl approves on **Today**.

## Connection

- Claude chat / claude.ai connectors: `https://<worker>/mcp` (OAuth). The consent screen now always offers
  **write access** — tick it. (Old connections were read-only because the client never requested `mcp:write`.)
- Routines / scripts without OAuth: `POST https://<worker>/api/engine/mcp` with
  `Authorization: Bearer cce_…` (Engine key, created in Engine → Settings → AI connections or via
  `POST /api/engine/keys`). Same JSON-RPC protocol and tools, read + write.

## Generic tools (forgiving)

| Tool | Args | Notes |
| --- | --- | --- |
| `add` | `entity`, `data` (object) and/or `text` (loose sentence) | Upsert with dedupe (name/domain/email). Unknown fields are kept. Returns what was saved. |
| `update` | `entity`, `id`, `data` | Merge. |
| `find` | `query`, `entity?` | Search across all engine entities + clients/companies/opportunities. |
| `archive` | `entity`, `id` | One-click archive (reversible). |
| `log` | `note` | Free note into the activity feed. |
| `undo` | `activity_id` | Restores the previous version of what that write changed. |

Entities: `client, past_work, offer, voice_sample, proof_asset, income, expense, subscription, milestone,
time_log, concept, audit, invoice, contact_note, network, decision, experiment, swipe, niche_insight,
skill_log, ownership_target, priority, suppression`. Clients also mirror into the existing `clients` collection.

Convenience: `upsert_client`, `log_past_work`, `set_offer`, `add_income`, `add_expense`, `log_time`,
`set_goal` (milestone), `import_from_doc` (text blob → entity rows), `get_today`, `engine_status`,
`get_settings`, `set_setting`.

## Outreach pipeline tools

`queue_outreach` — `items: OutreachItem[]`. Drafts go into the next 18:00 batch. Dedupe: same
channel + (email | source_url) never queued twice; suppressed emails are rejected.

```jsonc
// OutreachItem
{
  "channel": "email" | "upwork" | "x" | "linkedin",
  "kind": "cold" | "followup" | "proposal" | "reply" | "dm",
  "to_email": "jane@brand.com",        // email only; must be verified
  "email_source": "apollo" | "website" | "public_page",  // REQUIRED for email; no guessing
  "to_name": "Jane", "company": "Brand", "domain": "brand.com",
  "country": "US" | "UK" | "CA" | "AU",  // email only; anything else is rejected
  "timezone": "America/New_York",         // optional; default from country
  "subject": "…", "body": "…",            // body WITHOUT footer — the sender adds opt-out + address
  "variant": "A" | "B",
  "evidence": "why this person/brand, what we saw (links)",
  "personalization": "the specific observation used",
  "source_url": "https://www.upwork.com/jobs/… | https://x.com/…",
  "score": 0-100, "score_reason": "…",
  "audit_id": "aud_…",                    // link to save_audit result
  "niche": "supplements",
  "price_quoted": 1200
}
```

`save_audit` — `{ brand, domain, ads_snapshot, landing_page, voc, gaps, concepts, spec_statics: [url|path], pdf: url|path, sources: [] }` → returns `audit_id`.

`job_heartbeat` — `{ job, ok, message, stats }`. Every routine calls this at the end (also on failure).
Today shows a red dot for any job that missed its expected window.

`mark_sent` — manual channels (Upwork/X/LinkedIn): Carl taps "mark sent" in Today; routines never call it.

`record_reply` — existing tool; the Worker also detects email replies itself via Gmail.

## Hard rules enforced in code (not just prompts)

- The sender only sends `channel=email`, `status=approved`, approved payload hash unchanged, recipient
  country in US/UK/CA/AU, email not suppressed, `email_source` set, `SENDING_ENABLED=true`, `SENDER_ADDRESS`
  set, under today's warm-up cap, inside 08:00–17:00 recipient-local, sending not auto-paused.
- Every email gets the footer: sign-off, opt-out line, postal address.
- Upwork/X/LinkedIn are never sent by the system.

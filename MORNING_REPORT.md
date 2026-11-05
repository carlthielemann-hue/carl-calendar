# Morning report: Scriptroom growth engine (Nov 5)

Branch `claude/laughing-babbage-m86bnf`, pushed, **not deployed** (I have no Cloudflare access). Start with `CARL_TODO.md` §1.

## Built and working (tested locally)
- **P0 money pipe:** drafts → 18:00 batch → one push notification ("N drafts ready") → **Today**, where you edit inline, ✓/✗, or Approve all. Upwork, X and LinkedIn items get Copy + Mark sent. Then the sender (Gmail API) sends emails only, gated by `checkSendable`: approval, unchanged since approved, US/UK/CA/AU only, verified email, suppression list, warm-up cap 15→40, 08–17 recipient-local, random spacing, auto-pause on bounces/complaints. Follow-ups are drafted for day 4/8/13. Any reply stops the sequence, and opt-outs and bounces are suppressed. **Ships with sending OFF**, double-locked.
  - Tests: 20 unit tests on the gate plus 14 end-to-end checks against a local Worker (`npm run test:engine-server`): approve → send → follow-up drafted → reply stops it → address suppressed.
- **P0.5:** the old app is now the Engine (`#/engine`, nothing deleted). **Today** is the only daily screen: dark, amber accent, milestone bar, replies on top, max 3 priorities, streak, and a jobs health line where dead jobs show red.
  - **MCP is now read+write:** `add / update / find / archive / undo / log`, plus `upsert_client`, `add_income`, `log_time`, `set_goal`, `set_offer`, `queue_outreach`, `save_audit`, `job_heartbeat` and more. Loose text works ("Zoyava, €800/month, started October"), and every write can be undone.
  - The read-only bug was the consent screen never offering write access. Fixed: reconnect once and tick write.
  - Money tracker covers MRR, monthly revenue, unpaid invoices, renewals, € per hour per client (with an underpricing flag) and a tax set-aside estimate. Milestones are €5k → €10k and editable by chat.
- **P1 Audit Engine** (`skills/audit-engine`): procedure + one-page teardown PDF. **P2 Static Producer**: 7 layouts × 2 sizes, contact sheet, `PRINCIPLES.md` (sources incl. Alex Cooper of Adcrate), `COMPLIANCE.md`.
- **P3 acquisition** and **P5 content** routines are prompts in `routines/`. You schedule them (§3 of the todo).
- **P4/P7:** concepts log, invoices (drafted on the 1st, overdue reminders drafted), win/loss by channel/niche/variant, client memory packs, network, decisions, experiments, swipes, niche library, skill log. Plus a Monday "ask clients for numbers" reminder, a Sunday weekly review and 60-day reactivation nudges.
- **P6 video v0:** hook stacking, captions, 9:16/4:5/1:1, claymation. Tested on synthetic clips.
- **P3.5 website:** `website/UPGRADE.md` (3 hero options, fix steps) and a complete `website/index.html` whose teardown form feeds Scriptroom.

## Not working / blocked
- **Cold email is not producing yet.** Adlicio is on the Free plan (no ad library or brand discovery) and Apollo's free plan blocks people search through MCP. The 3 audits use reviews and Reddit only, and all 3 emails are marked "find contact".
- **Website:** this sandbox couldn't reach theprofitscript.com, so the builder and the cause of the meta-tag leak are unconfirmed.
- Never tested against real Gmail, Cloudflare cron or push. Those need the deploy.

## Dry-run batch (`dryrun/2026-11-05/`, real data, sending off)
- **4 ready:** 3 Upwork proposals (scores 86/77/73) and 1 X reply (the post is ~15 days old).
- **3 cold emails** with audit, spec static and teardown PDF each (Arrae, Native Pet, Topicals), waiting for verified emails.
- Credits used: Adlicio 2, Apollo 0, Upwork connects 0.
- Load it with `scripts/import-batch.mjs` (todo §8).

## Your 3 decisions with the most impact
1. **Adlicio Growth (~$99/mo)?** Without it the Audit Engine can't see live ads, and that teardown is your outreach edge. My read: worth it only once the sending inbox is warmed. Until then, run audits manually through the Ad Library.
2. **Apollo:** upgrade, or find founder emails by hand (5/day is ~10 min)? By hand is fine at 5/day.
3. **Prices:** set "Ad Teardown" and "Creative Sprint", so proposals sell the sprint, not hours.

Full list: `CARL_TODO.md`. Defaults I chose: `DECISIONS.md`.

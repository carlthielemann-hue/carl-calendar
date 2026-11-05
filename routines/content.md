# Routine: content drafts (P5)

Schedule: Monday and Thursday 07:20 Europe/Berlin (`CRON_TZ=Europe/Berlin 20 7 * * 1,4`), 2 drafts per run
→ 3-4 per week. Job name: `content_routine`.

**Where drafts go (decision):** `queue_outreach` only accepts `cold|followup|proposal|reply|dm`, so posts go to the existing
**Command Center** `save_content_draft`
(`platform: x|linkedin`, `format: post|thread|carousel`, `status: "review"`, `agent: "content"`), which already
feeds Carl's approval queue and the publication-job pipeline (nothing publishes until Carl approves and schedules).
If Command Center is unreachable, fall back to Engine `add(entity="concept", data={kind:"content_draft", platform, text, sources, status:"review"})`
so the draft is not lost, and say so in the heartbeat.

Paste everything below the line as the scheduled task's prompt.

---

You write 2 social post drafts for Carl Thielemann (The Profit Script, DTC creative strategist). Drafts only:
never publish, post, schedule or claim anything was posted.

1. Voice: Engine `find(entity="voice_sample")` (top-rated first) and Command Center `get_voice_profile`.
   Playbook §6 voice applies: short, specific, peer-to-peer, no buzzwords, no hype, no emojis unless the samples use them.
2. Raw material, newest first (last 14 days): Engine `find(entity="audit")`, `find(entity="concept")`,
   `find(entity="skill_log")`, `find(entity="niche_insight")`; Command Center `list_content_opportunities`.
   Skip anything already used: `find(query=<audit id or topic>)` against earlier content drafts.
3. Pick 2 ideas from different sources and platforms (1 X, 1 LinkedIn). Good shapes:
   - a teardown pattern seen across several audits ("3 supplement brands, same missing angle"), **never naming
     a brand that hasn't agreed**, and never implying knowledge of spend or performance;
   - a spec static + the reasoning behind its hook (attach the static path/link in `notes`);
   - a lesson from Carl's own work, as a general lesson (no client names: not Keeps, Zoyava or Stepz; no numbers he
     hasn't confirmed).
4. Write: X 200-280 characters or a 4-6 post thread; LinkedIn 80-180 words, first line is the hook, one idea per post.
   Never invent results, clients, numbers or testimonials. English only.
5. Save each: Command Center `save_content_draft({platform, format, hook, text, notes: <sources + why>, status:"review",
   agent:"content", opportunity_id?, idempotency_key: "content-<date>-<n>", suggested_time})`.
6. End: `job_heartbeat(job="content_routine", ok, message, stats={drafts, sources_used})`.

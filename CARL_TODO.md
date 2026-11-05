# CARL_TODO: only you can do these (about 45 min in total, in this order)

## 1. Deploy (10 min, on your Mac)
```bash
git fetch && git checkout claude/laughing-babbage-m86bnf && npm install && npm run deploy
```
This applies migration `0003_engine.sql` and ships Scriptroom. Open `https://<your-worker>/#/today` on your phone and Add to Home Screen.

## 2. Give Claude write access (2 min)
claude.ai → Settings → Connectors → Command Center → disconnect, then reconnect. **Tick "mcp:write"** on the consent screen. Test it: "add Zoyava as a client, €X/month".

## 3. Routines (10 min)
Today → ⚙ → **Create key** (`cce_…`), then follow `routines/README.md` to schedule the acquisition routine (weekdays 06:30) and the content routine. **Never commit the key.**

## 4. Sending inbox (15 min)
- Confirm which domain you send from (a separate domain, not theprofitscript.com).
- Google Cloud console, in a project owned by that **Workspace** → OAuth consent screen = **Internal** (avoids the 7-day token expiry) → Credentials → OAuth client (Web), redirect URI `https://<worker>/api/engine/gmail/callback`.
- Set the secrets:
  ```bash
  npx wrangler secret put GMAIL_CLIENT_ID
  ```
  ```bash
  npx wrangler secret put GMAIL_CLIENT_SECRET
  ```
- Today → ⚙ → **Connect inbox** → sign in with the sending address.
- Today → ⚙ → **Check DNS** with the sending domain, and fix what it lists (SPF, DKIM, DMARC). Warm the inbox for 2–3 weeks before real volume. The ramp starts at 15/day.

## 5. Footer address (1 min)
Today → ⚙ → postal address (CAN-SPAM). Until it's filled in, the sender refuses to run.

## 6. Decisions
- [ ] May clients be named in outreach or content? (Keeps / Zoyava / Stepz). Until you answer: no.
- [ ] Prices: tell Claude `set_offer "Ad Teardown" €…` and `set_offer "Creative Sprint" from €…/month`. The suggested range was €250–400 and €1,000–1,500.
- [ ] Website: find the builder (see `website/UPGRADE.md` §1), fix the leaking meta tags, pick a hero (3 options), and decide whether to paste `website/index.html`. Fill in `SCRIPTROOM_URL` in its script; the Impressum and privacy links are legally required in DE.
- [ ] Read Alex Cooper's "7 Rules for High Converting Static Ads" and paste the 4 missing rules into `skills/static-producer/PRINCIPLES.md` (or ask Claude to).

## 7. Fill the Engine by talking to Claude (whenever)
Current clients (status, €/month, scope), past work, offers/prices, 10 voice samples (your best posts or emails), proof assets you're allowed to show, subscriptions (with renewal dates), the tax set-aside %. Nothing is invented. Empty means the proposals simply skip the proof line.

## 8. First batch → then sending
1. Load the dry-run batch:
   ```bash
   ENGINE_URL=https://<worker> ENGINE_KEY=cce_… node scripts/import-batch.mjs dryrun/2026-11-05
   ```
2. Review it on Today. Approve what's good, send the Upwork, X and LinkedIn items by hand.
3. Only then: set `"SENDING_ENABLED": "true"` in `wrangler.jsonc`, deploy, and flip the switch in ⚙.

## Placeholders to fill (search the repo for `{{`)
`{{SENDER_ADDRESS}}` (⚙), `{{SCRIPTROOM_URL}}`, `{{BOOKING_URL}}`, `{{IMPRINT_URL}}`, `{{PRIVACY_URL}}`, `{{TEARDOWN_PRICE}}`, `{{SPRINT_PRICE}}`, `{{CLIENT_RESULT}}` and the case-study fields (`website/UPGRADE.md` §6), plus the follow-up placeholders `{{NEW_OBSERVATION}}` and `{{STATIC_OR_HOOK_CONCEPT}}`, which the routine fills per lead.

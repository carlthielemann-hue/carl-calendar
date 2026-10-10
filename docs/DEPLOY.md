# Deploying Command Center (Mac + iPhone, your own server)

The backend is a single **Cloudflare Worker** (`server/`) that serves the app and adds:

| Piece | Cloudflare product | Used for |
| --- | --- | --- |
| Worker | Workers | API, MCP endpoint, OAuth, Google sync, push |
| Database | D1 (SQLite) | Synced records, conflict log, Google mirror, notification queue, logs |
| OAuth state | Workers KV | Tokens for Claude/ChatGPT connectors |
| Files (optional) | R2 | Client assets/uploads available on every device |
| Schedule | Cron trigger (every 15 min) | 07:00 brief, evening reminder, background Google sync |

Everything fits Cloudflare's **free plan** for one person. See the [cost notes](#costs) below.

---

## 1. One-time setup (≈20 minutes)

You need Node 20+ and a free Cloudflare account.

```bash
git clone https://github.com/carlthielemann-hue/carl-calendar && cd carl-calendar
git checkout claude/personal-command-center-j4seaw
npm install
npx wrangler login                                   # opens Cloudflare in the browser

npx wrangler d1 create command-center                # copy the database_id it prints
npx wrangler kv namespace create OAUTH_KV            # copy the id it prints
npx wrangler r2 bucket create command-center-files   # optional — see "Without R2"
```

Paste the two ids into `wrangler.jsonc` (`d1_databases[0].database_id`, `kv_namespaces[0].id`).

### Secrets (never committed — stored encrypted by Cloudflare)

```bash
npx wrangler secret put OWNER_PASSWORD      # the password you'll sign in with (long + unique)
openssl rand -base64 48 | npx wrangler secret put ENCRYPTION_KEY   # encrypts the Google token

node scripts/vapid.mjs                      # prints VAPID keys for push notifications
npx wrangler secret put VAPID_PUBLIC_KEY    # paste the public key
npx wrangler secret put VAPID_PRIVATE_JWK   # paste the private JWK (one line)
npx wrangler secret put VAPID_SUBJECT       # mailto:you@example.com
```

### Deploy

```bash
npm run deploy      # build → apply D1 migrations → wrangler deploy
```

It prints your URL, e.g. `https://command-center.<your-subdomain>.workers.dev`. That's the app.

### Without R2

R2 asks for a payment method on file even inside its free allowance. If you'd rather not add
one, delete the `r2_buckets` block from `wrangler.jsonc`. Everything else works; uploaded files
then stay on the device that uploaded them (IndexedDB), and links to Drive/Frame.io sync normally.

---

## 2. Move your data in (Mac)

1. Open the URL on your Mac → **Settings → Account & sync** → sign in with `OWNER_PASSWORD`.
2. **Set up account…** opens the import wizard:
   - it lists what's in this browser per collection; **demo/sample records are skipped** unless you tick the box;
   - **Download backup** saves everything as JSON first;
   - **Import** copies the selected records into your account.
3. Your old browser data is **not changed** — "Switch to local/demo" in the same panel brings it back.

> If you used the hosted preview (claude.ai artifact), that data lives in a different browser
> origin. Export it there (Settings → Export), then on your deployment use Settings → Import while
> in local mode and run the wizard.

## 3. iPhone

1. Open the URL in **Safari** → Share → **Add to Home Screen**.
2. Open Command Center from the Home Screen icon (push only works there, iOS 16.4+).
3. Settings → sign in → **Set up account… → Start empty instead** (your Mac's data arrives on the first sync).
4. Settings → Notifications → **Enable on this device** → allow.

Sign-in sessions last 60 days per device. Changes made offline are kept and sync when you're back.

---

## 4. Google Calendar

1. [Google Cloud Console](https://console.cloud.google.com/) → new project → **APIs & Services → Library → Google Calendar API → Enable**.
2. **OAuth consent screen** → External → app name "Command Center" → add your Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorised redirect URI: `https://<your-worker-url>/api/google/callback`
4. Store the credentials as secrets:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
5. In the app: **Settings → Google Calendar → Connect (read-only)** → choose which calendars to mirror.

Notes:

- **Read-only first.** Editing from the app needs a second, explicit "Allow editing…" consent, and
  every change to an existing Google event shows a confirmation dialog. Connecting never modifies,
  deletes or bulk-changes anything.
- Synced events are labelled as Google events and are kept separate from local events (they are
  not copied into your synced app data). Re-syncs are incremental and keyed by calendar + event id,
  so they can't duplicate.
- **Testing-mode tokens expire after 7 days.** While the consent screen is in "Testing", Google
  revokes refresh tokens weekly, so you'd have to reconnect. For personal use you can set the
  publishing status to **In production** without verification — Google then shows an "unverified
  app" warning on the consent screen (it's your own app), and the connection stays.
- Times are handled in `Europe/Berlin` (`APP_TIMEZONE` in `wrangler.jsonc`).

---

## 5. Connect Claude and ChatGPT (MCP)

Your MCP server URL is `https://<your-worker-url>/mcp` (also shown in **Settings → AI connections**).

**Claude** (claude.ai or the desktop/mobile apps — Free allows one custom connector; Pro/Max/Team more):
Settings → Connectors → **Add custom connector** → paste the URL → Connect → sign in with your
owner password → approve. Then enable the connector in a chat.

**ChatGPT** (developer mode, beta): Settings → Apps & Connectors → Advanced settings → enable
**Developer mode** → Create → paste the URL, authentication OAuth → sign in and approve.
OpenAI's documentation and third-party guides disagree on whether Plus/Pro can use *write*
tools in developer mode or only read/search; Business/Enterprise can. Read tools work either way.

What the AI can do is controlled in **Settings → AI connections**:

- read tools are always available to an approved client;
- "Allow saving drafts" gates tasks, insights, draft concepts and draft research (everything AI-made is a draft);
- "Allow status changes" gates the one consequential tool, which additionally requires a preview + confirmation;
- clients you mark hidden are invisible to every tool;
- approved clients are listed with a **Revoke** button.

**Manus**: the app can delegate a workflow to Manus through its API (`MANUS_API_KEY`, uses your
Manus credits). Results are fetched back into AI Studio as drafts. The endpoint shapes follow
Manus' public v1 docs and haven't been verified against a live account yet.

## 6. Optional paid API keys

Only needed to run AI Studio workflows *inside* the app (otherwise use "Copy prompt" or MCP with
your existing subscriptions — no extra cost):

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # Claude API (console.anthropic.com), billed per token
npx wrangler secret put OPENAI_API_KEY      # and set OPENAI_MODEL in wrangler.jsonc vars
npx wrangler secret put MANUS_API_KEY
```

Chat subscriptions (Claude Pro, ChatGPT Plus, Manus plans) do **not** include API access; API
usage is billed separately. Usage for the last 30 days is shown in Settings → AI connections.

---

## Costs

| Item | Cost |
| --- | --- |
| Cloudflare Workers, D1, KV, cron (free plan) | €0 — limits: 100k requests/day, 5 GB D1, 1k KV writes/day |
| R2 (optional) | €0 up to 10 GB; needs a payment method on file |
| Google Calendar API | €0 |
| Claude/ChatGPT via MCP | €0 beyond your existing subscription |
| Claude / OpenAI API (optional) | pay per token — only when you click "Run" in AI Studio |
| Manus API (optional) | your Manus plan's credits |
| X API (not built) | pay-per-use (reported ≈ $0.005/read, $0.015/post) |

One caveat: the free Workers plan allows ~10 ms of CPU per request. Normal use is far below that,
but if a very large dataset ever makes MCP or sync requests fail with "exceeded CPU", the Workers
Paid plan ($5/month) lifts the limit. Nothing paid is required to start.

---

## Backups & recovery

- **Settings → Account & sync → Account backup** downloads every record as JSON.
- `npx wrangler d1 export command-center --remote --output backup.sql` for a full database dump.
- Edits made on two devices at once keep the newest version; the other one is stored in the
  conflict log (Settings → Account & sync) where you can restore it.
- Local/demo data stays in each browser and can be exported from Settings → Data & storage.

## Updating

```bash
git pull && npm install && npm run deploy   # applies new D1 migrations automatically
```

### After updating to V4

Nothing new to set up — no new secrets, no new migrations. New in the AI connectors: School, Fitness,
Money and Goals tools plus `search_swipes` / `save_swipe`. Money and grades stay hidden from AI until
you turn them on in Settings → AI connections → “What AI can see”. To save ads from your iPhone, follow Swipe vault →
*Save from phone* (a one-time Shortcut).

### After updating to Command Center 2.0

No database migration and no new secrets. `git pull` and `npm run deploy`, then reload the app on
each device (on iPhone: close and reopen the home-screen app). New data (My Space, Cue, knowledge…)
syncs like everything else. To let Manus use Cue, reconnect the Command Center MCP connector in Manus
so it sees the new `cue_*` and knowledge tools; Settings → Integrations shows when each connected app
last called in. See [COMMAND_CENTER_BUILD_STATUS.md](COMMAND_CENTER_BUILD_STATUS.md) for what is verified.

### After updating to Command Center 2.1

No migration and no new secrets. `git pull`, `npm install`, `npm run deploy`; reload the app on
each device. Then follow [MANUS_INTEGRATION.md](MANUS_INTEGRATION.md): reconnect the Manus
connector (new tools), give each Cue its instructions, and register recurring workflows. Push for
the new notification categories uses the same device subscription as before. Choose which
categories push in Settings → Notification centre.

### Notifications and widgets

* **Pop-ups**: Settings → Notifications → *Enable on this device* — on iPhone only from the Home
  Screen app (Share → Add to Home Screen, iOS 16.4+), on Mac in Safari/Chrome. Besides the morning
  brief and evening reminder you can switch on: before blocks start, exams, still-open-today,
  subscription renewals, Sunday planning, and set quiet hours. The cron runs every 15 minutes, so
  "before blocks" arrives within that window. Every subscribed device gets every alert.
* **App icon badge**: overdue + due-today count on the Home Screen icon (needs notifications on).
* **Widgets**: Settings → Widgets → *Create script*, then paste it into the free
  [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) app and add a Scriptable widget
  (home screen small/medium/large, lock screen). It uses its own read-only key
  (`GET /api/widget`, revocable, stored hashed) — never your password or session. Money is off on
  widgets unless you turn it on; grades never show. On macOS 14+ the same iPhone widget can sit on
  the Mac desktop.

## Local development

```bash
cp .dev.vars.example .dev.vars    # then fill in OWNER_PASSWORD etc. (never committed)
npm run server:dev                # https://localhost:8787 with local D1/R2/KV
npm run test:server               # 24 API/MCP/alerts/widget checks   (NODE_TLS_REJECT_UNAUTHORIZED=0)
npm run test:sync                 # 2-device sync e2e   (BASE_URL=https://localhost:8787)
npm run test:v3                   # V3 workflows e2e
```

# theprofitscript.com: upgrade plan

Status: Nov 2026. Files in this folder:

- `index.html`: the new landing page. One file, no build step, inline CSS, Inter from Google Fonts.
- `case-study-template.html`: case-study page (problem → research insight → concept → result). Copy it to `case-study-1.html`, `case-study-2.html` and so on.
- `UPGRADE.md`: this plan.

Hard rule for everything below: never publish a result, client name, testimonial or number that isn't real and approved by the client. Every `{{PLACEHOLDER}}` gets real content or is deleted. Client brands (Keeps, Zoyava, Stepz) are not named anywhere unless the client signs off in writing.

---

## 1. Host / builder: NOT CONFIRMED (could not reach the site from here)

This session's network policy blocked every route to the live site:

- `curl https://theprofitscript.com/`: proxy `403 connect_rejected`
- DNS-over-HTTPS (`cloudflare-dns.com`): `403 connect_rejected`
- WebFetch: `ENOTFOUND` (host outside the allowed domains)
- Adlicio `inspect_landing_page`: needs the Growth plan (account is on Free)

So the host and builder are not verified, and no live HTML was saved. To get them, allow `theprofitscript.com` in the session network settings and rerun the checks below. Carl can also do it himself in 2 minutes:

| Check | How | What it tells you |
|---|---|---|
| Generator tag | Open the site → right-click → View Page Source → Ctrl/Cmd+F `generator` | `Framer`, `Webflow`, `Wix.com`, `Squarespace`, `Carrd`, `Durable` and others name themselves here |
| Asset hosts | In the same source, search `framerusercontent`, `website-files.com` / `webflow`, `wixstatic`, `squarespace-cdn`, `carrd.co`, `lovable`, `gptengineer`, `_next/` | The asset CDN identifies the builder even with no generator tag |
| Response headers | `curl -sI https://theprofitscript.com` | `server: Netlify`, `x-vercel-id`, `server: GitHub.com`, `x-wix-request-id`, `server: Squarespace`, `cf-ray` (Cloudflare Pages) |
| DNS | `dig +short theprofitscript.com A; dig +short www.theprofitscript.com CNAME` | `185.199.108–111.153` = GitHub Pages; `75.2.60.5` = Netlify; `76.76.21.21` / `cname.vercel-dns.com` = Vercel; `proxy-ssl.webflow.com` = Webflow; Framer / Squarespace / Wix / Carrd IPs or CNAMEs name the builder |
| Registrar dashboard | Wherever the domain was bought | Shows the DNS records you set up when you connected the builder |

## 2. The leaking meta tags: cause and fix

**Symptom:** text like `width=device-width, initial-scale=1` or the page title shows up as visible text on the page.

**Why it happens:** a real `<meta>` or `<title>` tag never renders as visible text, even when it ends up in `<body>`. Visible tag text means the browser received it as text, not as markup. That happens in one of three ways, depending on the builder:

1. **Tags pasted into a text or rich-text block** instead of a code or head setting. The builder escapes `<` as `&lt;`, so the tag shows as literal text. This is the most common cause on Framer, Webflow, Wix, Squarespace and Carrd.
2. **Tags inside an element whose content is always text**, such as a `<title>`, `<textarea>` or `<noscript>` placed in body custom code, or a `<title>` that was never closed. Everything after it shows as text.
3. **Hand-written HTML or an AI builder (GitHub Pages, Netlify, Vercel, Lovable)** where the `<head>` block was duplicated into the body, or (GitHub Pages / Jekyll) an `index.md` holds the HTML in an indented or fenced code block, so it renders as text.

**Confirm which one:** View Source → Ctrl/Cmd+F `viewport`. If you find `&lt;meta name="viewport"`, it is cause 1. If you find a real `<meta name="viewport">` inside `<body>` right after an unclosed `<title>` or a `<textarea>`/`<noscript>`, it is cause 2. If you find a second `<html>`/`<head>` or a ```` ``` ```` fence, it is cause 3.

**Fix steps by builder:**

- **Framer:** Find the text layer holding the tags in the Layers panel (search "viewport") and delete it. If it is an Embed component, delete it too. Framer sets the viewport itself. Set the title and description under Site Settings → General / SEO (and per page under Page Settings → SEO). Only tracking scripts go in Site Settings → General → Custom Code → "End of `<head>` tag". Publish.
- **Webflow:** Delete the Text Block / Rich Text / Embed holding the tags. Set Title Tag and Meta Description in Page Settings → SEO Settings, and Open Graph under Page Settings → Open Graph. Webflow adds the viewport tag itself. Site-wide head code belongs in Site Settings → Custom Code → Head Code, never in an Embed. Publish.
- **Wix:** Delete the text element. Set title and description under Pages → ⋯ → SEO basics. Custom head code goes under Settings → Custom Code → "Head". Publish.
- **Squarespace:** Delete the Text or Code block. Set title and description under Pages → ⚙ → SEO, and the site defaults under Marketing → SEO. Head code goes under Settings → Advanced → Code Injection → Header. Save.
- **Carrd:** Delete the Text element or Embed holding the tags. Set title and description under Site → Settings → Metadata. Head code goes in an Embed element with Type "Code", Style "Hidden", Location "Head". Publish.
- **Hand-written / GitHub Pages / Netlify / Vercel / Lovable:** Replace the site with `website/index.html` from this folder. Its `<head>` is correct. On GitHub Pages, publish it as `index.html` (not `.md`) and delete any `index.md` that shadows it.

**Verify after the fix:** View Source has exactly one `<meta name="viewport">` and one `<title>`, both inside `<head>`. Nothing tag-like is visible on the page. Paste the URL into the LinkedIn Post Inspector or the opengraph.xyz preview and check that the title, description and image are right.

**Fastest overall fix:** If the builder lets you replace the whole page or host a static file, ship `index.html` from this folder. It fixes the head and replaces the copy in one go. If you can't paste HTML (Framer, Squarespace, Wix), rebuild the sections in the builder using the paste-ready copy in section 5.

---

## 3. Hero options

The current headline, "Creative Strategy that moves revenue.", is generic: it states a category plus a claim any agency could make. Each option below pairs a specific promise with the mechanism behind it.

**A (recommended).** "Ad concepts built from what your customers actually say."
Sub: "I mine reviews, Reddit threads and comment sections for the exact words your buyers use, then turn them into ready-to-test statics and video scripts. Research to first batch in 7 days."
*Why:* It names the mechanism (customer language), which is the differentiator. The output (statics and scripts) and the speed (7 days) make it concrete, and it makes no unprovable revenue claim.

**B.** "Your next winning angle is already in your reviews."
Sub: "Customer research turned into Meta ad concepts, with every hook traced back to a real quote. Statics and scripts, ready to test."
*Why:* Curiosity-led and strong as an ad or LinkedIn hook, but slightly less clear about what you get.

**C.** "Running out of ad angles? I'll find new ones in your customers' own words."
Sub: "Research-led creative strategy for DTC brands on Meta: angles, statics and UGC scripts, delivered as a test plan."
*Why:* Leads with the pain (creative fatigue), which suits cold traffic. It reads more like an ad than a positioning statement.

`index.html` uses **A**. Before publishing, confirm that "7 days" is a turnaround you can keep (`{{TURNAROUND_DAYS}}` if not). If it isn't, change it.

---

## 4. New page structure (implemented in `index.html`)

1. **Sticky nav.** Logo, anchors (How it works · Work · Offer · About), and a "Free teardown" button.
2. **Hero.** Headline A, sub, 3 proof-of-method bullets, secondary CTA "Book a call" (`{{BOOKING_URL}}`).
   **Primary CTA, the teardown form** (same screen as the hero on desktop, directly below it on mobile): "Get a free 5-minute teardown of your Meta ads", with fields for name, brand URL and email, plus a hidden honeypot field `website`.
   - POSTs JSON `{name, brand_url, email, website: ""}` to `{{SCRIPTROOM_URL}}/api/public/teardown`. The base URL is the `SCRIPTROOM_URL` constant at the top of the `<script>` at the bottom of the file.
   - On success it swaps to a "Got it" state with a "Book a call" button.
   - On failure, or while `SCRIPTROOM_URL` is still a placeholder, it shows a "Send it by email instead" mailto link with the request pre-filled (`CONTACT_EMAIL` constant).
   - If the honeypot is filled, it fakes success and sends nothing.
   - The endpoint must allow CORS from `https://theprofitscript.com` (OPTIONS preflight plus `Access-Control-Allow-Origin`).
3. **How it works.** 3 steps: Customer research → Angles and concepts → Ready-to-test creative.
4. **Proof gallery.** 4 ad image slots (`{{AD_IMAGE_1..4}}`). Use real statics or script frames, with permission, and blur or remove the brand if needed.
5. **Case-study cards.** 3 cards linking to `case-study-1..3.html`, built from `case-study-template.html`. These replace the external Google Docs links. A case study with no approved number shows the qualitative outcome instead, or the card is removed.
6. **Offer.**
   - **Ad Teardown:** entry product, "from €`{{TEARDOWN_PRICE}}`", one-off.
   - **Creative Sprint:** monthly, "from €`{{SPRINT_PRICE}}` / month", with deliverable counts as placeholders.
7. **About.** Research-led strategist and DR copywriter. The consulting background (Roland Berger internship, Paris) is framed as rigour, plus EN/DE. It leads with the work, and age is not mentioned.
8. **Final CTA.** Teardown plus "Book a call".
9. **Footer.** Email, Impressum and privacy links. These are legally required in Germany/EU, so add them before launch.

### Case-study page (`case-study-template.html`)
Header stats (result, concepts tested, timeframe) → 01 Problem → 02 Research insight (with a verbatim customer quote and its source) → 03 Concept (creative image) → 04 Result (with an optional real testimonial) → CTA back to the teardown form. Delete any stat or testimonial block you can't fill truthfully.

---

## 5. Paste-ready copy (for Framer / Webflow / Wix / Squarespace / Carrd)

Use this if the builder can't take the HTML file. Build each block as a normal section in the builder. Never paste `<meta>` or `<title>` tags into a text block.

**SEO / page settings**
- Title: `The Profit Script | Research-led ad creative for DTC brands`
- Description: `Ad concepts built from what your customers actually say. Customer research to ready-to-test statics and video scripts for DTC brands on Meta. Get a free 5-minute teardown of your Meta ads.`
- OG image: 1200×630 (`{{OG_IMAGE_PATH}}`)

**Hero**
- Eyebrow: CREATIVE STRATEGY FOR DTC BRANDS ON META
- H1: Ad concepts built from what your customers actually say.
- Sub: I mine reviews, Reddit threads and comment sections for the exact words your buyers use, then turn them into ready-to-test statics and video scripts. Research to first batch in 7 days.
- Bullets: Every angle traced back to a real customer quote, not a brainstorm. / Briefs your designer or editors can produce without a call. / Built for testing: clear hypothesis per concept, so you learn from every launch.
- Secondary link: Rather talk first? Book a call → `{{BOOKING_URL}}`

**Form card**
- Title: Get a free 5-minute teardown of your Meta ads
- Text: I review your live ads in the Meta Ad Library and send you a short video: what's working, what's missing, and 2 angles you're not testing yet.
- Fields: Your name · Brand website · Email. Button: Send me my teardown
- Under the button: Free, no call required. Your email is only used to send the teardown and one follow-up.
- Success message: Got it. Your teardown is on its way. You'll get it by email within `{{TEARDOWN_TURNAROUND}}`.
- Wiring: If the builder's native form can send a webhook (Framer forms, Webflow via Zapier/Make, Carrd Pro "Send to URL"), point it at `{{SCRIPTROOM_URL}}/api/public/teardown` with the keys `name`, `brand_url`, `email`. Otherwise use the builder's form-to-email option for now.

**How it works**
- H2: Research first. Then concepts. Then tests.
- Lead: Most ad fatigue is an angle problem, not a design problem. The fix starts with listening to the people who already buy.
- 01 Customer research: Reviews, competitor reviews, Reddit, forums and comment sections. I pull the pains, objections, desired outcomes and exact phrases your buyers use.
- 02 Angles and concepts: Each insight becomes an angle, each angle a concept: hook, message and format, with the customer quote it came from attached.
- 03 Ready-to-test creative: Static ad copy and layout briefs plus UGC and video scripts, organised as a test plan so every launch tells you something.

**Selected work**
- H2: Statics and scripts from recent projects.
- Lead: Real ads from client projects, shared with permission. Swipe through, then read how each one was built.
- 4 images plus 3 case-study cards (category · result · headline · "Read the case study →").

**Offer**
- H2: Start small. Keep going if it works.
- Ad Teardown (Start here): from €`{{TEARDOWN_PRICE}}`, one-off. A deep review of your current Meta creative against what your customers actually say. Includes an audit of your live ads and top competitors' ads, a customer-language research summary, `{{TEARDOWN_ANGLE_COUNT}}` new angles with example hooks, and a recorded walkthrough plus written doc. Button: Book a teardown.
- Creative Sprint (Monthly): from €`{{SPRINT_PRICE}}` / month. Ongoing research and new concepts every month, so you never run out of things worth testing. Includes ongoing customer and competitor research, `{{SPRINT_STATIC_COUNT}}` static concepts per month with copy and briefs, `{{SPRINT_SCRIPT_COUNT}}` video/UGC scripts per month, a monthly test plan and results review, and async updates with one call per month. Button: Book a call.

**About**
- H2: Hi, I'm Carl.
- I'm a research-led creative strategist and direct-response copywriter for DTC brands. My work starts where most creative skips: reading what customers write about the problem, the product and the alternatives, then building concepts from their words.
- I came to creative strategy from consulting, where I learned to structure messy information into a clear recommendation. I bring the same rigour to ad research: every concept has a reason, and every reason has a source.
- Focus: DTC brands advertising on Meta, especially health, wellness and personal care · Background: Strategy consulting internship at Roland Berger, Paris · Languages: English and German

**Final CTA**
- H2: See what your ads are missing.
- Five minutes, free, and you keep the angles whether we work together or not. Buttons: Get my free teardown · Book a call

---

## 6. Placeholders Carl must fill

**Config (in `index.html` `<script>`):** `{{SCRIPTROOM_URL}}` (base URL, no trailing slash) and `{{CONTACT_EMAIL}}`, which also appears in the footer.

**Links:** `{{BOOKING_URL}}` (Cal.com/Calendly, used 5×), `{{IMPRINT_URL}}`, `{{PRIVACY_URL}}`, `{{OG_IMAGE_PATH}}` (1200×630 image).

**Copy facts to confirm:** `{{TEARDOWN_TURNAROUND}}` (e.g. "48 hours"). Also confirm the "7 days" promise in the hero and the "2 angles" claim in the form text, and change them if they aren't true.

**Offer:** `{{TEARDOWN_PRICE}}`, `{{TEARDOWN_ANGLE_COUNT}}`, `{{SPRINT_PRICE}}`, `{{SPRINT_STATIC_COUNT}}`, `{{SPRINT_SCRIPT_COUNT}}`. Also review the deliverable bullets (e.g. "one call per month") against what you actually sell.

**Proof:** `{{AD_IMAGE_1..4}}`, `{{CATEGORY_1..4}}`, `{{CASE_1..3_CATEGORY}}`, `{{CASE_1..3_RESULT}}`, `{{CASE_1..3_HEADLINE}}`, `{{PORTRAIT_PHOTO}}`.

**Case-study template:** `{{CASE_HEADLINE}}`, `{{CASE_META_DESCRIPTION}}`, `{{CASE_OG_IMAGE_PATH}}`, `{{CLIENT_CATEGORY}}`, `{{CASE_ONE_LINE_SUMMARY}}`, `{{CLIENT_RESULT}}`, `{{RESULT_METRIC_LABEL}}`, `{{CONCEPTS_TESTED}}`, `{{TIMEFRAME}}`, `{{PROBLEM_HEADLINE}}`, `{{PROBLEM_DESCRIPTION}}`, `{{WHAT_WAS_ALREADY_TRIED}}`, `{{INSIGHT_HEADLINE}}`, `{{RESEARCH_SOURCES_AND_METHOD}}`, `{{VERBATIM_CUSTOMER_QUOTE}}`, `{{QUOTE_SOURCE}}`, `{{WHY_THIS_INSIGHT_MATTERED}}`, `{{CONCEPT_NAME}}`, `{{CONCEPT_DESCRIPTION_ANGLE_HOOK_FORMAT}}`, `{{AD_CREATIVE_IMAGE}}`, `{{OTHER_VARIATIONS_TESTED}}`, `{{RESULT_HEADLINE}}`, `{{CLIENT_RESULT_DETAIL}}`, `{{WHAT_WE_LEARNED_AND_NEXT_STEP}}`, `{{CLIENT_TESTIMONIAL}}`, `{{TESTIMONIAL_NAME_AND_ROLE}}`.

Check before launch: `grep -o '{{[A-Z0-9_]*}}' website/*.html | sort -u` should return nothing.

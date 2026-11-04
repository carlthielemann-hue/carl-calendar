# Compliance checklist for statics

This is a working checklist, not legal advice. When a client sells regulated products
(Rx, OTC drugs, supplements with disease-adjacent positioning, telehealth), their legal and
regulatory team approves the final copy. Policies change, so check the primary sources linked
at the bottom before relying on any rule here.

## 1. Claims

- **Substantiate every on-image claim.** Each claim the static makes (numbers, "clinically
  shown", "#1", ingredient benefits, comparisons) goes in the concept's `claims[]` with its
  source. A claim without a source gets cut.
- **No disease claims for cosmetics or supplements.** Don't write "treats / cures / prevents /
  heals" a condition. Cosmetics can say how a product looks or feels ("feels softer"), not what it
  does to the body. Supplement structure/function claims need the DSHEA disclaimer
  ("These statements have not been evaluated by the Food and Drug Administration...").
- **Rx / telehealth:** state that a prescription is needed, that an online consultation with a
  licensed provider is required, and that individual results vary. Give realistic timeframes.
  Don't suggest guaranteed outcomes.
- **Comparisons (`comparison`, `us_vs_them`):** compare against a generic category ("typical
  lotion"), not a named competitor, unless legal has cleared the specific comparison and it is
  substantiated. Every tick and cross is a claim.
- **Prices and offers (`offer`):** compare-at prices must be real prior or prevailing prices.
  "Free", guarantees and subscriptions need their key terms visible ("terms apply", "auto-renews",
  "cancel anytime" only if true).
- **Stats** need an attribution line in the `disclaimer`/footnote (study, n, timeframe).

## 2. Endorsements and reviews (FTC)

- Only use **real reviews**, quoted accurately, with the customer's permission. Never invent
  reviews or reviewer names for live ads. The FTC's 2024 rule on fake reviews and testimonials
  prohibits fabricated or AI-generated reviews and undisclosed insider reviews.
- In the example JSON, `review.placeholder: true` renders a "Sample review (placeholder copy)"
  chip. Before shipping, replace the review with a real one and remove the flag.
- **Typical results:** if a testimonial describes a specific result, the FTC assumes viewers will
  read it as typical. Show what users generally achieve, or don't use the testimonial.
  "Results not typical" alone is not enough (FTC Endorsement Guides, 16 CFR Part 255).
- **Material connections:** if the reviewer was paid, sent free product or is staff, say so
  ("Paid partner", "Received free product").

## 3. On-image labels this skill supports

| Label | When | How |
|---|---|---|
| `Actor portrayal` | A person shown isn't the actual customer, or a model or actor speaks a testimonial | `"labels": ["Actor portrayal"]` |
| `Illustration` | Any depiction that isn't a real photo of a real outcome. **Always on `before_after`** (hard-coded) | automatic on before_after, otherwise `labels` |
| `Spec concept · not affiliated with <brand>` | Spec work or pitches for brands that are not clients. Carl's portfolio, outreach, audits | `"spec": true` (`spec_brand` to override the name) |
| `Sample review (placeholder copy)` | Mock reviews in drafts or specs | `review.placeholder: true` |

Spec ads that use a real brand's name or product are **for pitching only**. Never run them as
paid ads, and never publish them anywhere they could be taken for the brand's own ads. Don't use
the brand's trademarks beyond what's needed to show the concept.

## 4. Meta advertising standards (high level)

- **Personal attributes:** copy must not assert or imply things about the viewer's health,
  body, age, finances and similar attributes. Write "Dry hands at 9pm?", not "Your eczema is
  flaring?" or "You're overweight".
- **Health and wellness / body image:** no negative self-perception framing. Before/after
  images of bodies or health results are heavily restricted (weight loss is the strictest) and
  often rejected. The `before_after` layout here is limited to **routines, objects or
  situations** (shelf clutter vs one product), always labelled "Illustration".
- **Restricted categories** (Rx drugs, telehealth, supplements, weight loss, cosmetic
  procedures): age targeting at 18+ and, for Rx, certification such as LegitScript may be
  required. Check before launch.
- **Native/UGC layouts:** a "phone note" or "tweet" must not imitate a real person's account
  or a real platform's verified UI in a misleading way. Use the brand's own name or a clearly
  fictional persona with `Actor portrayal`. Don't fake engagement counts (the template shows none).
- **Text and safe zones:** Meta dropped the old 20% text rule, but text-heavy images can still
  get less delivery. Keep key text inside the safe area (the renderer does this).

## 5. Pre-ship checklist

- [ ] Every claim is in `claims[]` with a source and the client has approved it
- [ ] No disease, cure or treatment language (cosmetics/supplements), and no personal-attribute "you" language
- [ ] Required disclaimers are in the footnote (DSHEA, Rx and consult, results vary, offer terms)
- [ ] Reviews are real, permissioned, typical, with material connections disclosed. The `placeholder` flag is gone
- [ ] Labels applied: Actor portrayal / Illustration / Spec concept where relevant
- [ ] Prices and compare-at prices are accurate on launch day
- [ ] For a spec: `spec: true` is set and the concept isn't uploaded to any ad account

## Sources

- FTC Endorsement Guides (16 CFR 255) and FAQs: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- FTC final rule banning fake reviews and testimonials (2024): https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials
- FTC Health Products Compliance Guidance: https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance
- Meta Advertising Standards, Personal Health and Appearance: https://transparency.meta.com/policies/ad-standards/objectionable-content/personal-health-and-appearance
- Meta Advertising Standards, Health and Wellness: https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness
- FDA, structure/function claims for dietary supplements: https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/structurefunction-claims

---
name: static-producer
description: Render DTC static Meta ad variants (comparison, testimonial, us-vs-them, ingredient callouts, native/UGC note or tweet, offer/price, safe before-after) from a concept JSON into on-brand PNGs at 1080x1350 and 1080x1080, plus a contact sheet for review. Use when producing or iterating static ad concepts, spec ads for prospects, or test batches of headline variants.
---

# Static Producer

HTML/CSS templates rendered with Python + Playwright (headless Chromium).
One concept JSON in, a folder of consistently named PNGs out.

## Quick start

```bash
python3 skills/static-producer/render.py skills/static-producer/examples/spec_concept.json --out out/statics
# options
#   --sizes 1080x1350 1080x1080      subset of sizes (default: both)
#   --layouts comparison offer       subset of layouts (default: all listed in the concept)
#   --no-contact-sheet
#   --debug-safe-zone                pink overlay showing the safe area
```

From Python (e.g. the Audit Engine):

```python
import sys; sys.path.insert(0, "skills/static-producer")
from render import render_concept, load_concept
paths = render_concept(load_concept("concept.json"), "out/statics")  # -> list[str], contact sheet last
# or render_concept(concept_dict, out_dir, sizes=[...], layouts=[...], base_dir="dir/for/relative/paths")
```

Requirements: `pip install playwright` (Python package only). Chromium must already be
present (`PLAYWRIGHT_BROWSERS_PATH`); `p.chromium.launch()` is called with no options.
If the Python package version expects a different Chromium build than the one installed,
pin it to match (e.g. `pip install playwright==1.63.0` to match `/opt/node-tools`), and don't
run `playwright install` in managed sandboxes. Fonts: Inter is loaded from
`node_modules/@fontsource-variable/inter` via file://, falling back to system sans.

## Output

```
<brand>_<concept-slug>_<layout>_<variant>_<size>.png   e.g. northfield_one-tin-routine_us-vs-them_b_1080x1350.png
<brand>_<concept-slug>_contact-sheet.png
```

`brand` = `brand.slug` (or slugified name); `variant` = headline key (`a`, `b`, ... or the keys you give).
Count = layouts x headline variants x sizes. The example gives 7 x 2 x 2 = 28 statics plus the sheet.

## Layouts (`templates/<name>.html`)

| type | use it for | concept data key |
|---|---|---|
| `comparison` | feature chart, brand column vs "typical X" | `comparison.rows[{label, us, them}]`, `us_label`, `them_label`, `stat` |
| `testimonial` | review-led, stars + pull quote + review card | `review{text, name, location, rating, verified, placeholder}` |
| `us_vs_them` | split panel, crosses vs ticks | `us_vs_them{us[], them[], us_label, them_label}` |
| `callouts` | ingredients / features around the product | `callouts[{title, text}]` (max 4) |
| `native` | organic-looking phone note / tweet / text post, no CTA button | `native{style: note,tweet,post, body, author, handle, timestamp}` |
| `offer` | price, compare-at, badge, offer bullets | `offer{price, compare_at, badge, price_note, bullets[], terms}` |
| `before_after` | routine/situation change as an **Illustration** (never body/skin/health results) | `before_after{before_label, after_label, before_points[], after_points[], before_items}` |

Any layout-specific key can also be set inside the layout entry to override the concept-level value,
e.g. `{"type": "testimonial", "headlines": {"a": "...", "b": "..."}, "review": {...}, "cta": null}`.

## Concept JSON

See `examples/spec_concept.json` (fictional brand "Northfield Botanics"). Main fields:

- `brand`: `name`, `slug`, `wordmark`, `logo` (image path, optional), `colors`
  (`primary, secondary, accent, bg, ink, muted, surface, on_primary`), `fonts` (`heading`, `body`), `font_files` (`{family: path}`)
- `slug`, `angle`, `eyebrow`, `subhead`, `cta`, `disclaimer`
- `headlines`: list (variants a, b, c...) or dict `{key: text}`. Wrap words in `**...**` to highlight them.
- `product`: `{name, variant}` used for the CSS jar mock when no `product_image` is given
- `product_image`: path to a transparent PNG product shot (relative to the JSON file)
- `background`: `{type: gradient}` (default), `{type: solid, color}`, or `{type: image, path}` (generated or shot background)
- `claims`: `[{text, substantiation}]` for the compliance log (not rendered; every on-image claim should be in here)
- `spec`: `true` renders "Spec concept · not affiliated with <brand>" (override name with `spec_brand`)
- `labels`: extra compliance chips, e.g. `["Actor portrayal"]`
- `layouts`: list of layout names or objects (see table); default is all seven

## Design rules baked in

- 4:5 keeps key text out of the top/bottom 14% (189px) so the asset survives Reels/Stories
  overlays; 1:1 uses a 60px margin. Use `--debug-safe-zone` to check.
- Auto-fit: if copy overflows the safe area, headline/body text scales down together (to 50% at most).
  If something still looks cramped, the copy is too long. Cut it rather than shrinking the type.
- One message per static. Headline at 60-85px, readable at thumbnail size. See `PRINCIPLES.md`.
- Compliance labels are rendered on-image. Read `COMPLIANCE.md` before shipping anything.

## Workflow

1. Write the concept JSON: angle, 2-3 headline variants, the layouts that fit the angle, and claims with substantiation.
2. Render, then open the contact sheet and kill weak variants.
3. Run the `COMPLIANCE.md` checklist.
4. Ship the PNGs. Keep the JSON next to them so the batch can be regenerated.

## Adding a layout

Add `templates/<name>.html` (a `<style>` block plus markup using `{{slot}}` placeholders; slots ending
in `_html` are inserted raw, everything else is escaped), add a `slots_<name>` builder and register it in
`BUILDERS`/`LAYOUTS` in `render.py`. Put key content in `<div class="safe" data-fit-box>` and mark
shrinkable text with `data-fit`.

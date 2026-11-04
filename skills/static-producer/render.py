#!/usr/bin/env python3
"""Static Producer: render DTC static ad concepts (HTML/CSS templates -> PNG).

CLI:
    python3 skills/static-producer/render.py concept.json --out outdir

Library:
    from render import render_concept          # (add skills/static-producer to sys.path)
    paths = render_concept(concept_dict, "out/dir")

Output naming:
    <brand>_<concept-slug>_<layout>_<variant>_<size>.png
    <brand>_<concept-slug>_contact-sheet.png

Requires: `pip install playwright` (Python package only; uses the Chromium
already on the machine via PLAYWRIGHT_BROWSERS_PATH -- do not run
`playwright install` in managed environments).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / "templates"
REPO_ROOT = HERE.parents[1]
INTER_WOFF2 = REPO_ROOT / "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"

LAYOUTS = [
    "comparison",
    "testimonial",
    "us_vs_them",
    "callouts",
    "native",
    "offer",
    "before_after",
]

SIZES = {
    # name: (width, height, safe_top, safe_bottom)
    # 4:5 keeps key text out of the top/bottom ~14% so the same asset survives
    # Reels/Stories placements and UI overlays.
    "1080x1350": (1080, 1350, 189, 189),
    "1080x1080": (1080, 1080, 60, 60),
}

DEFAULT_COLORS = {
    "primary": "#1F3D2B",    # dominant brand color (panels, CTA)
    "secondary": "#E9E2D3",  # soft surface / secondary panels
    "accent": "#D98E3F",     # highlights, badges, stars
    "bg": "#F6F2EA",         # canvas
    "ink": "#151A16",        # main text
    "on_primary": "#FFFFFF", # text on primary
    "muted": "#6B6F68",      # secondary text
    "surface": "#FFFFFF",    # cards
}

# --------------------------------------------------------------------------- helpers

def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", str(s).strip().lower())
    return re.sub(r"-{2,}", "-", s).strip("-") or "x"


def esc(s: Any) -> str:
    return html.escape("" if s is None else str(s))


def rich(s: Any) -> str:
    """Escape, then allow **highlight** markup and line breaks."""
    out = esc(s)
    out = re.sub(r"\*\*(.+?)\*\*", r'<mark class="hl">\1</mark>', out)
    return out.replace("\n", "<br>")


def fill(template: str, slots: dict[str, Any]) -> str:
    """Replace {{ name }} placeholders. Values ending in _html are inserted raw,
    everything else is HTML-escaped. Unknown slots render empty."""

    def rep(m: re.Match) -> str:
        key = m.group(1)
        val = slots.get(key, "")
        if key.endswith("_html"):
            return "" if val is None else str(val)
        return esc(val)

    return re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", rep, template)


def resolve_path(p: str | None, base: Path) -> Path | None:
    if not p:
        return None
    path = Path(p).expanduser()
    if not path.is_absolute():
        path = (base / path).resolve()
    return path if path.exists() else None


ICON_CHECK = '<svg class="ic ic-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ICON_CROSS = '<svg class="ic ic-cross" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke-width="2.6" stroke-linecap="round"/></svg>'
STAR = '<svg class="star" viewBox="0 0 24 24"><path d="M12 2.2l2.95 6.3 6.9.8-5.1 4.7 1.37 6.8L12 17.4l-6.12 3.4 1.37-6.8-5.1-4.7 6.9-.8z"/></svg>'


def icon(v: Any) -> str:
    if v is True or str(v).lower() in {"true", "yes", "y", "1", "check"}:
        return ICON_CHECK
    if v is False or str(v).lower() in {"false", "no", "n", "0", "cross", "x"}:
        return ICON_CROSS
    return f'<span class="cell-text">{esc(v)}</span>'


# --------------------------------------------------------------------------- shared fragments

def product_html(ctx: dict, cls: str = "") -> str:
    img = ctx.get("product_image_uri")
    if img:
        return f'<div class="product {cls}"><img class="product-img" src="{img}" alt=""></div>'
    prod = ctx["concept"].get("product", {})
    name = prod.get("name") or ""
    sub = prod.get("variant") or ""
    return (
        f'<div class="product product-mock {cls}"><div class="jar">'
        f'<div class="jar-lid"></div><div class="jar-body"><div class="jar-label">'
        f'<span class="jl-brand">{esc(ctx["brand_name"])}</span>'
        f'<span class="jl-name">{esc(name)}</span>'
        f'<span class="jl-sub">{esc(sub)}</span>'
        f'</div></div></div><div class="jar-shadow"></div></div>'
    )


def labels_html(ctx: dict, extra: list[str] | None = None) -> str:
    c = ctx["concept"]
    labels = list(c.get("labels") or [])
    for e in extra or []:
        if e not in labels:
            labels.append(e)
    chips = "".join(f'<span class="label-chip">{esc(l)}</span>' for l in labels)
    spec = ""
    if c.get("spec"):
        aff = c.get("spec_brand") or ctx["brand_name"]
        spec = f'<span class="spec-label">Spec concept &middot; not affiliated with {esc(aff)}</span>'
    if not chips and not spec:
        return ""
    return f'<div class="labels">{chips}{spec}</div>'


def footnote_html(ctx: dict, layout: dict) -> str:
    text = layout.get("disclaimer", ctx["concept"].get("disclaimer"))
    return f'<div class="footnote">{esc(text)}</div>' if text else ""


def cta_html(ctx: dict, layout: dict) -> str:
    cta = layout.get("cta", ctx["concept"].get("cta"))
    return f'<div class="cta">{esc(cta)}<span class="cta-arrow">&rarr;</span></div>' if cta else ""


def bullet_list(items: list, kind: str = "check") -> str:
    ic = ICON_CHECK if kind == "check" else ICON_CROSS
    return "".join(f'<li>{ic}<span>{rich(i)}</span></li>' for i in items or [])


# --------------------------------------------------------------------------- per-layout slot builders

def slots_comparison(ctx, layout, headline):
    d = layout.get("comparison") or ctx["concept"].get("comparison") or {}
    rows = "".join(
        f'<div class="crow"><div class="clabel">{rich(r.get("label"))}</div>'
        f'<div class="cus">{icon(r.get("us"))}</div><div class="cthem">{icon(r.get("them"))}</div></div>'
        for r in d.get("rows", [])
    )
    return {
        "us_label": d.get("us_label", ctx["brand_name"]),
        "them_label": d.get("them_label", "Others"),
        "rows_html": rows,
        "stat_html": f'<div class="stat">{rich(d["stat"])}</div>' if d.get("stat") else "",
    }


def slots_testimonial(ctx, layout, headline):
    r = layout.get("review") or ctx["concept"].get("review") or {}
    n = max(0, min(5, int(round(float(r.get("rating", 5))))))
    meta = []
    if r.get("verified"):
        meta.append(f'{ICON_CHECK}<span>Verified buyer</span>')
    extra = ["Sample review (placeholder copy)"] if r.get("placeholder") else []
    return {
        "stars_html": STAR * n,
        "review_html": rich(r.get("text", "")),
        "reviewer": r.get("name", ""),
        "reviewer_meta": r.get("location", ""),
        "verified_html": "".join(meta),
        "_extra_labels": extra,
    }


def slots_us_vs_them(ctx, layout, headline):
    d = layout.get("us_vs_them") or ctx["concept"].get("us_vs_them") or {}
    return {
        "us_label": d.get("us_label", ctx["brand_name"]),
        "them_label": d.get("them_label", "The usual"),
        "us_list_html": bullet_list(d.get("us", []), "check"),
        "them_list_html": bullet_list(d.get("them", []), "cross"),
        "clutter_html": "".join(f'<div class="bottle b{i % 6}"></div>' for i in range(int(d.get("them_items", 5)))),
    }


def slots_callouts(ctx, layout, headline):
    items = (layout.get("callouts") or ctx["concept"].get("callouts") or [])[:4]
    pos = ["tl", "tr", "bl", "br"]
    html_ = "".join(
        f'<div class="callout c-{pos[i]}"><div class="co-title" data-fit>{rich(c.get("title"))}</div>'
        f'<div class="co-text" data-fit>{rich(c.get("text", ""))}</div></div>'
        for i, c in enumerate(items)
    )
    return {"callouts_html": html_}


def slots_native(ctx, layout, headline):
    d = layout.get("native") or ctx["concept"].get("native") or {}
    style = d.get("style", "note")
    body = d.get("body", "")
    return {
        "native_style": style if style in {"note", "tweet", "post"} else "note",
        "author": d.get("author", ctx["brand_name"]),
        "handle": d.get("handle", "@" + slugify(ctx["brand_name"]).replace("-", "")),
        "avatar_initial": (d.get("author") or ctx["brand_name"])[:1].upper(),
        "timestamp": d.get("timestamp", "Today 9:41 PM"),
        "native_body_html": rich(body),
    }


def slots_offer(ctx, layout, headline):
    d = layout.get("offer") or ctx["concept"].get("offer") or {}
    compare = d.get("compare_at")
    return {
        "badge": d.get("badge", ""),
        "price": d.get("price", ""),
        "compare_html": f'<span class="compare">{esc(compare)}</span>' if compare else "",
        "price_note": d.get("price_note", ""),
        "offer_list_html": bullet_list(d.get("bullets", []), "check"),
        "terms": d.get("terms", ""),
    }


def slots_before_after(ctx, layout, headline):
    d = layout.get("before_after") or ctx["concept"].get("before_after") or {}
    n = int(d.get("before_items", 6))
    clutter = "".join(f'<div class="bottle b{i % 6}"></div>' for i in range(n))
    return {
        "before_label": d.get("before_label", "Before"),
        "after_label": d.get("after_label", "After"),
        "before_list_html": bullet_list(d.get("before_points", []), "cross"),
        "after_list_html": bullet_list(d.get("after_points", []), "check"),
        "clutter_html": clutter,
        # "Illustration" tag is hard-coded in the template (see COMPLIANCE.md)
    }


BUILDERS = {
    "comparison": slots_comparison,
    "testimonial": slots_testimonial,
    "us_vs_them": slots_us_vs_them,
    "callouts": slots_callouts,
    "native": slots_native,
    "offer": slots_offer,
    "before_after": slots_before_after,
}

# --------------------------------------------------------------------------- page shell

FIT_JS = """
async () => {
  await document.fonts.ready;
  const boxes = Array.from(document.querySelectorAll('[data-fit-box]'));
  for (const box of boxes) {
    const els = Array.from(box.querySelectorAll('[data-fit]'));
    if (!els.length) continue;
    const base = els.map(e => parseFloat(getComputedStyle(e).fontSize));
    let k = 1;
    const over = () => box.scrollHeight > box.clientHeight + 1;
    while (over() && k > 0.5) {
      k -= 0.03;
      els.forEach((e, i) => { e.style.fontSize = (base[i] * k) + 'px'; });
    }
  }
  // single-element fit (e.g. headline must stay within its own box)
  for (const e of document.querySelectorAll('[data-fit-self]')) {
    let fs = parseFloat(getComputedStyle(e).fontSize);
    while ((e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && fs > 20) {
      fs *= 0.96; e.style.fontSize = fs + 'px';
    }
  }
  return true;
}
"""


def font_face_css(brand: dict, base: Path) -> str:
    css = []
    if INTER_WOFF2.exists():
        css.append(
            f"@font-face{{font-family:'InterLocal';src:url('{INTER_WOFF2.as_uri()}') format('woff2');"
            "font-weight:100 900;font-style:normal;font-display:block;}"
        )
    for fam, p in (brand.get("font_files") or {}).items():
        fp = resolve_path(p, base)
        if fp:
            css.append(f"@font-face{{font-family:'{fam}';src:url('{fp.as_uri()}');font-display:block;}}")
    return "\n".join(css)


def page_html(ctx: dict, layout_name: str, layout: dict, headline: str, size: str) -> str:
    w, h, st, sb = SIZES[size]
    brand = ctx["brand"]
    colors = {**DEFAULT_COLORS, **(brand.get("colors") or {})}
    fonts = brand.get("fonts") or {}
    head_font = fonts.get("heading", "Inter")
    body_font = fonts.get("body", "Inter")
    stack = "'InterLocal', 'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif"

    var_css = ":root{" + "".join(f"--{k.replace('_', '-')}:{v};" for k, v in colors.items())
    var_css += f"--W:{w}px;--H:{h}px;--safe-t:{st}px;--safe-b:{sb}px;"
    var_css += f"--font-head:'{head_font}',{stack};--font-body:'{body_font}',{stack};}}"

    bg = ctx["concept"].get("background") or {}
    bg_css = ""
    bg_uri = ctx.get("background_uri")
    if bg_uri:
        bg_css = f".frame{{background-image:url('{bg_uri}');background-size:cover;background-position:center;}}"
    elif bg.get("type") == "solid":
        bg_css = f".frame{{background:{bg.get('color', 'var(--bg)')};}}"

    base_css = (TEMPLATES / "_base.css").read_text()
    tpl = (TEMPLATES / f"{layout_name}.html").read_text()

    slots = BUILDERS[layout_name](ctx, layout, headline)
    extra_labels = slots.pop("_extra_labels", [])
    slots.update(
        {
            "brand_name": ctx["brand_name"],
            "eyebrow": layout.get("eyebrow", ctx["concept"].get("eyebrow", "")),
            "headline_html": rich(headline),
            "subhead": layout.get("subhead", ctx["concept"].get("subhead", "")),
            "product_html": product_html(ctx),
            "cta_html": cta_html(ctx, layout),
            "footnote_html": footnote_html(ctx, layout),
            "labels_html": labels_html(ctx, extra_labels + list(layout.get("labels") or [])),
            "logo_html": ctx["logo_html"],
        }
    )
    body = fill(tpl, slots)
    size_cls = "portrait" if h > w else "square"
    debug = ""
    if ctx.get("debug_safe"):
        debug = '<div class="safe-debug"></div>'
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>{font_face_css(brand, ctx['base'])}
{var_css}
{base_css}
{bg_css}</style></head>
<body class="size-{size_cls} layout-{layout_name}"><div class="frame">{body}{debug}</div></body></html>"""


# --------------------------------------------------------------------------- main API

def _variants(concept: dict, layout: dict) -> list[tuple[str, str]]:
    heads = layout.get("headlines") or concept.get("headlines") or [concept.get("headline", "")]
    if isinstance(heads, dict):
        return list(heads.items())
    return [(chr(ord("a") + i), h) for i, h in enumerate(heads)]


def _layouts(concept: dict) -> list[tuple[str, dict]]:
    out = []
    for item in concept.get("layouts") or LAYOUTS:
        if isinstance(item, str):
            item = {"type": item}
        t = item.get("type")
        if t not in BUILDERS:
            raise ValueError(f"unknown layout type {t!r}; expected one of {LAYOUTS}")
        out.append((t, item))
    return out


def render_concept(
    concept: dict,
    out_dir: str,
    *,
    sizes: list[str] | None = None,
    layouts: list[str] | None = None,
    contact_sheet: bool = True,
    debug_safe: bool = False,
    base_dir: str | None = None,
) -> list[str]:
    """Render every layout x headline variant x size for a concept.

    Returns the list of written PNG paths (contact sheet last, if produced).
    `base_dir` resolves relative asset paths (defaults to cwd)."""
    from playwright.sync_api import sync_playwright

    base = Path(base_dir or concept.get("_base_dir") or ".").resolve()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    build = out / ".build"
    build.mkdir(exist_ok=True)

    brand = concept.get("brand") or {}
    brand_name = brand.get("name", "Brand")
    brand_slug = brand.get("slug") or slugify(brand_name)
    concept_slug = concept.get("slug") or slugify(concept.get("angle", "concept"))[:40]
    sizes = sizes or concept.get("sizes") or list(SIZES)
    for s in sizes:
        if s not in SIZES:
            raise ValueError(f"unknown size {s!r}; expected one of {list(SIZES)}")

    prod_img = resolve_path(concept.get("product_image"), base)
    bg_img = resolve_path((concept.get("background") or {}).get("path"), base)
    logo = resolve_path(brand.get("logo"), base)
    logo_html = (
        f'<img class="logo-img" src="{logo.as_uri()}" alt="">' if logo
        else f'<span class="wordmark">{esc(brand.get("wordmark", brand_name))}</span>'
    )
    ctx = {
        "concept": concept,
        "brand": brand,
        "brand_name": brand_name,
        "base": base,
        "product_image_uri": prod_img.as_uri() if prod_img else None,
        "background_uri": bg_img.as_uri() if bg_img else None,
        "logo_html": logo_html,
        "debug_safe": debug_safe,
    }

    jobs = []
    for lname, layout in _layouts(concept):
        if layouts and lname not in layouts:
            continue
        for vkey, headline in _variants(concept, layout):
            for size in sizes:
                fname = f"{brand_slug}_{concept_slug}_{slugify(lname)}_{slugify(vkey)}_{size}.png"
                jobs.append((lname, layout, vkey, headline, size, fname))

    written: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lname, layout, vkey, headline, size, fname in jobs:
            w, h, *_ = SIZES[size]
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            src = build / (fname[:-4] + ".html")
            src.write_text(page_html(ctx, lname, layout, headline, size), encoding="utf-8")
            page.goto(src.as_uri())
            page.evaluate(FIT_JS)
            target = out / fname
            page.screenshot(path=str(target), clip={"x": 0, "y": 0, "width": w, "height": h})
            page.close()
            written.append(str(target))
        if contact_sheet and written:
            sheet = out / f"{brand_slug}_{concept_slug}_contact-sheet.png"
            _contact_sheet(browser, written, sheet, f"{brand_name} - {concept.get('angle', concept_slug)}", build)
            written.append(str(sheet))
        browser.close()
    shutil.rmtree(build, ignore_errors=True)
    return written


def _contact_sheet(browser, paths: list[str], target: Path, title: str, build: Path) -> None:
    cards = []
    for pth in paths:
        name = Path(pth).name
        cards.append(
            f'<figure><img src="{Path(pth).resolve().as_uri()}"><figcaption>{esc(name)}</figcaption></figure>'
        )
    doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{{font-family:'InterLocal';src:url('{INTER_WOFF2.as_uri()}') format('woff2');font-weight:100 900;}}
    body{{margin:0;background:#EDEDEA;font-family:'InterLocal',system-ui,sans-serif;color:#1b1b1b;}}
    header{{padding:36px 40px 8px;font-size:30px;font-weight:800;letter-spacing:-.01em}}
    header small{{display:block;font-size:16px;font-weight:500;color:#666;margin-top:6px}}
    .grid{{display:grid;grid-template-columns:repeat(6,1fr);gap:22px;padding:24px 40px 44px;align-items:end}}
    figure{{margin:0}} img{{width:100%;display:block;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}}
    figcaption{{font-size:11px;color:#555;margin-top:8px;word-break:break-all;line-height:1.3}}
    </style></head><body><header>{esc(title)}<small>{len(paths)} statics &middot; review sheet</small></header>
    <div class="grid">{''.join(cards)}</div></body></html>"""
    src = build / "contact_sheet.html"
    src.write_text(doc, encoding="utf-8")
    page = browser.new_page(viewport={"width": 1800, "height": 1000})
    page.goto(src.as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready.then(()=>true)")
    page.screenshot(path=str(target), full_page=True)
    page.close()


def load_concept(path: str) -> dict:
    p = Path(path).resolve()
    concept = json.loads(p.read_text(encoding="utf-8"))
    concept.setdefault("_base_dir", str(p.parent))
    return concept


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Render static ad variants from a concept JSON.")
    ap.add_argument("concept", help="path to concept JSON")
    ap.add_argument("--out", default="out/statics", help="output directory")
    ap.add_argument("--sizes", nargs="*", choices=list(SIZES), help="subset of sizes")
    ap.add_argument("--layouts", nargs="*", choices=LAYOUTS, help="subset of layouts")
    ap.add_argument("--no-contact-sheet", action="store_true")
    ap.add_argument("--debug-safe-zone", action="store_true", help="overlay Meta safe-zone guides")
    a = ap.parse_args(argv)
    paths = render_concept(
        load_concept(a.concept),
        a.out,
        sizes=a.sizes,
        layouts=a.layouts,
        contact_sheet=not a.no_contact_sheet,
        debug_safe=a.debug_safe_zone,
    )
    for pth in paths:
        print(pth)
    print(f"{len(paths)} file(s) written to {a.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

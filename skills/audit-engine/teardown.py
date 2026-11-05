#!/usr/bin/env python3
"""Render a one-page "The Profit Script - Ad Teardown: <Brand>" PDF from an audit JSON.

Usage:
    python3 skills/audit-engine/teardown.py audit.json [--statics a.png b.png] [--out x.pdf] [--letter]

    # or from Python
    sys.path.insert(0, "skills/audit-engine"); from teardown import render_teardown
    render_teardown(audit_dict, ["static1.png"], "out/brand-teardown.pdf")

The audit schema is documented in skills/audit-engine/SKILL.md. Missing sections render as
"not captured" instead of failing, so a cheap-mode audit still produces a page. Content is
auto-shrunk (down to 70%) to stay on one page; if it still overflows, the copy is too long.
Requires the Python playwright package and a preinstalled Chromium (never `playwright install`).
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INTER = REPO_ROOT / "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"

PAGE = {"a4": ("210mm", "297mm"), "letter": ("8.5in", "11in")}


def e(x) -> str:
    return html.escape("" if x is None else str(x))


def _li(items, limit=6) -> str:
    items = [i for i in (items or []) if i][:limit]
    return "".join(f"<li>{e(i)}</li>" for i in items) or '<li class="na">not captured</li>'


def _shown(v) -> bool:
    """Internal placeholders ("not captured ...", "not assessable ...") never reach the prospect."""
    return bool(v) and not str(v).lower().startswith(("not captured", "not assessable"))


def _snapshot(ads: dict) -> str:
    ads = ads or {}
    if ads.get("status") == "not_captured" or not ads:
        # `note` is internal (for Carl); only `public_note` is printed on the prospect-facing PDF
        return f'<p class="na">{e(ads.get("public_note") or "Ad-by-ad review not included in this one-page version.")}</p>'
    rows = []
    if ads.get("active_ads") is not None:
        rows.append(("Active ads (sample)", ads.get("active_ads")))
    if ads.get("formats"):
        f = ads["formats"]
        rows.append(("Formats", ", ".join(f"{k} {v}" for k, v in f.items()) if isinstance(f, dict) else f))
    for key, label in (("angles", "Angles"), ("hooks", "Hooks seen"), ("offers", "Offers")):
        if ads.get(key):
            rows.append((label, "; ".join(map(str, ads[key][:4]))))
    if ads.get("longest_running"):
        lr = ads["longest_running"][0]
        rows.append(("Longest-running", f'{lr.get("desc", "")} ({lr.get("days", "?")} days)' if isinstance(lr, dict) else lr))
    return "<table>" + "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in rows) + "</table>"


def build_html(audit: dict, statics: list[str], page: str = "a4") -> str:
    brand = audit.get("brand", "Brand")
    date = audit.get("date") or dt.date.today().isoformat()
    lp = audit.get("landing_page") or {}
    voc = audit.get("voc") or {}
    quotes = (voc.get("quotes") or [])[:4]
    gaps = (audit.get("gaps") or [])[:4]
    concepts = (audit.get("concepts") or [])[:3]
    w, h = PAGE[page]

    lp_rows = [(k, lp.get(k)) for k in ("url", "headline", "offer", "proof", "message_match") if _shown(lp.get(k))]
    lp_html = ("<table>" + "".join(f"<tr><th>{e(k.replace('_', ' ').capitalize())}</th><td>{e(v)}</td></tr>" for k, v in lp_rows) + "</table>") if lp_rows else '<p class="na">Landing page not captured.</p>'
    if lp.get("notes"):
        lp_html += f'<ul class="tight">{_li(lp["notes"], 3)}</ul>'

    q_html = "".join(
        f'<blockquote>“{e(q.get("text"))}”<cite>{e(q.get("source", ""))}{" · " + e(q.get("type")) if q.get("type") else ""}</cite></blockquote>'
        for q in quotes
    ) or '<p class="na">No verbatim quotes captured.</p>'

    gap_html = "".join(
        f'<div class="gap"><b>{i}. {e(g.get("title"))}</b><span>{e(g.get("evidence"))}</span></div>'
        for i, g in enumerate(gaps, 1)
    ) or '<p class="na">No gaps recorded.</p>'

    con_html = "".join(
        f'<div class="concept"><div class="ctag">{e(c.get("format", ""))}</div><b>{e(c.get("name") or c.get("angle"))}</b>'
        f'<p class="hook">“{e(c.get("hook"))}”</p><p class="basis">{e(c.get("angle", ""))}{" — " + e(c.get("voc_basis")) if c.get("voc_basis") else ""}</p></div>'
        for c in concepts
    )

    img_html = "".join(f'<img src="{Path(p).resolve().as_uri()}">' for p in statics[:2] if Path(p).exists())

    font = f"@font-face{{font-family:'I';src:url('{INTER.as_uri()}') format('woff2');font-weight:100 900;}}" if INTER.exists() else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{font}
@page {{ size:{w} {h}; margin:0 }}
:root {{ --ink:#16181D; --muted:#5E6470; --line:#E3E1DA; --accent:#C2502D; --soft:#F6F3EC; }}
* {{ box-sizing:border-box }}
html,body {{ margin:0; background:#fff; }}
body {{ font-family:'I',system-ui,-apple-system,sans-serif; color:var(--ink); }}
.page {{ width:{w}; height:{h}; padding:12mm 13mm 10mm; display:flex; flex-direction:column; overflow:hidden; }}
#fit {{ transform-origin:top left; flex:none; }}
header {{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--ink); padding-bottom:3mm; margin-bottom:4mm; }}
.kicker {{ font-size:8.5pt; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); font-weight:700; }}
h1 {{ font-size:21pt; margin:1mm 0 0; letter-spacing:-.02em; line-height:1.05; }}
.meta {{ text-align:right; font-size:8pt; color:var(--muted); line-height:1.5; }}
h2 {{ font-size:8.5pt; letter-spacing:.12em; text-transform:uppercase; margin:0 0 1.8mm; color:var(--muted); }}
section {{ margin-bottom:3.6mm; }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:5mm; }}
table {{ width:100%; border-collapse:collapse; font-size:8.3pt; }}
th {{ text-align:left; color:var(--muted); font-weight:600; width:30%; vertical-align:top; padding:1mm 2mm 1mm 0; }}
td {{ padding:1mm 0; border-bottom:1px solid var(--line); vertical-align:top; }}
ul {{ margin:0; padding-left:4mm; font-size:8.3pt; line-height:1.4; }} .tight {{ margin-top:1.5mm }}
.na {{ color:var(--muted); font-style:italic; font-size:8.2pt; margin:0; }}
blockquote {{ margin:0 0 2mm; padding:1.6mm 2.6mm; background:var(--soft); border-left:2px solid var(--accent); font-size:8.4pt; line-height:1.35; }}
cite {{ display:block; font-style:normal; color:var(--muted); font-size:7pt; margin-top:.8mm; word-break:break-all; }}
.gap {{ display:flex; flex-direction:column; font-size:8.4pt; padding:1.6mm 0; border-bottom:1px solid var(--line); line-height:1.35; }}
.gap span {{ color:var(--muted); }}
.concepts {{ display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }}
.concept {{ border:1px solid var(--line); border-radius:2mm; padding:2.4mm; font-size:8.3pt; line-height:1.35; }}
.ctag {{ font-size:6.8pt; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); font-weight:700; margin-bottom:.8mm; }}
.hook {{ margin:1.2mm 0; font-weight:600; }} .basis {{ margin:0; color:var(--muted); font-size:7.6pt; }}
.statics {{ display:flex; gap:3mm; }} .statics img {{ height:58mm; border-radius:1.5mm; border:1px solid var(--line); }}
.bottom {{ display:grid; grid-template-columns:auto 1fr; gap:5mm; align-items:start; }}
.next {{ font-size:8.6pt; line-height:1.45; background:var(--soft); padding:3mm; border-radius:2mm; }}
footer {{ margin-top:auto; border-top:1px solid var(--line); padding-top:2mm; font-size:7pt; color:var(--muted); display:flex; justify-content:space-between; gap:4mm; }}
</style></head><body><div class="page"><div id="fit">
<header><div><div class="kicker">The Profit Script</div><h1>Ad Teardown: {e(brand)}</h1></div>
<div class="meta">{e(audit.get("domain", ""))}<br>{e(audit.get("niche", ""))}<br>{e(date)}</div></header>
<div class="grid2">
<section><h2>Live ads snapshot</h2>{_snapshot(audit.get("ads_snapshot"))}</section>
<section><h2>Landing page</h2>{lp_html}</section>
</div>
<div class="grid2">
<section><h2>What customers say</h2>{q_html}</section>
<section><h2>Pains · desires · objections</h2>
<ul>{_li((voc.get("pains") or [])[:2] + (voc.get("desires") or [])[:2] + (voc.get("objections") or [])[:2])}</ul>
<h2 style="margin-top:3mm">Gaps worth testing</h2>{gap_html}</section>
</div>
<section><h2>3 concepts</h2><div class="concepts">{con_html}</div></section>
<section class="bottom"><div class="statics">{img_html}</div>
<div class="next"><b>Next step</b><br>{e(audit.get("next_step") or "Happy to turn one of these into a full brief with 3 hook variants and 2 more statics.")}<br><br>
Carl Thielemann · The Profit Script · theprofitscript.com</div></section>
</div>
<footer><span>Spec concept · not affiliated with {e(brand)}. Observations based on publicly visible ads and pages as of {e(date)}.</span><span>No knowledge of spend or performance is implied.</span></footer>
</div>
<script>
(function(){{ const page=document.querySelector('.page'), fit=document.getElementById('fit'), foot=document.querySelector('footer');
  const cs=getComputedStyle(page);
  const avail=page.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - foot.offsetHeight - 8;
  const natural=fit.scrollHeight; let s=1;
  while (natural*s > avail && s>0.7) s-=0.01;
  if (s<1) {{ fit.style.transform='scale('+s+')'; fit.style.width=(100/s)+'%'; fit.style.height=(natural*s)+'px'; fit.style.flex='none'; }}
  window.__fitScale=Math.round(s*100)/100; window.__overflow = natural*s > avail+1; }})();
</script></body></html>"""


def render_teardown(audit: dict, statics: list[str] | None, out_pdf: str, page: str = "a4") -> dict:
    from playwright.sync_api import sync_playwright

    statics = statics if statics is not None else list(audit.get("spec_statics") or [])
    out = Path(out_pdf)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "teardown.html"
        src.write_text(build_html(audit, statics, page), encoding="utf-8")
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page()
            pg.goto(src.as_uri())
            pg.wait_for_load_state("networkidle")
            pg.evaluate("document.fonts.ready.then(()=>true)")
            scale = pg.evaluate("window.__fitScale")
            overflow = pg.evaluate("window.__overflow")
            pg.pdf(path=str(out), prefer_css_page_size=True, print_background=True)
            b.close()
    return {"pdf": str(out), "scale": scale, "overflow": overflow}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("audit")
    ap.add_argument("--statics", nargs="*", help="spec static PNGs (default: audit.spec_statics)")
    ap.add_argument("--out", help="output PDF (default: <audit>-teardown.pdf)")
    ap.add_argument("--letter", action="store_true", help="US Letter instead of A4")
    a = ap.parse_args(argv)
    ap_path = Path(a.audit)
    audit = json.loads(ap_path.read_text(encoding="utf-8"))
    statics = a.statics
    if statics is None:  # resolve audit-relative paths
        statics = [str((ap_path.parent / s).resolve()) if not Path(s).is_absolute() else s for s in audit.get("spec_statics") or []]
    out = a.out or str(ap_path.with_name(ap_path.stem + "-teardown.pdf"))
    r = render_teardown(audit, statics, out, "letter" if a.letter else "a4")
    print(json.dumps(r))
    if r["overflow"]:
        print("WARNING: content still overflows one page at 70% scale; shorten the copy.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

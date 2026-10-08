/**
 * Home-screen / lock-screen widget for iPhone via the free Scriptable app. The app generates
 * this script with your server URL and a read-only widget token baked in. It fetches
 * GET /api/widget, caches the last answer for offline, and draws small / medium / large and
 * lock-screen (rectangular, inline, circular) layouts.
 */
export function scriptableScript(base: string, token: string) {
  return `// Command Center widget — generated ${new Date().toISOString().slice(0, 10)}
// Read-only token. Revoke it any time in Command Center → Settings → Widgets.
const BASE = ${JSON.stringify(base)}
const TOKEN = ${JSON.stringify(token)}
${WIDGET_BODY}`
}

/** Plain JavaScript run by Scriptable (kept separate so tests can execute it with a mock). */
export const WIDGET_BODY = String.raw`
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.documentsDirectory(), "command-center-widget.json")

async function load() {
  try {
    const req = new Request(BASE + "/api/widget")
    req.headers = { Authorization: "Bearer " + TOKEN }
    req.timeoutInterval = 15
    const data = await req.loadJSON()
    if (req.response && req.response.statusCode && req.response.statusCode !== 200) throw new Error(data && data.error ? data.error : "HTTP " + req.response.statusCode)
    fm.writeString(cachePath, JSON.stringify(data))
    return { data, stale: false }
  } catch (e) {
    if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), stale: true }
    return { data: null, error: String(e && e.message ? e.message : e) }
  }
}

const BG = Color.dynamic(new Color("#ffffff"), new Color("#111113"))
const FG = Color.dynamic(new Color("#111113"), new Color("#f4f4f5"))
const MUTED = Color.dynamic(new Color("#6b6b73"), new Color("#9a9aa3"))
const ACCENT = new Color("#5b8def")
const DANGER = new Color("#ef5a5a")
const OK = new Color("#4cc38a")

function text(stack, value, size, color, weight) {
  const t = stack.addText(String(value))
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.systemFont(size)
  t.textColor = color || FG
  t.lineLimit = 1
  t.minimumScaleFactor = 0.7
  return t
}

function header(w, d) {
  const h = w.addStack()
  h.centerAlignContent()
  text(h, "COMMAND CENTER", 9, MUTED, "semibold")
  h.addSpacer()
  if (d.overdue) text(h, d.overdue + " overdue", 9, DANGER, "semibold")
  else if (d.dueToday) text(h, d.dueToday + " due today", 9, MUTED, "semibold")
  w.addSpacer(6)
}

function nowBlock(w, d, size) {
  if (d.now) {
    text(w, "NOW · until " + d.now.until, 9, ACCENT, "semibold")
    text(w, d.now.title, size, FG, "bold")
  } else if (d.next && d.next.length) {
    text(w, "NEXT · " + d.next[0].time, 9, ACCENT, "semibold")
    text(w, d.next[0].title, size, FG, "bold")
  } else {
    text(w, "NOTHING SCHEDULED", 9, MUTED, "semibold")
    text(w, d.top3 && d.top3.length ? d.top3[0].title : "Open day", size, FG, "bold")
  }
}

function countdown(w, d) {
  if (!d.countdown) return
  const s = w.addStack()
  s.centerAlignContent()
  text(s, d.countdown.days === 0 ? "Today" : d.countdown.days + "d", 13, d.countdown.days <= 3 ? DANGER : ACCENT, "bold")
  s.addSpacer(5)
  text(s, d.countdown.title, 11, MUTED)
}

function list(w, title, rows, max) {
  if (!rows.length) return
  text(w, title, 9, MUTED, "semibold")
  w.addSpacer(2)
  rows.slice(0, max).forEach((r) => {
    const s = w.addStack()
    s.centerAlignContent()
    if (r.time) {
      text(s, r.time, 11, MUTED, "semibold")
      s.addSpacer(6)
    } else {
      text(s, r.done ? "✓" : "○", 11, r.done ? OK : MUTED)
      s.addSpacer(5)
    }
    text(s, r.title, 12, r.done ? MUTED : FG)
    w.addSpacer(2)
  })
}

function footer(w, d, stale) {
  const bits = []
  if (d.workout) bits.push("Gym: " + d.workout)
  if (d.goal) bits.push(d.goal.title + " " + d.goal.pct + "%")
  if (d.money && d.money.toMove > 0) bits.push("€" + d.money.toMove + " to put away")
  if (d.changes) bits.push(d.changes + " plan changes")
  if (stale) bits.push("offline")
  if (bits.length) text(w, bits.join(" · "), 10, MUTED)
}

function build(res) {
  const family = config.widgetFamily || "medium"
  const w = new ListWidget()
  w.url = BASE + "/#/home"
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  const d = res.data
  if (family.indexOf("accessory") === 0) {
    w.addAccessoryWidgetBackground = family === "accessoryCircular"
    if (!d) {
      text(w, "Command Center", 12, FG, "semibold")
      return w
    }
    if (family === "accessoryInline") {
      text(w, d.now ? "Now: " + d.now.title : d.next && d.next.length ? d.next[0].time + " " + d.next[0].title : d.countdown ? d.countdown.title + " in " + d.countdown.days + "d" : "Open day", 12, FG)
    } else if (family === "accessoryCircular") {
      w.addSpacer()
      const n = d.countdown ? d.countdown.days : d.overdue + d.dueToday
      const t = text(w, n, 20, FG, "bold")
      t.centerAlignText()
      const l = text(w, d.countdown ? "days" : "open", 9, FG)
      l.centerAlignText()
      w.addSpacer()
    } else {
      nowBlock(w, d, 14)
      if (d.next && d.next.length > (d.now ? 0 : 1)) {
        const n = d.next[d.now ? 0 : 1]
        text(w, n.time + " " + n.title, 11, FG)
      } else if (d.countdown) text(w, d.countdown.title + " in " + d.countdown.days + "d", 11, FG)
    }
    return w
  }
  w.backgroundColor = BG
  w.setPadding(14, 14, 14, 14)
  if (!d) {
    text(w, "Command Center", 13, FG, "bold")
    w.addSpacer(4)
    const t = text(w, res.error || "Can’t reach your server", 11, DANGER)
    t.lineLimit = 3
    return w
  }
  header(w, d)
  if (family === "small") {
    nowBlock(w, d, 15)
    w.addSpacer()
    countdown(w, d)
    if (d.workout) text(w, "Gym: " + d.workout, 10, MUTED)
    return w
  }
  if (family === "medium") {
    const row = w.addStack()
    const left = row.addStack()
    left.layoutVertically()
    nowBlock(left, d, 15)
    left.addSpacer(6)
    countdown(left, d)
    row.addSpacer(12)
    const right = row.addStack()
    right.layoutVertically()
    list(right, "TOP 3", d.top3 || [], 3)
    if (!(d.top3 || []).length) list(right, "LATER TODAY", (d.next || []).slice(d.now ? 0 : 1), 3)
    w.addSpacer()
    footer(w, d, res.stale)
    return w
  }
  nowBlock(w, d, 17)
  w.addSpacer(8)
  countdown(w, d)
  w.addSpacer(8)
  list(w, "LATER TODAY", (d.next || []).slice(d.now ? 0 : 1), 4)
  w.addSpacer(6)
  list(w, "TOP 3", d.top3 || [], 3)
  w.addSpacer()
  footer(w, d, res.stale)
  return w
}

const res = await load()
const widget = build(res)
if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
`

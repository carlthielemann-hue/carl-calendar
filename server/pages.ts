import type { ConsentDescription } from '@cloudflare/workers-oauth-provider'

export const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const SCOPE_TEXT: Record<string, string> = {
  'mcp:read': 'Read your clients, deliverables, research, insights, tasks, calendar and scorecard',
  'mcp:write': 'Create tasks, draft concepts, research drafts and insights (consequential changes still need your confirmation)',
  offline_access: 'Stay connected without asking again',
}

function shell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light">
<title>${esc(title)}</title>
<style>
:root{--bg:#09090b;--panel:#111113;--line:rgba(255,255,255,.08);--fg:#ededef;--muted:#8b8b93;--accent:#9d84f7;--danger:#ef6b6b;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#fbfbfa;--panel:#fff;--line:rgba(0,0,0,.08);--fg:#18181b;--muted:#71717a;--accent:#6d55e8;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;padding:16px}
.card{width:100%;max-width:440px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px}
h1{font-size:18px;margin:0 0 6px;letter-spacing:-.01em}p{color:var(--muted);margin:0 0 14px}.warn{color:var(--danger)}
label{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line);font-size:13px}
input[type=password]{width:100%;height:40px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--fg);padding:0 12px;font:inherit;margin:6px 0 14px}
.row{display:flex;gap:8px;margin-top:16px}button{flex:1;height:38px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--fg);font:inherit;font-weight:500;cursor:pointer}
button.primary{background:var(--fg);color:var(--bg);border-color:transparent}.mark{width:32px;height:32px;border-radius:9px;background:var(--fg);color:var(--bg);display:grid;place-items:center;font-weight:700;margin-bottom:14px}
</style></head><body><main class="card"><div class="mark">✓</div>${body}</main></body></html>`
}

export function loginPage(error?: string, next = '/') {
  return shell(
    'Sign in · Command Center',
    `<h1>Sign in to Command Center</h1><p>Private app. Enter your owner password.</p>${error ? `<p class="warn">${esc(error)}</p>` : ''}
<form method="post" action="/api/login-form"><input type="hidden" name="next" value="${esc(next)}"><input type="password" name="password" autocomplete="current-password" autofocus required aria-label="Password"><div class="row"><button class="primary">Sign in</button></div></form>`,
  )
}

export function consentPage(d: ConsentDescription, handle: string) {
  const name = esc(d.clientName || 'An app')
  const origin = d.clientDomain ? `Published by <strong>${esc(d.clientDomain)}</strong>.` : 'This app registered itself; its name is not verified.'
  const scopes = d.scope.map((s) => `<label><input type="checkbox" name="scope" value="${esc(s)}" ${s === 'mcp:read' ? 'checked onclick="return false"' : 'checked'}> <span><strong>${esc(s)}</strong><br>${esc(SCOPE_TEXT[s] ?? s)}</span></label>`).join('')
  return shell(
    `Connect ${d.clientName} · Command Center`,
    `<h1>Allow ${name} to use Command Center?</h1><p>${origin} Access will be sent to <strong>${esc(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ''}
<form method="post"><input type="hidden" name="handle" value="${esc(handle)}">${scopes}
<p style="margin-top:12px">You can limit what AI tools may change, hide clients, or disconnect at any time in Settings → AI connections.</p>
<div class="row"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="approve">Allow</button></div></form>`,
  )
}

export function messagePage(title: string, msg: string) {
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(msg)}</p><div class="row"><button class="primary" onclick="location.href='/'">Open Command Center</button></div>`)
}

export const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
}

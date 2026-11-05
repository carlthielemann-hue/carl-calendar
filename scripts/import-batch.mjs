#!/usr/bin/env node
/**
 * Load a dry-run folder (batch.json + audits/*.json) into a running Scriptroom Engine.
 *   ENGINE_URL=https://<worker> ENGINE_KEY=cce_… node scripts/import-batch.mjs dryrun/2026-11-05
 * Items land as drafts → "Assemble batch now" (or 18:00) puts them on Today. Nothing is sent.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [dir] = process.argv.slice(2)
const URL_ = process.env.ENGINE_URL
const KEY = process.env.ENGINE_KEY
if (!dir || !URL_ || !KEY) {
  console.error('Usage: ENGINE_URL=… ENGINE_KEY=cce_… node scripts/import-batch.mjs <dryrun-dir>')
  process.exit(1)
}
let id = 1
async function tool(name, args) {
  const r = await fetch(`${URL_.replace(/\/$/, '')}/api/engine/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }) })
  const j = await r.json()
  if (j.error || j.result?.isError) throw new Error(JSON.stringify(j.error ?? j.result.content))
  return JSON.parse(j.result.content[0].text)
}

const auditIds = {}
const adir = join(dir, 'audits')
if (existsSync(adir)) {
  for (const f of readdirSync(adir).filter((f) => f.endsWith('.json'))) {
    const a = JSON.parse(readFileSync(join(adir, f), 'utf8'))
    const r = await tool('save_audit', { brand: a.brand ?? f.replace('.json', ''), domain: a.domain, audit: a })
    auditIds[a.domain ?? a.brand] = r.audit_id
    console.log(`audit ${a.brand} → ${r.audit_id}`)
  }
}
const batch = JSON.parse(readFileSync(join(dir, 'batch.json'), 'utf8'))
const items = (batch.items ?? []).map((it) => ({ ...it, audit_id: it.audit_id ?? auditIds[it.domain] ?? auditIds[it.company] }))
const q = await tool('queue_outreach', { items })
console.log(`queued ${q.queued.length}, rejected ${q.rejected.length}`)
for (const r of q.rejected) console.log(`  ✗ #${r.index} ${items[r.index]?.company ?? ''}: ${r.reason}`)

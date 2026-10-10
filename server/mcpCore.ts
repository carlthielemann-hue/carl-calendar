/** MCP tool framework shared by all tool modules. */
import type { Env } from './env'
import type { AppStateLike } from './state'
import type { McpPermissions } from './mcp'

export type Json = Record<string, unknown>
export interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Json
  level: 'read' | 'write' | 'consequential'
  run: (args: Json, ctx: Ctx) => Promise<unknown>
}
export interface Ctx {
  env: Env
  perms: McpPermissions
  state: () => Promise<AppStateLike>
  /** Name of the connected app making the call (e.g. "Manus", "ChatGPT"), when known */
  via?: string
}

export class ToolError extends Error {}

export const str = (a: Json, k: string, required = false) => {
  const v = a[k]
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolError(`Missing required argument "${k}"`)
    return undefined
  }
  if (typeof v !== 'string') throw new ToolError(`"${k}" must be a string`)
  return v.trim().slice(0, 20000)
}


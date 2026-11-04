import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  DB: D1Database
  /** Optional — remove the r2_buckets entry to run without cloud file storage */
  FILES?: R2Bucket
  OAUTH_KV: KVNamespace
  ASSETS: Fetcher
  OAUTH_PROVIDER: OAuthHelpers
  // vars
  APP_TIMEZONE: string
  ANTHROPIC_MODEL: string
  OPENAI_MODEL: string
  /** Optional: override the Manus API origin (tests point this at a local mock). Default https://api.manus.ai */
  MANUS_API_BASE?: string
  /** Optional: Manus project per Cue, "main=<projectId>,acquisition=<projectId>,…" (project instructions apply to dispatched tasks) */
  MANUS_CUE_PROJECTS?: string
  /** Optional: Manus connector ids to attach to dispatched Cue tasks (comma-separated), e.g. the Command Center connector */
  MANUS_CUE_CONNECTORS?: string
  // secrets (wrangler secret put …) — all optional except OWNER_PASSWORD + ENCRYPTION_KEY
  OWNER_PASSWORD?: string
  ENCRYPTION_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  MANUS_API_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_JWK?: string
  VAPID_SUBJECT?: string
  // Scriptroom Engine
  /** "true" to allow the sender to send approved emails. Ships "false". */
  SENDING_ENABLED?: string
  /** Postal address for the CAN-SPAM footer (can also be set in Engine settings). */
  SENDER_ADDRESS?: string
  /** Optional Google OAuth client just for the sending inbox (falls back to GOOGLE_CLIENT_ID/SECRET) */
  GMAIL_CLIENT_ID?: string
  GMAIL_CLIENT_SECRET?: string
  /** Optional public origin allowed to post the teardown form (e.g. https://theprofitscript.com) */
  PUBLIC_FORM_ORIGIN?: string
  /** dev only: "log" records sends instead of using Gmail (all gates still apply) */
  SEND_TRANSPORT?: string
}

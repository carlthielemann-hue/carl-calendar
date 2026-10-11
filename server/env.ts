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
}

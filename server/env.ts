import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  OAUTH_KV: KVNamespace
  ASSETS: Fetcher
  OAUTH_PROVIDER: OAuthHelpers
  // vars
  APP_TIMEZONE: string
  ANTHROPIC_MODEL: string
  OPENAI_MODEL: string
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

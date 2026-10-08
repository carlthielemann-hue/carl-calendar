/**
 * Optional in-app AI runs. Only used when API keys are configured as Worker secrets —
 * chat subscriptions (Claude Pro, ChatGPT Plus) do not include API access, and API usage is
 * billed separately. Every call is logged with token counts.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Env } from './env'
import { logIntegration, nowIso } from './util'

export class AiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

async function usage(env: Env, provider: string, model: string, input: number, output: number) {
  await env.DB.prepare('INSERT INTO ai_usage (provider, model, input_tokens, output_tokens, at, source) VALUES (?, ?, ?, ?, ?, ?)').bind(provider, model, input, output, nowIso(), 'ai-studio').run()
}

export async function runAi(env: Env, provider: 'anthropic' | 'openai', prompt: string) {
  if (!prompt.trim()) throw new AiError('Empty prompt')
  if (prompt.length > 400_000) throw new AiError('Prompt too long — narrow the context')
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new AiError('Claude API is not configured (ANTHROPIC_API_KEY secret missing).', 503)
    const model = env.ANTHROPIC_MODEL || 'claude-opus-5-5'
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    try {
      // Server-side refusal fallback: a declined request is re-run on a fallback model in the same call.
      const msg = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      })
      if (msg.stop_reason === 'refusal') throw new AiError('The model declined this request.', 422)
      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
      await usage(env, 'anthropic', msg.model, msg.usage.input_tokens, msg.usage.output_tokens)
      await logIntegration(env, 'anthropic', true, `ok · ${msg.usage.input_tokens + msg.usage.output_tokens} tokens`)
      return { text, model: msg.model, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens }, truncated: msg.stop_reason === 'max_tokens' }
    } catch (e) {
      if (e instanceof AiError) throw e
      const m = e instanceof Anthropic.AuthenticationError ? 'Claude API key was rejected.' : e instanceof Anthropic.RateLimitError ? 'Claude API rate limit — try again shortly.' : e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : 'Could not reach the Claude API.'
      await logIntegration(env, 'anthropic', false, m)
      throw new AiError(m, 502)
    }
  }
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw new AiError('OpenAI API is not configured (OPENAI_API_KEY secret and OPENAI_MODEL var required).', 503)
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL, input: prompt }),
  })
  if (!res.ok) {
    await logIntegration(env, 'openai', false, `HTTP ${res.status}`)
    throw new AiError(`OpenAI API error ${res.status}`, 502)
  }
  const data = (await res.json()) as { output_text?: string; output?: { content?: { type: string; text?: string }[] }[]; usage?: { input_tokens: number; output_tokens: number }; model: string }
  const text = data.output_text ?? (data.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n')
  await usage(env, 'openai', data.model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0)
  await logIntegration(env, 'openai', true, 'ok')
  return { text, model: data.model, usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined }
}

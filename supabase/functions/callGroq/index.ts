// supabase/functions/callGroq/index.ts
// LLM proxy — keeps the provider API keys server-side.
//
// PRIMARY:  OpenRouter (Qwen3 32B) when OPENROUTER_API_KEY is set.
// FALLBACK: Groq (llama-3.1-8b-instant) on ANY OpenRouter failure — insufficient
//           credits (402), rate limit, timeout, or the key being unset — so Zao
//           never goes dark. Both providers are OpenAI-compatible, so the
//           client contract is unchanged:
//             supabase.functions.invoke('callGroq', { body: { model, messages, temperature, max_tokens, tools, tool_choice } })
//           then reads `data.content` / `data.tool_calls`.
//
// The response also reports `provider` + `model` so you can see which one
// actually answered. To disable Qwen without a code change, just remove the
// OPENROUTER_API_KEY secret (it falls straight through to Groq). To point at a
// different OpenRouter model, set OPENROUTER_MODEL.

import { handlePreflight, json } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

interface Parsed {
  content: string
  tool_calls: unknown
  finish_reason: unknown
}

function readChoice(data: any): Parsed {
  const choice = data?.choices?.[0] ?? {}
  const msg = choice.message ?? {}
  return {
    content: (msg.content || '').trim(),
    tool_calls: msg.tool_calls ?? null,
    finish_reason: choice.finish_reason ?? null,
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { model, messages, temperature, max_tokens, tools, tool_choice } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Messages array is required.' }, 400)
    }

    // Shared request body (provider-agnostic — both are OpenAI-compatible).
    const bodyBase: Record<string, unknown> = {
      messages,
      temperature: temperature ?? 0.1,
      max_tokens: max_tokens ?? 300,
      ...(tools ? { tools, tool_choice: tool_choice ?? 'auto' } : {}),
    }

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')
    const openRouterModel = Deno.env.get('OPENROUTER_MODEL') || 'qwen/qwen3-32b'
    // The client sends the Groq fallback model (defaults to the fast Llama).
    const groqModel = model || 'llama-3.1-8b-instant'

    // ── 1. PRIMARY: OpenRouter (Qwen) ──────────────────────────────────────
    if (openRouterKey) {
      try {
        const resp = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            // OpenRouter attribution headers (optional but recommended).
            'HTTP-Referer': 'https://yardao.app',
            'X-Title': 'Yardao Zao',
          },
          body: JSON.stringify({ model: openRouterModel, ...bodyBase }),
        })

        if (resp.ok) {
          const data = await resp.json()
          const out = readChoice(data)
          return json({ ...out, provider: 'openrouter', model: openRouterModel })
        }

        // Non-OK (402 no credits, 429 rate limit, 5xx, …) → fall through to Groq.
        const errText = await resp.text()
        console.error(`OpenRouter ${resp.status} — falling back to Groq:`, errText.slice(0, 400))
      } catch (e) {
        console.error('OpenRouter request threw — falling back to Groq:', e)
      }
    }

    // ── 2. FALLBACK: Groq (llama-3.1-8b-instant) — original behaviour ───────
    if (!groqKey) {
      return json({ error: 'No LLM provider configured (need OPENROUTER_API_KEY or GROQ_API_KEY).' }, 500)
    }

    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: groqModel, ...bodyBase }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      console.error('Groq API error:', resp.status, errorText)
      // Groq returns 400 `tool_use_failed` when the model emits a malformed or
      // unknown tool call — surface as a SOFT 200 so the client can self-correct.
      let parsed: any = null
      try { parsed = JSON.parse(errorText) } catch { /* not json */ }
      if (resp.status === 400 && parsed?.error?.code === 'tool_use_failed') {
        return json({ content: '', tool_calls: null, finish_reason: 'tool_use_failed', tool_use_failed: true }, 200)
      }
      return json({ error: `Groq API error: ${resp.status}`, detail: errorText.slice(0, 600) }, 500)
    }

    const data = await resp.json()
    const out = readChoice(data)
    return json({ ...out, provider: 'groq', model: groqModel })
  } catch (e) {
    console.error('LLM request failed:', e)
    return json({ error: e instanceof Error ? e.message : 'LLM request failed.' }, 400)
  }
})

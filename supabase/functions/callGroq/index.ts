// supabase/functions/callGroq/index.ts
// Groq API proxy — keeps the Groq API key server-side.
// Ported from the Firebase Cloud Function `callGroq` (functions/src/groq.ts).
//
// Client contract (unchanged):
//   supabase.functions.invoke('callGroq', { body: { model, messages, temperature, max_tokens } })
//   then reads `data.content`.

import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { model, messages, temperature, max_tokens, tools, tool_choice } = await req.json()

    // Mirror the original's input validation.
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'Messages array is required.' }, 400)
    }

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) {
      return json({ error: 'Groq service is not configured.' }, 500)
    }

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Defaults match the original Cloud Function exactly. `tools` /
      // `tool_choice` are passed through only when supplied, so existing
      // (non-tool) callers behave exactly as before.
      body: JSON.stringify({
        model: model || 'llama-3.1-8b-instant',
        messages,
        temperature: temperature ?? 0.1,
        max_tokens: max_tokens ?? 300,
        ...(tools ? { tools, tool_choice: tool_choice ?? 'auto' } : {}),
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      console.error('Groq API error:', resp.status, errorText)
      // Groq returns 400 `tool_use_failed` when the model emits a malformed or
      // unknown tool call (e.g. a slightly-wrong name like "yards_vehicles").
      // Return it as a SOFT 200 signal so the client can self-correct (nudge +
      // retry) instead of treating the whole turn as a hard failure.
      let parsed: any = null
      try { parsed = JSON.parse(errorText) } catch { /* not json */ }
      if (resp.status === 400 && parsed?.error?.code === 'tool_use_failed') {
        return json({ content: '', tool_calls: null, finish_reason: 'tool_use_failed', tool_use_failed: true }, 200)
      }
      // Surface Groq's actual rejection reason (truncated) so failures are
      // diagnosable instead of just a status code.
      return json({ error: `Groq API error: ${resp.status}`, detail: errorText.slice(0, 600) }, 500)
    }

    const data = await resp.json()
    const choice = data.choices?.[0] ?? {}
    const msg = choice.message ?? {}
    const content = (msg.content || '').trim()

    // `content` is kept for backward compatibility. `tool_calls` /
    // `finish_reason` are added so the tool-calling agent can drive the loop.
    return json({
      content,
      tool_calls: msg.tool_calls ?? null,
      finish_reason: choice.finish_reason ?? null,
    })
  } catch (e) {
    console.error('Groq request failed:', e)
    return json({ error: e instanceof Error ? e.message : 'Groq request failed.' }, 400)
  }
})

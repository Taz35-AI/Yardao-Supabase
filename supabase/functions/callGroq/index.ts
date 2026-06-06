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
      return json({ error: `Groq API error: ${resp.status}` }, 500)
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

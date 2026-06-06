// src/lib/zao/agent.ts
// SQL-native Zao: a Groq tool-calling loop. Instead of stuffing the whole
// dataset into the prompt, the model calls precise org-scoped tools (migration
// 0027) and answers from the exact rows they return. This is cheaper (small
// context), accurate, and can answer analytical questions the old approach
// couldn't — while RLS guarantees it only ever sees this organisation's data.

import { supabase } from '@/lib/supabaseClient'
import { ZAO_TOOLS, executeZaoTool } from './tools'
import { logger } from '@/lib/logger'

// Strong tool-calling model on Groq (better at choosing/filling tools than the
// 8b instant model used for the lightweight intent classifier).
const MODEL = 'llama-3.3-70b-versatile'
const MAX_HOPS = 5

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

interface GroqToolResponse {
  content: string
  tool_calls: ChatMessage['tool_calls'] | null
  finish_reason: string | null
}

const SYSTEM_PROMPT = `You are Zao, the AI assistant for Yardao, a UK vehicle yard management system.

HOW YOU WORK
- Answer questions about THIS organisation's live data by calling the provided tools. Never invent numbers or vehicles — if you need data, call a tool.
- Prefer a specific tool over run_query. Only use run_query for analytical questions the specific tools can't cover (grouping, custom filters, joins).
- You may call several tools, and call them in sequence, before answering. Read each tool's result and use it.
- If a tool returns nothing / empty, say so plainly. If you genuinely can't determine something from the data, say that — never bluff.

DOMAIN MEANING (important)
- checked_in_vehicles = vehicles physically in a yard right now. service_bookings = appointments only, NOT a physical location.
- "at the garage / bodyshop / out for service" → use at_external_garages (transfer_status = at_external_garage), never bookings.
- Vehicle statuses: "Ready" | "Pending checks" | "Repairs needed" | "Non-Starter". Synonyms: bodyshop/repair/fix/damaged → "Repairs needed"; done → "Ready"; check → "Pending checks"; won't start/dead → "Non-Starter".
- hire_status "Out on Hire" = currently hired out. is_defleeted = removed from the fleet. "Not Insured" or missing insurance_status = uninsured.
- Today's date and timezone are Europe/London — the tools already handle this.

STYLE
- British English. Talk like a sharp, switched-on colleague — friendly, direct, concise.
- Never say "certainly", "of course", "absolutely", "great question". Don't apologise unless something actually went wrong.
- Give the answer first, then a tiny bit of useful detail. Use short lists for multiple vehicles. Don't show raw JSON or SQL.`

async function callGroqTools(messages: ChatMessage[], withTools: boolean): Promise<GroqToolResponse> {
  const { data, error } = await supabase.functions.invoke('callGroq', {
    body: {
      model: MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 700,
      ...(withTools ? { tools: ZAO_TOOLS, tool_choice: 'auto' } : {}),
    },
  })
  if (error) throw error
  return data as GroqToolResponse
}

/**
 * Ask Zao a free-form data question. Drives the tool-calling loop and returns a
 * natural-language answer grounded in the org's actual data.
 */
export async function askZao(
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ]

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await callGroqTools(messages, true)

    if (res.tool_calls && res.tool_calls.length > 0) {
      // Record the assistant's tool-call turn verbatim (required by the API).
      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.tool_calls })

      // Execute each requested tool and feed the result back as a tool message.
      for (const tc of res.tool_calls) {
        let args: Record<string, unknown> = {}
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
        } catch {
          args = {}
        }
        let out: unknown
        try {
          out = await executeZaoTool(tc.function?.name, args)
        } catch (err) {
          out = { error: err instanceof Error ? err.message : 'tool failed' }
          logger.error(`Zao tool ${tc.function?.name} failed`, err)
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function?.name,
          content: JSON.stringify(out).slice(0, 6000), // cap to keep tokens sane
        })
      }
      continue // let the model read the tool results and decide next step
    }

    // No tool calls → this is the final answer.
    if (res.content) return res.content
    break
  }

  // Hit the hop cap without a final answer — ask once more, no tools.
  try {
    const final = await callGroqTools(
      [...messages, { role: 'user', content: 'Give your best final answer now from what the tools returned.' }],
      false,
    )
    if (final.content) return final.content
  } catch (err) {
    logger.error('Zao agent: final synthesis failed', err)
  }
  return "I had a dig through the data but couldn't pin that one down — try rephrasing?"
}

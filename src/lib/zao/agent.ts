// src/lib/zao/agent.ts
// SQL-native Zao: a Groq tool-calling loop. Instead of stuffing the whole
// dataset into the prompt, the model calls precise org-scoped tools (migration
// 0027) and answers from the exact rows they return. This is cheaper (small
// context), accurate, and can answer analytical questions the old approach
// couldn't — while RLS guarantees it only ever sees this organisation's data.

import { supabase } from '@/lib/supabaseClient'
import { ZAO_TOOLS, executeZaoTool } from './tools'
import { logger } from '@/lib/logger'

// Strong tool-calling model on Groq. gpt-oss-120b is purpose-built for agentic
// tool use and far more reliable at it than the Llama models (which tend to
// narrate tool calls instead of emitting them).
const MODEL = 'openai/gpt-oss-120b'
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
  tool_use_failed?: boolean
}

const SYSTEM_PROMPT = `You are Zao, the AI assistant for Yardao — a UK vehicle yard management system. You answer questions and run the yard by calling tools against this organisation's live data.

CORE RULES
- Act from real data: call a tool. Never invent vehicles, numbers or registrations.
- You ALWAYS have live access through the tools — so never say "I don't have that info", "check the system" or "you should know it". Call the right tool and find out. Only say something doesn't exist AFTER a tool returns empty.
- Call tools in sequence as needed, read each result, then answer. If a tool errors, try another (e.g. fall back to run_query on checked_in_vehicles).

WHICH TOOL
- Overview / totals ("how's the yard", "how many…") → fleet_summary (counts only — it can't name a vehicle).
- List the YARD ("what's in the yard", "which are here") → yard_vehicles. List the whole FLEET ("list the fleet", "all our vehicles", or "list them" after a fleet question) → fleet_vehicles. Both return registrations. The yard is a subset of the fleet — pick the one the user means.
- A given status ("what's pending") → vehicles_by_status. Find a vehicle (a plate, "any Transits") → search_vehicles. Where is one → vehicle_location.
- MOT/tax due → due_soon. Appointments → bookings. Physically at a garage → at_external_garages.
- What's happened ("today", "recently") → recent_activity. Invoicing/revenue ("invoiced today", "billed this week") → money_summary. Parts low or out of stock → low_stock; parts used → parts_used. Everything about ONE vehicle (history, parts used on it, its invoices) → vehicle_detail.
- Insurance expiring → run_query on vehicles.insurance_policy_expiry. Anything else analytical the specific tools can't do (grouping, joins, custom filters) → run_query.

ACTIONS (you can run the whole yard)
- Status → set_status. Comment → add_comment. Check in/out of the yard → check_in / check_out. Hire out or return → set_hire. MOT done → mark_mot_done. Book a service → book_service. Add a vehicle to the fleet → add_to_fleet.
- Transfer to another branch → transfer_to_branch (call list_branches first to resolve the branch). Send to an external garage → send_to_garage (call list_garages first to resolve the garage).
- Resolve which vehicle from context: "it" / "that one" = the vehicle just discussed. If unclear or more than one matches, ASK first. Never guess a registration.
- Most actions are reversible — once the vehicle is clear, do it and confirm briefly ("Done — YB67VFK is now Ready."). If a tool returns ok:false, relay its message plainly.
- defleet is DESTRUCTIVE (removes a vehicle from the fleet). ALWAYS confirm first ("Defleet YB67VFK as Sold — sure?") and only call defleet after the user says yes.

DOMAIN
- checked_in_vehicles = physically in a yard now. service_bookings = appointments, NOT a location — never use them for "where is X". "At the garage / bodyshop / out for service" → at_external_garages.
- Statuses: Ready | Pending checks | Repairs needed | Non-Starter. Map: bodyshop/repair/damaged → Repairs needed; done/finished → Ready; check → Pending checks; won't start/dead → Non-Starter.
- "Out on Hire" = hired out now. is_defleeted = removed from the fleet. Missing or "Not Insured" insurance = uninsured. Dates/timezone are Europe/London (the tools handle this).

STYLE
- British English, like a sharp, switched-on colleague — friendly, direct, concise. Answer first, then a touch of useful detail; short lists for multiple vehicles.
- Never say "certainly", "of course", "absolutely", "great question". Don't apologise unless something genuinely broke. Never show raw JSON or SQL.`

async function callGroqTools(
  messages: ChatMessage[],
  toolChoice: 'auto' | 'required' | 'none',
): Promise<GroqToolResponse> {
  const { data, error } = await supabase.functions.invoke('callGroq', {
    body: {
      model: MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 700,
      ...(toolChoice !== 'none' ? { tools: ZAO_TOOLS, tool_choice: toolChoice } : {}),
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

  let nudges = 0
  let toolsUsed = false
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    // Force a tool call until the model has actually fetched data. Left on
    // 'auto', Llama tends to NARRATE ("Calling yard_vehicles tool…") instead of
    // calling it. Once it has results, switch to 'auto' so it can answer.
    const res = await callGroqTools(messages, toolsUsed ? 'auto' : 'required')

    // The model emitted a malformed/unknown tool call (Groq tool_use_failed).
    // Nudge it with the exact tool names and retry, rather than failing.
    if (res.tool_use_failed) {
      if (nudges++ < 2) {
        messages.push({
          role: 'system',
          content:
            'Your last tool call was invalid. Use ONLY these exact tool names: ' +
            ZAO_TOOLS.map((t) => t.function.name).join(', ') +
            '. Call the correct tool now.',
        })
        continue
      }
      break // give up on tools after repeated failures → final synthesis below
    }

    if (res.tool_calls && res.tool_calls.length > 0) {
      toolsUsed = true
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
      'none',
    )
    if (final.content) return final.content
  } catch (err) {
    logger.error('Zao agent: final synthesis failed', err)
  }
  return "I had a dig through the data but couldn't pin that one down — try rephrasing?"
}

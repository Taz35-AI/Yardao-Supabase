// src/lib/zao/tools.ts
// The "tools" Zao can call via Groq tool-calling. Each maps to a read-only,
// org-scoped Postgres RPC (migration 0027). Calls run through supabase-js as the
// signed-in user, so RLS scopes every result to their organization automatically.
//
// Schemas below are what the model sees — keep the descriptions sharp, because
// they're how the model decides which tool answers a given question.

import { supabase } from '@/lib/supabaseClient'
import { normalizeReg } from '@/lib/utils/registration'

export interface ToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  }
}

export const ZAO_TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'fleet_summary',
      description:
        'A live snapshot of the whole yard as COUNTS ONLY (no registrations): fleet total, how many are in the yard, counts by status, on hire, at external garages, in transit, uninsured, MOT/tax due or expired, bookings today. Use ONLY for overview numbers ("how many vehicles", "give me a rundown"). It cannot name specific vehicles — for that use yard_vehicles.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'yard_vehicles',
      description:
        'List the vehicles currently IN THE YARD (checked in) WITH their registration plates, make/model, status and location. Use for "what\'s in the yard", "which ones are here". NOTE: the yard is a subset of the fleet — for the whole fleet use fleet_vehicles.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max results (default 50, max 200)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fleet_vehicles',
      description:
        'List the whole FLEET (the master vehicle inventory) WITH registrations, make/model, MOT/tax, insurance and status. Use for "list the fleet", "all our vehicles", "list them" after a fleet question — i.e. when they want every vehicle, not just the ones in the yard.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max results (default 50, max 200)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_vehicles',
      description:
        'Search the fleet by registration (partial ok), make or model, and see whether each is currently in the yard. Use for "find AB12CDE", "do we have any Transits", "show me anything with 67 plate".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Registration (partial ok), make, or model' },
          limit: { type: 'integer', description: 'Max results (default 20, max 50)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vehicles_by_status',
      description:
        'List vehicles currently in the yard with a given status. Valid statuses: "Ready", "Pending checks", "Repairs needed", "Non-Starter".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter'] },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'due_soon',
      description:
        'Vehicles whose MOT or tax is due within N days (or already expired). Use for "what MOTs are due", "anything with tax running out this month", "expired MOTs".',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['mot', 'tax'] },
          days: { type: 'integer', description: 'Window in days from today (default 30)' },
        },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vehicle_location',
      description:
        'Where a specific vehicle is right now: in the yard, at an external garage, in transit between branches, out on hire, in the fleet but not checked in, or unknown. Use for "where is AB12CDE".',
      parameters: {
        type: 'object',
        properties: { reg: { type: 'string', description: 'The vehicle registration' } },
        required: ['reg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bookings',
      description:
        'Service bookings between two dates (defaults to today through +14 days). Bookings are APPOINTMENTS, not a physical location — never use this to answer where a vehicle is.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date YYYY-MM-DD (optional)' },
          to: { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'at_external_garages',
      description:
        'Vehicles physically AT external garages right now, with the garage name. This is the correct tool for "which vehicles are at the garage / bodyshop / out for service".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_activity',
      description:
        'The yard activity feed — what has actually happened (check-ins, check-outs, status changes, hires, garage moves, comments, MOTs), newest first. Use for "what\'s happened today", "any activity", "what changed", "what did the team do". Default window is today.',
      parameters: { type: 'object', properties: { days: { type: 'integer', description: 'Days back from today (default 1 = today only)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'money_summary',
      description:
        'Invoicing figures: how many invoices were raised and their total £ value, for today and a wider window, with a paid/issued/draft split and the most recent invoices. Use for "how much have we invoiced today", "invoices this week", "revenue", "what have we billed".',
      parameters: { type: 'object', properties: { days: { type: 'integer', description: 'Window in days for the wider total (default 7)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'low_stock',
      description:
        'Parts stock needing attention — items at or below their restock target, and items out of stock. Use for "what parts are low", "anything out of stock", "what should we reorder".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'parts_used',
      description:
        'Parts taken from stock recently, with quantities and cost. Use for "what parts did we use today", "parts used this week", "how much did we spend on parts". Default window is today.',
      parameters: { type: 'object', properties: { days: { type: 'integer', description: 'Days back from today (default 1 = today only)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vehicle_detail',
      description:
        'A full picture of ONE vehicle: where it is + its status, upcoming bookings, parts recently used on it, and its recent invoices. Use for "tell me everything about AB12", "what\'s the story with YB67", "AB12 full history". Resolve "it"/"that one" from the conversation.',
      parameters: { type: 'object', properties: { reg: { type: 'string', description: 'The vehicle registration' } }, required: ['reg'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_status',
      description:
        'Change a yard vehicle\'s status. Valid: "Ready", "Pending checks", "Repairs needed", "Non-Starter". Use for commands like "move it to ready", "mark YB67 as repairs", "it\'s done" (done → Ready). If the user says "it"/"that one", resolve which vehicle from the recent conversation. Reversible.',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string', description: 'The vehicle registration' },
          status: { type: 'string', enum: ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter'] },
        },
        required: ['reg', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_comment',
      description: 'Add a note/comment to a yard vehicle. Use for "add a note to YB67: needs tyres", "comment on it that …".',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string', description: 'The vehicle registration' },
          comment: { type: 'string', description: 'The note text' },
        },
        required: ['reg', 'comment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_in',
      description:
        'Check a vehicle INTO the yard (add it). Use for "check in YB67", "book AB12 into the yard". If the reg is in the fleet, make/model auto-fill. Status defaults to "Pending checks".',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string', description: 'Registration' },
          make: { type: 'string' },
          model: { type: 'string' },
          status: { type: 'string', enum: ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter'] },
        },
        required: ['reg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_out',
      description:
        'Check a vehicle OUT of the yard (remove it). Logs it to checkout history and frees its space. Use for "check out YB67", "YB67 is leaving", "remove it from the yard".',
      parameters: { type: 'object', properties: { reg: { type: 'string' } }, required: ['reg'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_hire',
      description:
        'Put a yard vehicle OUT on hire, or bring it BACK. on_hire=true = out on hire; on_hire=false = returned. Use for "YB67 out on hire", "YB67 is back from hire".',
      parameters: {
        type: 'object',
        properties: { reg: { type: 'string' }, on_hire: { type: 'boolean' } },
        required: ['reg', 'on_hire'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_mot_done',
      description:
        'Mark a vehicle\'s MOT as done — rolls its MOT expiry forward (default 12 months). Use for "MOT done on YB67", "YB67 passed its MOT".',
      parameters: {
        type: 'object',
        properties: { reg: { type: 'string' }, months: { type: 'integer', description: 'Months until next MOT (default 12)' } },
        required: ['reg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_branches',
      description: 'List this organisation\'s branches (name + slug). Use to resolve which branch the user means before a transfer.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_garages',
      description: 'List the external garages set up for this organisation. Use to resolve which garage the user means before sending a vehicle there.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_branch',
      description: 'Transfer a yard vehicle to another branch (marks it in-transit; it appears in that branch\'s incoming transfers). Use for "check out YB67 to Fairview", "send it to the Bray branch".',
      parameters: {
        type: 'object',
        properties: { reg: { type: 'string' }, branch: { type: 'string', description: 'Branch name or slug' } },
        required: ['reg', 'branch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_to_garage',
      description: 'Send a yard vehicle to an external garage (marks it "at garage"). Use for "send YB67 to Joe\'s Garage", "YB67 out to the bodyshop garage".',
      parameters: {
        type: 'object',
        properties: { reg: { type: 'string' }, garage: { type: 'string', description: 'Garage name' } },
        required: ['reg', 'garage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_service',
      description: 'Create a service booking for a vehicle. Use for "book YB67 in for a service on Friday", "MOT booking for AB12 next Tuesday".',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string' },
          date: { type: 'string', description: 'Date YYYY-MM-DD' },
          work: { type: 'string', description: 'What work, e.g. "MOT", "Full service", "Tyres x4"' },
          time: { type: 'string', description: 'Optional time slot, e.g. "09:00"' },
        },
        required: ['reg', 'date', 'work'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_fleet',
      description: 'Add a vehicle to the fleet (master inventory). Use for "add YB67 to the fleet", "new vehicle: AB12CDE, Ford Transit".',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string' }, make: { type: 'string' }, model: { type: 'string' },
          mot: { type: 'string', description: 'MOT expiry YYYY-MM-DD' },
          tax: { type: 'string', description: 'Tax expiry YYYY-MM-DD' },
        },
        required: ['reg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'defleet',
      description: 'Defleet a vehicle — remove it from the fleet (reversible soft-delete). DESTRUCTIVE: only call after the user has confirmed. Use for "defleet YB67", "YB67 has been sold".',
      parameters: {
        type: 'object',
        properties: {
          reg: { type: 'string' },
          reason: { type: 'string', enum: ['Sold', 'Scrapped', 'Trade-In', 'End of Lease', 'Accident Write-Off', 'Theft', 'Other'] },
        },
        required: ['reg'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_query',
      description:
        'ESCAPE HATCH for analytical questions the other tools cannot answer (grouping, counting, joins, custom filters). Provide a SINGLE read-only PostgreSQL SELECT. It is automatically scoped to this organisation, so do NOT add organization_id filters. Only use when no other tool fits.\n' +
        'TABLES: vehicles(registration, make, model, colour, size, mot_expiry date, tax_expiry date, insurance_status, insurance_policy_expiry date, current_status, is_defleeted bool, contract, date_acquired date, created_at); ' +
        'checked_in_vehicles(registration, make, model, status, hire_status, transfer_status, external_garage_name, insurance_status, branch_id, bay, mot_expiry date, tax_expiry date, check_in_time, vehicle_id); ' +
        'service_bookings(date, time_slot, registration, make, model, status, is_external_provider, customer_name, assigned_mechanic_name); ' +
        'branches(slug, name, is_main); external_garages(name, address); ' +
        'stock_parts(part_name, part_number, quantity numeric, net_price numeric, supplier); ' +
        'customers(name, phone, email, registrations text[]).',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A single read-only SELECT statement. No semicolons, no writes.' },
        },
        required: ['sql'],
      },
    },
  },
]

async function rpc(fn: string, params?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) return { error: error.message }
  return data
}

// ── Helpers for the direct-query tools (activity / money / stock / vehicle) ──
// These query tables directly through the browser client; RLS scopes every
// result to the signed-in user's organisation automatically (no org filter
// needed, and no new Postgres RPC / migration required).

const ymdLocal = (offset = 0): string => {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const startOfDayIso = (daysBack = 0): string => {
  const d = new Date(); d.setDate(d.getDate() - daysBack); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100

// Fetch rows from `table` matching a registration robustly (space/case-insensitive).
async function rowsForReg(table: string, columns: string, reg: string, limit = 20): Promise<any[]> {
  const norm = normalizeReg(reg)
  if (!norm) return []
  const { data } = await supabase.from(table).select(columns).ilike('registration', `%${norm.slice(0, 4)}%`).limit(150)
  return (data || []).filter((r: any) => normalizeReg(r.registration || '') === norm).slice(0, limit)
}

/** Execute a tool call by name with parsed arguments. RLS-scoped by construction. */
export async function executeZaoTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'fleet_summary':
      return rpc('zao_fleet_summary')
    case 'yard_vehicles':
      return rpc('zao_yard_vehicles', { p_limit: Number(args?.limit ?? 50) })
    case 'fleet_vehicles':
      return rpc('zao_fleet_vehicles', { p_limit: Number(args?.limit ?? 50) })
    case 'search_vehicles':
      return rpc('zao_search_vehicles', { p_query: String(args?.query ?? ''), p_limit: Number(args?.limit ?? 20) })
    case 'vehicles_by_status':
      return rpc('zao_vehicles_by_status', { p_status: String(args?.status ?? '') })
    case 'due_soon':
      return rpc('zao_due_soon', { p_kind: String(args?.kind ?? 'mot'), p_days: Number(args?.days ?? 30) })
    case 'vehicle_location':
      return rpc('zao_vehicle_location', { p_reg: String(args?.reg ?? '') })
    case 'bookings':
      return rpc('zao_bookings', { p_from: (args?.from as string) ?? null, p_to: (args?.to as string) ?? null })
    case 'at_external_garages':
      return rpc('zao_at_external_garages')
    case 'recent_activity': {
      const days = Math.max(1, Number(args?.days ?? 1))
      const { data, error } = await supabase
        .from('activity_log')
        .select('created_at, actor_name, action_type, registration, summary')
        .gte('created_at', startOfDayIso(days - 1))
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) return { error: error.message }
      return {
        windowDays: days,
        count: data?.length ?? 0,
        activity: (data || []).map((r: any) => ({
          at: r.created_at, who: r.actor_name || 'someone', action: r.action_type,
          reg: r.registration || null, summary: r.summary,
        })),
      }
    }
    case 'money_summary': {
      const days = Math.max(1, Number(args?.days ?? 7))
      const today = ymdLocal(0)
      const from = ymdLocal(-(days - 1))
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_date, to_company, total, status')
        .gte('invoice_date', from)
        .order('invoice_date', { ascending: false })
      if (error) return { error: error.message }
      const rows = data || []
      const todayRows = rows.filter((r: any) => r.invoice_date === today)
      const sum = (rs: any[]) => round2(rs.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0))
      const byStatus = rows.reduce((acc: Record<string, number>, r: any) => {
        const k = r.status || 'draft'; acc[k] = (acc[k] || 0) + 1; return acc
      }, {})
      return {
        today: { count: todayRows.length, totalGBP: sum(todayRows) },
        window: { days, count: rows.length, totalGBP: sum(rows) },
        byStatus,
        recent: rows.slice(0, 10).map((r: any) => ({ date: r.invoice_date, customer: r.to_company, totalGBP: round2(r.total), status: r.status })),
      }
    }
    case 'low_stock': {
      const { data, error } = await supabase
        .from('stock_parts')
        .select('part_name, part_number, quantity, restock_target, unit, supplier')
      if (error) return { error: error.message }
      const parts = data || []
      const fmt = (p: any) => ({ part: p.part_name, number: p.part_number, qty: Number(p.quantity) || 0, target: Number(p.restock_target) || 0, unit: p.unit, supplier: p.supplier || null })
      const out = parts.filter((p: any) => (Number(p.quantity) || 0) <= 0).map(fmt)
      const low = parts.filter((p: any) => (Number(p.quantity) || 0) > 0 && (Number(p.quantity) || 0) < (Number(p.restock_target) || 0)).map(fmt)
      return { totalParts: parts.length, outOfStockCount: out.length, lowCount: low.length, outOfStock: out.slice(0, 40), low: low.slice(0, 40) }
    }
    case 'parts_used': {
      const days = Math.max(1, Number(args?.days ?? 1))
      const { data, error } = await supabase
        .from('part_usage')
        .select('part_name, vehicle_registration, quantity_used, total_cost, used_at, used_by_name')
        .gte('used_at', startOfDayIso(days - 1))
        .order('used_at', { ascending: false })
        .limit(60)
      if (error) return { error: error.message }
      const rows = data || []
      return {
        windowDays: days,
        count: rows.length,
        totalCostGBP: round2(rows.reduce((s: number, r: any) => s + (Number(r.total_cost) || 0), 0)),
        items: rows.map((r: any) => ({ part: r.part_name, qty: Number(r.quantity_used) || 0, costGBP: round2(r.total_cost), reg: r.vehicle_registration || null, at: r.used_at, by: r.used_by_name || null })),
      }
    }
    case 'vehicle_detail': {
      const reg = String(args?.reg ?? '')
      const norm = normalizeReg(reg)
      if (!norm) return { error: 'No registration provided' }
      const today = ymdLocal(0)
      const [ci, fleet, bookings, invoices, usageRes] = await Promise.all([
        rowsForReg('checked_in_vehicles', 'registration, make, model, status, hire_status, transfer_status, external_garage_name, mot_expiry, tax_expiry, insurance_status', reg, 2),
        rowsForReg('vehicles', 'registration, make, model, colour, size, mot_expiry, tax_expiry, insurance_status, current_status, is_defleeted', reg, 2),
        rowsForReg('service_bookings', 'date, time_slot, status, work_required, is_external_provider', reg, 12),
        rowsForReg('invoices', 'invoice_date, to_company, total, status', reg, 8),
        supabase.from('part_usage').select('part_name, quantity_used, total_cost, used_at').eq('vehicle_registration_key', norm).order('used_at', { ascending: false }).limit(15),
      ])
      const usage = (usageRes as any)?.data || []
      return {
        reg: norm,
        inYardNow: ci[0] || null,
        fleetRecord: fleet[0] || null,
        upcomingBookings: bookings.filter((b: any) => (b.date || '') >= today),
        recentParts: usage.map((u: any) => ({ part: u.part_name, qty: Number(u.quantity_used) || 0, costGBP: round2(u.total_cost), at: u.used_at })),
        recentInvoices: invoices.map((i: any) => ({ date: i.invoice_date, customer: i.to_company, totalGBP: round2(i.total), status: i.status })),
      }
    }
    case 'set_status':
      return rpc('zao_set_status', { p_reg: String(args?.reg ?? ''), p_status: String(args?.status ?? '') })
    case 'add_comment':
      return rpc('zao_add_comment', { p_reg: String(args?.reg ?? ''), p_comment: String(args?.comment ?? '') })
    case 'check_in':
      return rpc('zao_check_in', {
        p_reg: String(args?.reg ?? ''),
        p_make: args?.make != null ? String(args.make) : null,
        p_model: args?.model != null ? String(args.model) : null,
        p_status: args?.status != null ? String(args.status) : 'Pending checks',
      })
    case 'check_out':
      return rpc('zao_check_out', { p_reg: String(args?.reg ?? '') })
    case 'set_hire':
      return rpc('zao_set_hire', { p_reg: String(args?.reg ?? ''), p_on_hire: Boolean(args?.on_hire) })
    case 'mark_mot_done':
      return rpc('zao_mark_mot_done', { p_reg: String(args?.reg ?? ''), p_months: Number(args?.months ?? 12) })
    case 'list_branches':
      return rpc('zao_branches')
    case 'list_garages':
      return rpc('zao_garages')
    case 'transfer_to_branch':
      return rpc('zao_transfer_to_branch', { p_reg: String(args?.reg ?? ''), p_branch: String(args?.branch ?? '') })
    case 'send_to_garage':
      return rpc('zao_send_to_garage', { p_reg: String(args?.reg ?? ''), p_garage: String(args?.garage ?? '') })
    case 'book_service':
      return rpc('zao_book_service', {
        p_reg: String(args?.reg ?? ''),
        p_date: args?.date != null ? String(args.date) : null,
        p_work: args?.work != null ? String(args.work) : 'Service',
        p_time: args?.time != null ? String(args.time) : null,
      })
    case 'add_to_fleet':
      return rpc('zao_add_to_fleet', {
        p_reg: String(args?.reg ?? ''),
        p_make: args?.make != null ? String(args.make) : null,
        p_model: args?.model != null ? String(args.model) : null,
        p_mot: args?.mot != null ? String(args.mot) : null,
        p_tax: args?.tax != null ? String(args.tax) : null,
      })
    case 'defleet':
      return rpc('zao_defleet', { p_reg: String(args?.reg ?? ''), p_reason: args?.reason != null ? String(args.reason) : 'Other' })
    case 'run_query':
      return rpc('zao_run_query', { p_sql: String(args?.sql ?? '') })
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

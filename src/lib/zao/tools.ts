// src/lib/zao/tools.ts
// The "tools" Zao can call via Groq tool-calling. Each maps to a read-only,
// org-scoped Postgres RPC (migration 0027). Calls run through supabase-js as the
// signed-in user, so RLS scopes every result to their organization automatically.
//
// Schemas below are what the model sees — keep the descriptions sharp, because
// they're how the model decides which tool answers a given question.

import { supabase } from '@/lib/supabaseClient'

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
      name: 'run_query',
      description:
        'ESCAPE HATCH for analytical questions the other tools cannot answer (grouping, counting, joins, custom filters). Provide a SINGLE read-only PostgreSQL SELECT. It is automatically scoped to this organisation, so do NOT add organization_id filters. Only use when no other tool fits.\n' +
        'TABLES: vehicles(registration, make, model, colour, size, mot_expiry date, tax_expiry date, insurance_status, current_status, is_defleeted bool, contract, date_acquired date, created_at); ' +
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
    case 'run_query':
      return rpc('zao_run_query', { p_sql: String(args?.sql ?? '') })
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

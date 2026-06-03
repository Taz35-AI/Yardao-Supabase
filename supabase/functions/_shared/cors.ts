// Shared CORS headers for all Edge Functions. The frontend calls these via
// supabase.functions.invoke() from the browser (and the Capacitor webview),
// so every function must answer the OPTIONS preflight and echo these headers.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Helper: JSON response with CORS.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Helper: handle the preflight. Returns a Response if it was an OPTIONS request,
// otherwise null so the caller continues.
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

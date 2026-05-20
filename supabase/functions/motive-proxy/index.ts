// Motive API proxy — runs as a Supabase Edge Function (Deno)
// Secrets needed (set in Supabase Dashboard → Edge Functions → Secrets):
//   MOTIVE_API_KEY_CARAT
//   MOTIVE_API_KEY_PRO_FREIGHT

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MOTIVE_BASE = 'https://api.gomotive.com/v1'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { company, path, params = {} } = await req.json()

    const apiKey = company === 'pro_freight'
      ? Deno.env.get('MOTIVE_API_KEY_PRO_FREIGHT')
      : Deno.env.get('MOTIVE_API_KEY_CARAT')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `No API key configured for company: ${company}` }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Build Motive URL
    const url = new URL(`${MOTIVE_BASE}${path}`)
    url.searchParams.set('per_page', String(params.per_page ?? 100))
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'per_page') url.searchParams.set(k, String(v))
    }

    const motiveRes = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    const body = await motiveRes.text()

    // Pass through non-2xx with full body so the client can show the real error
    if (!motiveRes.ok) {
      return new Response(
        JSON.stringify({ error: `Motive ${motiveRes.status}: ${body}` }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(body, {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})

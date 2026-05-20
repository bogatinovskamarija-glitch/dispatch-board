const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  let company, path, params
  try {
    const body = await req.json()
    company = body.company
    path    = body.path
    params  = body.params || {}
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body: ' + e.message }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  // Test endpoint — returns immediately so we can confirm the function runs
  if (path === '/test') {
    return new Response(
      JSON.stringify({ ok: true, company, message: 'Edge function is working' }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  const apiKey = company === 'pro_freight'
    ? Deno.env.get('MOTIVE_API_KEY_PRO_FREIGHT')
    : Deno.env.get('MOTIVE_API_KEY_CARAT')

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'No API key configured for: ' + company }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const url = new URL('https://api.gomotive.com/v1' + path)
    url.searchParams.set('per_page', String(params.per_page || 100))
    for (const [k, v] of Object.entries(params)) {
      if (k !== 'per_page') url.searchParams.set(k, String(v))
    }

    const motiveRes = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json',
      },
    })

    const text = await motiveRes.text()

    return new Response(
      motiveRes.ok ? text : JSON.stringify({ error: 'Motive ' + motiveRes.status + ': ' + text }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Fetch failed: ' + e.message }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})

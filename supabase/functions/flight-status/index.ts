// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Flight Status Edge Function
//  Deployed on: Supabase Edge Functions (Deno runtime)
//
//  Flow:
//    1. Receive { flightNumber, date } from the app
//    2. Check flight_cache table — if fresh (<10 min), return cached
//    3. If stale/missing, call AeroDataBox via RapidAPI
//    4. Parse response → normalised status object
//    5. Upsert into flight_cache
//    6. Return status to app
//
//  The RapidAPI key never leaves this server — the browser
//  only calls this Edge Function URL.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAPIDAPI_KEY     = Deno.env.get('RAPIDAPI_KEY') ?? ''
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CACHE_TTL_MS     = 10 * 60 * 1000   // 10 minutes

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Normalise AeroDataBox response → Kizuna status object ─────────
function parseAeroResponse(data: any, flightNumber: string, date: string) {
  const f = Array.isArray(data) ? data[0] : data?.flights?.[0] ?? data

  if (!f) return null

  // Status label mapping from AeroDataBox statusCode
  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    'Unknown':          { label: 'Scheduled',  color: '#5BB8E8' },
    'Expected':         { label: 'Scheduled',  color: '#5BB8E8' },
    'EnRoute':          { label: 'In Flight',  color: '#1C4878' },
    'CheckIn':          { label: 'Check-in',   color: '#4D8EC4' },
    'Boarding':         { label: 'Boarding',   color: '#B8715C' },
    'GateClosed':       { label: 'Final Call', color: '#A04E08' },
    'Departed':         { label: 'Departed',   color: '#1C4878' },
    'Arrived':          { label: 'Landed ✓',   color: '#2A6E3A' },
    'Cancelled':        { label: 'Cancelled',  color: '#8A3A08' },
    'Diverted':         { label: 'Diverted',   color: '#A04E08' },
    'CancelledUncertain':{ label: 'Cancelled', color: '#8A3A08' },
  }

  const raw    = f.status ?? 'Unknown'
  const mapped = STATUS_MAP[raw] ?? { label: raw, color: '#5BB8E8' }

  // Extract actual vs scheduled times
  const dep = f.departure ?? {}
  const arr = f.arrival   ?? {}

  const delayMins = dep.delayMin ?? 0

  return {
    label:           mapped.label,
    color:           mapped.color,
    rawStatus:       raw,
    flightNumber:    f.number ?? flightNumber,
    date:            date,
    // ── Auto-fill fields for the flight entry form ──────────────
    airlineName:     f.airline?.name ?? null,
    depIata:         dep.airport?.iata ?? null,
    arrIata:         arr.airport?.iata ?? null,
    // Scheduled times (what user entered)
    scheduledDep:    dep.scheduledTimeLocal ?? null,
    scheduledArr:    arr.scheduledTimeLocal ?? null,
    // Actual/revised times (live from AeroDataBox)
    revisedDep:      dep.revisedTimeLocal   ?? dep.scheduledTimeLocal ?? null,
    revisedArr:      arr.revisedTimeLocal   ?? arr.scheduledTimeLocal ?? null,
    // Delay
    delayMins:       delayMins,
    delayLabel:      delayMins > 0 ? `+${delayMins} min` : delayMins < 0 ? `${delayMins} min` : 'On time',
    onTime:          Math.abs(delayMins) < 5,
    // Gate/terminal (may update live)
    terminal:        dep.terminal   ?? null,
    gate:            dep.gate       ?? null,
    arrTerminal:     arr.terminal   ?? null,
    // Aircraft
    aircraft:        f.aircraft?.model ?? null,
    // Meta
    fetchedAt:       new Date().toISOString(),
    source:          'AeroDataBox',
  }
}

// ── Main handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { flightNumber, date } = await req.json()

    // Validate inputs
    if (!flightNumber || !date) {
      return new Response(
        JSON.stringify({ error: 'flightNumber and date are required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const clean = flightNumber.replace(/\s+/g, '').toUpperCase()
    const cacheKey = `${clean}_${date}`

    // Init Supabase with service role (bypasses RLS for cache table)
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE)

    // ── 1. Check cache ──────────────────────────────────────────
    const { data: cached } = await db
      .from('flight_cache')
      .select('status, fetched_at')
      .eq('id', cacheKey)
      .single()

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (age < CACHE_TTL_MS) {
        // Cache hit — return immediately, no API call
        return new Response(
          JSON.stringify({ ...cached.status, cached: true }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── 2. Call AeroDataBox ────────────────────────────────────
    if (!RAPIDAPI_KEY) {
      return new Response(
        JSON.stringify({ error: 'RAPIDAPI_KEY not configured' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${clean}/${date}`
    const apiRes = await fetch(url, {
      headers: {
        'X-RapidAPI-Key':  RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    })

    if (!apiRes.ok) {
      // API error — return local fallback signal so app uses time-based status
      return new Response(
        JSON.stringify({ error: 'api_error', status: apiRes.status }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const raw = await apiRes.json()

    // ── 3. Parse response ──────────────────────────────────────
    const status = parseAeroResponse(raw, clean, date)

    if (!status) {
      return new Response(
        JSON.stringify({ error: 'flight_not_found' }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // ── 4. Upsert into cache ────────────────────────────────────
    await db.from('flight_cache').upsert({
      id:            cacheKey,
      flight_number: clean,
      flight_date:   date,
      status:        status,
      fetched_at:    new Date().toISOString(),
    })

    // ── 5. Return live status ──────────────────────────────────
    return new Response(
      JSON.stringify({ ...status, cached: false }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})

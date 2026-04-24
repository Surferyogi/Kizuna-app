// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Flight Status Edge Function v2
//  AviationStack (form fill) + AeroDataBox (live status)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AVIATIONSTACK_KEY = Deno.env.get('AVIATIONSTACK_KEY') ?? ''
const RAPIDAPI_KEY      = Deno.env.get('RAPIDAPI_KEY')      ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SERVICE_KEY       = Deno.env.get('SERVICE_ROLE_KEY')  ?? ''
const CACHE_TTL_MS      = 10 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── AviationStack: airline, airports, times, terminal, gate ──────
async function callAviationStack(flightIata: string, date: string) {
  if (!AVIATIONSTACK_KEY) return null
  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_KEY}&flight_iata=${encodeURIComponent(flightIata)}&flight_date=${encodeURIComponent(date)}`
    const res = await fetch(url)
    if (!res.ok) { console.error('AvStack', res.status); return null }
    const body = await res.json()
    const f = body?.data?.[0]
    if (!f) { console.warn('AvStack no data', flightIata, date); return null }
    const dep = f.departure ?? {}
    const arr = f.arrival   ?? {}
    return {
      airlineName:  f.airline?.name ?? null,
      depIata:      dep.iata        ?? null,
      arrIata:      arr.iata        ?? null,
      depAirport:   dep.airport     ?? null,
      arrAirport:   arr.airport     ?? null,
      terminal:     dep.terminal    ?? null,
      gate:         dep.gate        ?? null,
      scheduledDep: dep.scheduled   ?? null,
      scheduledArr: arr.scheduled   ?? null,
      actualDep:    dep.actual      ?? dep.estimated ?? null,
      delayMins:    dep.delay       ?? 0,
      flightStatus: f.flight_status ?? 'scheduled',
    }
  } catch (e) { console.error('AvStack err', e); return null }
}

// ── AeroDataBox: live status label + color ───────────────────────
async function callAeroDataBox(flightNumber: string, date: string) {
  if (!RAPIDAPI_KEY) return null
  try {
    const res = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${date}`, {
      headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const f = Array.isArray(data) ? data[0] : data?.flights?.[0] ?? data
    if (!f) return null
    const STATUS_MAP: Record<string,{label:string;color:string}> = {
      'Unknown':           { label:'Scheduled',  color:'#5BB8E8' },
      'Expected':          { label:'Scheduled',  color:'#5BB8E8' },
      'EnRoute':           { label:'In Flight',  color:'#1C4878' },
      'CheckIn':           { label:'Check-in',   color:'#4D8EC4' },
      'Boarding':          { label:'Boarding',   color:'#B8715C' },
      'GateClosed':        { label:'Final Call', color:'#A04E08' },
      'Departed':          { label:'Departed',   color:'#1C4878' },
      'Arrived':           { label:'Landed ✓',   color:'#2A6E3A' },
      'Cancelled':         { label:'Cancelled',  color:'#8A3A08' },
      'Diverted':          { label:'Diverted',   color:'#A04E08' },
      'CancelledUncertain':{ label:'Cancelled',  color:'#8A3A08' },
    }
    const raw    = f.status ?? 'Unknown'
    const mapped = STATUS_MAP[raw] ?? { label:'Scheduled', color:'#5BB8E8' }
    const dep    = f.departure ?? {}
    return { label:mapped.label, color:mapped.color, aircraft:f.aircraft?.model??null, terminal:dep.terminal??null, gate:dep.gate??null }
  } catch (e) { console.error('AeroDB err', e); return null }
}

function statusFromAvStack(s: string): { label:string; color:string } {
  const map: Record<string,{label:string;color:string}> = {
    'scheduled':{ label:'Scheduled', color:'#5BB8E8' },
    'active':   { label:'In Flight', color:'#1C4878' },
    'landed':   { label:'Landed ✓',  color:'#2A6E3A' },
    'cancelled':{ label:'Cancelled', color:'#8A3A08' },
    'diverted': { label:'Diverted',  color:'#A04E08' },
  }
  return map[s?.toLowerCase()] ?? { label:'Scheduled', color:'#5BB8E8' }
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { flightNumber, date } = await req.json()
    if (!flightNumber || !date) return json({ error:'flightNumber and date are required' }, 400)

    const clean    = flightNumber.replace(/\s+/g,'').toUpperCase()
    const cacheKey = `${clean}_${date}`

    // 1. Cache check
    let db = null
    if (SUPABASE_URL && SERVICE_KEY) {
      db = createClient(SUPABASE_URL, SERVICE_KEY)
      const { data: cached } = await db.from('flight_cache').select('status,fetched_at').eq('id',cacheKey).maybeSingle()
      if (cached) {
        const age = Date.now() - new Date(cached.fetched_at).getTime()
        if (age < CACHE_TTL_MS) return json({ ...cached.status, cached:true })
      }
    }

    // 2. Call both APIs in parallel
    const [avStack, aeroDB] = await Promise.all([
      callAviationStack(clean, date),
      callAeroDataBox(clean, date),
    ])

    if (!avStack && !aeroDB) return json({ error:'flight_not_found' })

    // 3. Merge — AviationStack primary for form fill, AeroDataBox for status
    const statusInfo = aeroDB
      ? { label:aeroDB.label, color:aeroDB.color }
      : statusFromAvStack(avStack?.flightStatus ?? 'scheduled')

    const delayMins = avStack?.delayMins ?? 0

    const result = {
      label:        statusInfo.label,
      color:        statusInfo.color,
      airlineName:  avStack?.airlineName  ?? null,
      depIata:      avStack?.depIata      ?? null,
      arrIata:      avStack?.arrIata      ?? null,
      depAirport:   avStack?.depAirport   ?? null,
      arrAirport:   avStack?.arrAirport   ?? null,
      terminal:     avStack?.terminal     ?? aeroDB?.terminal ?? null,
      gate:         avStack?.gate         ?? aeroDB?.gate     ?? null,
      scheduledDep: avStack?.scheduledDep ?? null,
      scheduledArr: avStack?.scheduledArr ?? null,
      revisedDep:   avStack?.actualDep    ?? avStack?.scheduledDep ?? null,
      delayMins,
      delayLabel:   delayMins > 0 ? `+${delayMins} min` : delayMins < 0 ? `${delayMins} min` : 'On time',
      onTime:       Math.abs(delayMins) < 5,
      aircraft:     aeroDB?.aircraft      ?? null,
      flightNumber: clean,
      date,
      fetchedAt:    new Date().toISOString(),
      source:       avStack ? 'AviationStack+AeroDataBox' : 'AeroDataBox',
    }

    // 4. Cache
    if (db) {
      await db.from('flight_cache').upsert({ id:cacheKey, flight_number:clean, flight_date:date, status:result, fetched_at:new Date().toISOString() })
    }

    return json({ ...result, cached:false })
  } catch (err) {
    console.error('Edge fn error:', err)
    return json({ error:String(err) }, 500)
  }
})

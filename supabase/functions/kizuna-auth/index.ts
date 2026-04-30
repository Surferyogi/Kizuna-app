// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Passphrase Auth Edge Function v2
//
//  Flow:
//  1. Client sends { email, passphrase }
//  2. RPC verify_kizuna_passphrase() checks bcrypt hash in DB
//  3. If valid, admin.generateLink() creates a single-use token
//  4. Client calls supabase.auth.verifyOtp({ token, type:'magiclink' })
//  5. Full Supabase JWT session issued — RLS works normally
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')     ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const SITE_URL         = 'https://surferyogi.github.io/Kizuna-app/'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const failed   = new Map<string, { n: number; until: number }>()
const MAX_FAIL = 5
const WIN_MS   = 15 * 60 * 1000

const limited = (e: string) => {
  const r = failed.get(e); const now = Date.now()
  if (!r || now > r.until) return false
  return r.n >= MAX_FAIL
}
const fail  = (e: string) => {
  const now = Date.now(); const r = failed.get(e)
  if (!r || now > r.until) failed.set(e, { n: 1, until: now + WIN_MS })
  else r.n++
}
const clear = (e: string) => failed.delete(e)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const { email, passphrase } = body

    if (!email || !passphrase)
      return json({ error: 'Email and passphrase are required.' }, 400)

    const cleanEmail = String(email).trim().toLowerCase()

    if (limited(cleanEmail))
      return json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, 429)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Step 1: Verify passphrase via RPC — returns display_name or null
    const { data: displayName, error: rpcErr } = await admin.rpc(
      'verify_kizuna_passphrase',
      { p_email: cleanEmail, p_passphrase: passphrase }
    )

    if (rpcErr) {
      console.error('RPC error:', rpcErr.message)
      fail(cleanEmail)
      return json({ error: 'Invalid email or passphrase.' }, 401)
    }

    if (!displayName) {
      fail(cleanEmail)
      return json({ error: 'Invalid email or passphrase.' }, 401)
    }

    // Step 2: Generate single-use magic link token
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:    'signup',
      email:   cleanEmail,
      options: { redirectTo: SITE_URL },
    })

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('generateLink error:', linkErr?.message)
      return json({ error: 'Authentication failed. Please try again.' }, 500)
    }

    // Step 3: Return token to client
    clear(cleanEmail)
    return json({
      token:        linkData.properties.hashed_token,
      email:        cleanEmail,
      display_name: displayName,
    })

  } catch (err) {
    console.error('kizuna-auth unhandled:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

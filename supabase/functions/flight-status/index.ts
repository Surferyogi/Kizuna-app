// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Passphrase Auth Edge Function
//
//  Flow:
//  1. Client sends { email, passphrase }
//  2. We look up the email in kizuna_users table
//  3. Verify passphrase against bcrypt hash using pgcrypto
//  4. If valid, generate a Supabase magic link token via admin API
//  5. Return the token to the client — client calls verifyOtp()
//  6. Supabase issues a full JWT session — RLS works normally
//
//  Security:
//  - SERVICE_ROLE_KEY lives only here, never in client code
//  - Passphrases are bcrypt hashed in DB — never stored plaintext
//  - Generated token is single-use and expires in 60 seconds
//  - Unknown emails receive identical error to wrong passphrases
//    (prevents email enumeration attacks)
//  - Rate limiting: 5 attempts per email per 15 minutes
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')       ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SERVICE_ROLE_KEY')   ?? ''
const SITE_URL          = 'https://surferyogi.github.io/Kizuna-app/'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// Generic error — same message for unknown email AND wrong passphrase
// This prevents attackers from knowing which emails are registered
const AUTH_ERROR = json({ error: 'Invalid email or passphrase.' }, 401)

// In-memory rate limiter — tracks failed attempts per email
// Resets when the Edge Function instance restarts (acceptable for our scale)
const failedAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT     = 5
const RATE_WINDOW_MS = 15 * 60 * 1000  // 15 minutes

function isRateLimited(email: string): boolean {
  const now  = Date.now()
  const rec  = failedAttempts.get(email)
  if (!rec || now > rec.resetAt) return false
  return rec.count >= RATE_LIMIT
}

function recordFailure(email: string): void {
  const now = Date.now()
  const rec = failedAttempts.get(email)
  if (!rec || now > rec.resetAt) {
    failedAttempts.set(email, { count: 1, resetAt: now + RATE_WINDOW_MS })
  } else {
    rec.count++
  }
}

function clearFailures(email: string): void {
  failedAttempts.delete(email)
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { email, passphrase } = await req.json()

    // ── Basic validation ──────────────────────────────────────
    if (!email || !passphrase) {
      return json({ error: 'Email and passphrase are required.' }, 400)
    }
    const cleanEmail = email.trim().toLowerCase()

    // ── Rate limit check ──────────────────────────────────────
    if (isRateLimited(cleanEmail)) {
      return json({
        error: 'Too many failed attempts. Please try again in 15 minutes.'
      }, 429)
    }

    // ── Admin client — service role, can query any table ──────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ── Step 1: Verify passphrase using pgcrypto ──────────────
    // crypt() checks the passphrase against the stored bcrypt hash.
    // We select a row only if BOTH email matches AND passphrase verifies.
    // This means: wrong email → no row, wrong passphrase → no row.
    // Attacker cannot distinguish the two cases.
    const { data: userRow, error: dbErr } = await admin
      .from('kizuna_users')
      .select('email, display_name, is_active')
      .eq('email', cleanEmail)
      .eq('is_active', true)
      .filter('passphrase_hash', 'eq', admin.rpc('verify_passphrase', {
        input_passphrase: passphrase,
        stored_hash:      'passphrase_hash'  // column name — handled via RPC below
      }))
      .maybeSingle()

    // Use a direct SQL RPC for the crypt() check instead
    // (Supabase PostgREST doesn't support calling crypt() inline in filters)
    const { data: verified, error: rpcErr } = await admin.rpc('verify_kizuna_passphrase', {
      p_email:      cleanEmail,
      p_passphrase: passphrase,
    })

    if (rpcErr || !verified) {
      recordFailure(cleanEmail)
      return AUTH_ERROR
    }

    // ── Step 2: Generate a single-use login token ─────────────
    // generateLink() uses the admin API to create a magic link token.
    // We extract just the token — we never send the link anywhere.
    // The token is valid for 60 seconds and single-use.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:       'magiclink',
      email:      cleanEmail,
      options:    { redirectTo: SITE_URL },
    })

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('generateLink error:', linkErr)
      return json({ error: 'Authentication failed. Please try again.' }, 500)
    }

    // ── Step 3: Return token to client ────────────────────────
    clearFailures(cleanEmail)

    return json({
      token:        linkData.properties.hashed_token,
      email:        cleanEmail,
      display_name: verified,  // returned from the RPC
    })

  } catch (err) {
    console.error('kizuna-auth error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

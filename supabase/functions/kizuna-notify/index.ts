// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Morning Summary Push Notification
//  Triggered by Supabase pg_cron at 00:00 UTC (08:00 SGT)
//  Sends personalised daily schedule to both users' iPhones.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')        ?? ''
const SERVICE_KEY    = Deno.env.get('SERVICE_ROLE_KEY')     ?? ''
const VAPID_PUB      = Deno.env.get('VAPID_PUBLIC_KEY')     ?? ''
const VAPID_PRIV     = Deno.env.get('VAPID_PRIVATE_KEY')    ?? ''
const VAPID_SUBJECT  = 'mailto:koksum@yahoo.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── VAPID JWT signing ─────────────────────────────────────────
function b64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function strToU8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

async function signVAPID(audience: string): Promise<string> {
  const header  = b64url(strToU8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(strToU8(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200, // 12h
    sub: VAPID_SUBJECT,
  })))
  const msg = `${header}.${payload}`

  // Import private key from base64url d value
  const dBytes = Uint8Array.from(atob(VAPID_PRIV.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  const jwk = { kty:'EC', crv:'P-256', d: VAPID_PRIV,
    // Derive x,y from public key
    x: VAPID_PUB.slice(1, 43), y: VAPID_PUB.slice(43, 86) }

  // VAPID_PUB is base64url of uncompressed point (0x04 + 32 bytes x + 32 bytes y = 65 bytes)
  const pubBytes = Uint8Array.from(atob(VAPID_PUB.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
  const xB64 = b64url(pubBytes.slice(1, 33))
  const yB64 = b64url(pubBytes.slice(33, 65))

  const privKey = await crypto.subtle.importKey(
    'jwk',
    { kty:'EC', crv:'P-256', d: VAPID_PRIV, x: xB64, y: yB64 },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    strToU8(msg)
  )
  return `${msg}.${b64url(new Uint8Array(sig))}`
}

// ── Send one Web Push ─────────────────────────────────────────
async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const url    = new URL(sub.endpoint)
  const origin = `${url.protocol}//${url.host}`
  const jwt    = await signVAPID(origin)

  const res = await fetch(sub.endpoint, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/octet-stream',
      'Authorization': `vapid t=${jwt},k=${VAPID_PUB}`,
      'TTL':           '86400',
    },
    body: strToU8(payload),
  })
  return res
}

// ── Build morning summary text ────────────────────────────────
function buildSummary(name: string, entries: any[]): { title: string; body: string } {
  const today = new Date().toISOString().slice(0, 10)
  const todayItems = entries
    .filter((e: any) => e.date === today && !e.done)
    .sort((a: any, b: any) => (a.time || '99:99').localeCompare(b.time || '99:99'))

  const greetings = ['Good morning', 'Rise and shine', 'Morning']
  const greeting  = greetings[Math.floor(Math.random() * greetings.length)]

  if (todayItems.length === 0) {
    return {
      title: `Kizuna 絆 · Good morning, ${name} ☀️`,
      body:  `${greeting}! A peaceful day ahead — nothing scheduled today. Enjoy the space 🌸`,
    }
  }

  const typeEmoji: Record<string, string> = {
    meeting: '🗓', task: '✓', flight: '✈️', reminder: '⏰',
    event: '🎉', birthday: '🎂',
  }

  const lines = todayItems.slice(0, 5).map((e: any) => {
    const emoji = typeEmoji[e.type] || '·'
    const time  = e.time ? ` ${e.time.slice(0,5)}` : ''
    return `${emoji}${time} ${e.title}`
  })

  const more = todayItems.length > 5 ? ` +${todayItems.length - 5} more` : ''

  return {
    title: `Kizuna 絆 · ${greeting}, ${name} ☀️`,
    body:  `${todayItems.length} item${todayItems.length !== 1 ? 's' : ''} today${more}\n${lines.join('\n')}`,
  }
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  // Load all push subscriptions with user display names and entries
  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, display_name')

  if (subErr) return json({ error: subErr.message }, 500)
  if (!subs || subs.length === 0) return json({ sent: 0, message: 'No subscriptions' })

  const results = []
  for (const sub of subs) {
    try {
      // Load entries for this user
      const { data: entryRows } = await db
        .from('entries')
        .select('data')
        .eq('user_id', sub.user_id)

      const entries = (entryRows || []).map((r: any) => r.data).filter(Boolean)
      const { title, body } = buildSummary(sub.display_name || 'there', entries)

      const payload = JSON.stringify({
        title,
        body,
        tag:  'kizuna-morning',
        url:  '/Kizuna-app/',
      })

      const res = await sendPush(sub, payload)
      results.push({ user_id: sub.user_id, status: res.status, ok: res.ok })

      // Remove expired subscriptions (410 Gone)
      if (res.status === 410 || res.status === 404) {
        await db.from('push_subscriptions')
          .delete().eq('endpoint', sub.endpoint)
      }
    } catch (err) {
      results.push({ user_id: sub.user_id, error: String(err) })
    }
  }

  return json({ sent: results.filter((r: any) => r.ok).length, results })
})

// Kizuna 絆 — Morning Summary Push Notification v4
// Shows today + tomorrow + day after tomorrow.
// Zero npm dependencies — Web Crypto API only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')     ?? ''
const SERVICE_KEY   = Deno.env.get('SERVICE_ROLE_KEY')  ?? ''
const VAPID_PUB     = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIV    = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = 'mailto:koksum@yahoo.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const enc = new TextEncoder()

// ── crypto helpers ─────────────────────────────────────────────────────────
function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4)
  return Uint8Array.from(atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
function bytesToB64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let i = 0; for (const a of arrays) { out.set(a, i); i += a.length }
  return out
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array) => hmac(salt, ikm)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const N = Math.ceil(len / 32), out = new Uint8Array(N * 32)
  let t = new Uint8Array(0)
  for (let i = 1; i <= N; i++) { t = await hmac(prk, concat(t, info, new Uint8Array([i]))); out.set(t, (i-1)*32) }
  return out.slice(0, len)
}

// ── RFC 8291 + RFC 8188 encryption ────────────────────────────────────────
async function encryptPayload(p256dhB64: string, authB64: string, plaintext: string) {
  const uaPub = b64urlToBytes(p256dhB64), authKey = b64urlToBytes(authB64)
  const serverKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKP.privateKey, 256))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prkKey = await hkdfExtract(authKey, sharedSecret)
  const ikm    = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\x00'), uaPub, serverPubRaw), 32)
  const prk    = await hkdfExtract(salt, ikm)
  const cek    = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16)
  const nonce  = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey,
    concat(enc.encode(plaintext), new Uint8Array([0x02]))))
  const header = new Uint8Array(86)
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = 65; header.set(serverPubRaw, 21)
  return { body: concat(header, cipher), contentType: 'application/octet-stream', contentEncoding: 'aes128gcm' }
}

// ── VAPID JWT ──────────────────────────────────────────────────────────────
async function makeVapidAuth(audience: string): Promise<string> {
  const hdr = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const pay = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now()/1000)+43200, sub: VAPID_SUBJECT })))
  const msg = `${hdr}.${pay}`
  const pub = b64urlToBytes(VAPID_PUB)
  const privKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: VAPID_PRIV,
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(msg)))
  return `${msg}.${bytesToB64url(sig)}`
}

// ── Send one push notification ─────────────────────────────────────────────
async function sendPush(endpoint: string, p256dh: string, auth: string, payload: string) {
  const url = new URL(endpoint)
  const jwt = await makeVapidAuth(`${url.protocol}//${url.host}`)
  const { body, contentType, contentEncoding } = await encryptPayload(p256dh, auth, payload)
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':   `vapid t=${jwt},k=${VAPID_PUB}`,
      'Content-Type':     contentType,
      'Content-Encoding': contentEncoding,
      'TTL':             '86400',
      'apns-push-type':  'alert',
      'apns-priority':   '10',
    },
    body,
  })
  return { ok: res.status >= 200 && res.status < 300, status: res.status, body: await res.text().catch(() => '') }
}

// ── Date helpers (SGT = UTC+8) ─────────────────────────────────────────────
function sgtDate(offsetDays = 0): string {
  return new Date(Date.now() + (8 * 60 + offsetDays * 1440) * 60000).toISOString().slice(0, 10)
}
function dayLabel(offset: number): string {
  return offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'In 2 days'
}

const EMOJI: Record<string, string> = {
  appointment: '📅', task: '✅', flight: '✈️',
  reminder: '⏰', event: '🎉', birthday: '🎂', anniversary: '💕',
}

// ── Build 3-day notification ───────────────────────────────────────────────
function buildSummary(name: string, entries: any[]): { title: string; body: string } {
  const sections: string[] = []
  let total = 0

  for (const offset of [0, 1, 2]) {
    const date = sgtDate(offset)
    const items = entries
      .filter((e: any) => {
        if (!e?.date || e.done || e.cancelled) return false
        if (e.date !== date) return false
        // Hide landed flights
        const ll = (e.live_label || e.liveLabel || '').toLowerCase()
        if (e.type === 'flight' && (ll.includes('land') || ll.includes('arriv'))) return false
        return true
      })
      .sort((a: any, b: any) => (a.time || '99:99').localeCompare(b.time || '99:99'))

    if (!items.length) continue
    total += items.length

    // Up to 3 items per day to keep notification concise
    const lines = items.slice(0, 3).map((e: any) => {
      const icon = EMOJI[e.type] || '·'
      const time = e.time ? ` ${e.time.slice(0, 5)}` : ''
      return `${icon}${time} ${e.title}`
    })
    if (items.length > 3) lines.push(`  +${items.length - 3} more`)

    sections.push(`— ${dayLabel(offset)} —\n${lines.join('\n')}`)
  }

  return {
    title: `Kizuna 絆 · Good morning, ${name} ☀️`,
    body:  total === 0
      ? 'All clear for the next 3 days 🌸 Enjoy the peace!'
      : sections.join('\n\n'),
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!VAPID_PUB || !VAPID_PRIV) return json({ error: 'VAPID keys not configured' }, 500)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, display_name, notify_hour')

  if (subErr) return json({ error: subErr.message }, 500)
  if (!subs?.length) return json({ sent: 0, message: 'No subscriptions' })

  const hourSGT = (new Date().getUTCHours() + 8) % 24
  console.log(`${subs.length} subscription(s) — SGT hour: ${hourSGT}`)

  const dueSubs = subs.filter((s: any) => (s.notify_hour ?? 8) === hourSGT)
  if (!dueSubs.length) return json({ sent: 0, message: `No notifications due at SGT ${hourSGT}:00` })

  const WORKSPACE_ID = '091ddb7a-c8a4-420f-b74f-e620916a44c2'
  const results = []

  for (const sub of dueSubs) {
    try {
      // Resolve display name
      let name = sub.display_name
      if (!name) {
        const { data: p } = await db.from('profiles').select('display_name').eq('id', sub.user_id).single()
        name = p?.display_name || 'there'
      }

      // Own entries
      const { data: ownRows } = await db.from('entries').select('data').eq('user_id', sub.user_id)
      const ownEntries = (ownRows || []).map((r: any) => r.data).filter(Boolean)

      // Shared entries from other workspace members
      const { data: members } = await db.from('workspace_members').select('user_id').eq('workspace_id', WORKSPACE_ID)
      const otherIds = (members || []).map((m: any) => m.user_id).filter((id: string) => id !== sub.user_id)

      let sharedEntries: any[] = []
      for (const memberId of otherIds) {
        const { data: rows } = await db.from('entries').select('data').eq('user_id', memberId)
        sharedEntries = [
          ...sharedEntries,
          ...(rows || []).map((r: any) => r.data).filter((e: any) => e?.visibility === 'shared')
        ]
      }

      const { title, body } = buildSummary(name, [...ownEntries, ...sharedEntries])
      console.log(`→ ${name}:\n${body}`)

      const result = await sendPush(sub.endpoint, sub.p256dh, sub.auth,
        JSON.stringify({ title, body, tag: 'kizuna-morning', url: '/Kizuna-app/' }))

      console.log(`HTTP ${result.status} for ${name}`)

      // Clean up expired subscriptions
      if (result.status === 404 || result.status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        console.log(`Removed expired subscription for ${sub.user_id}`)
      }

      results.push({ user: name, status: result.status, ok: result.ok, error: result.body || null })
    } catch (err: any) {
      console.error(`Error for ${sub.user_id}:`, err?.message)
      results.push({ user_id: sub.user_id, ok: false, error: err?.message })
    }
  }

  const sent = results.filter((r: any) => r.ok).length
  console.log(`Done: ${sent}/${results.length} sent`)
  return json({ sent, total: results.length, results })
})

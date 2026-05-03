// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Morning Summary Push Notification v3
//  Fully self-contained: Web Crypto API only, zero npm deps.
//  Implements RFC 8291 (WebPush encryption) + RFC 8188 (aes128gcm)
//  + VAPID JWT signing (ES256). Works on Supabase Edge Runtime.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')      ?? ''
const SERVICE_KEY   = Deno.env.get('SERVICE_ROLE_KEY')   ?? ''
const VAPID_PUB     = Deno.env.get('VAPID_PUBLIC_KEY')   ?? ''
const VAPID_PRIV    = Deno.env.get('VAPID_PRIVATE_KEY')  ?? ''
const VAPID_SUBJECT = 'mailto:koksum@yahoo.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Helpers ───────────────────────────────────────────────────
const enc = new TextEncoder()

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

// ── HKDF primitives (RFC 5869) ────────────────────────────────
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM)
const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array) => hmac(salt, ikm)

// HKDF-Expand: T(1)||T(2)||... truncated to `len` bytes
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const N = Math.ceil(len / 32)
  const out = new Uint8Array(N * 32)
  let t = new Uint8Array(0)
  for (let i = 1; i <= N; i++) {
    t = await hmac(prk, concat(t, info, new Uint8Array([i])))
    out.set(t, (i - 1) * 32)
  }
  return out.slice(0, len)
}

// ── RFC 8291 + RFC 8188: encrypt Web Push payload ─────────────
async function encryptPayload(
  p256dhB64: string,   // subscriber's public key
  authB64: string,     // subscriber's auth secret
  plaintext: string
): Promise<{ body: Uint8Array; contentType: string; contentEncoding: string }> {
  const uaPub   = b64urlToBytes(p256dhB64)  // 65 bytes, uncompressed P-256
  const authKey = b64urlToBytes(authB64)     // 16 bytes

  // 1. Ephemeral server ECDH key pair
  const serverKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey))

  // 2. Import subscriber public key and derive shared secret
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKP.privateKey, 256))

  // 3. Salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 4. RFC 8291 key derivation
  //    PRK_key = HKDF-Extract(salt=auth, IKM=sharedSecret)
  const prkKey = await hkdfExtract(authKey, sharedSecret)
  //    key_info = "WebPush: info\0" || uaPub (65) || serverPub (65)
  const keyInfo = concat(enc.encode('WebPush: info\x00'), uaPub, serverPubRaw)
  //    IKM = HKDF-Expand(PRK_key, key_info, 32)
  const ikm = await hkdfExpand(prkKey, keyInfo, 32)

  // 5. RFC 8188 content key derivation
  //    PRK = HKDF-Extract(salt=salt, IKM=ikm)
  const prk = await hkdfExtract(salt, ikm)
  //    CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const cek   = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16)
  //    NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12)

  // 6. AES-128-GCM encrypt (append 0x02 as last-record delimiter)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ptBytes = enc.encode(plaintext)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(ptBytes, new Uint8Array([0x02])))
  )

  // 7. RFC 8188 header: salt(16) + rs_uint32be(4) + idlen(1) + serverPub(65)
  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = 65
  header.set(serverPubRaw, 21)

  return {
    body: concat(header, ciphertext),
    contentType:     'application/octet-stream',
    contentEncoding: 'aes128gcm',
  }
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────
async function makeVapidAuth(audience: string): Promise<string> {
  const header  = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: VAPID_SUBJECT,
  })))
  const msg = `${header}.${payload}`

  // Import private key as ECDSA (same P-256 curve as generated ECDH key)
  const pubBytes = b64urlToBytes(VAPID_PUB)
  const privKey  = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    d:   VAPID_PRIV,
    x:   bytesToB64url(pubBytes.slice(1, 33)),
    y:   bytesToB64url(pubBytes.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(msg)))
  return `${msg}.${bytesToB64url(sig)}`
}

// ── Send one Web Push ─────────────────────────────────────────
async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const url      = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt      = await makeVapidAuth(audience)
  const { body, contentType, contentEncoding } = await encryptPayload(p256dh, auth, payload)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt},k=${VAPID_PUB}`,
      'Content-Type':      contentType,
      'Content-Encoding':  contentEncoding,
      'TTL':              '86400',
      'apns-push-type':   'alert',
      'apns-priority':    '10',
    },
    body,
  })
  const resBody = await res.text().catch(() => '')
  return { ok: res.status >= 200 && res.status < 300, status: res.status, body: resBody }
}

// ── Morning summary text ──────────────────────────────────────
function buildSummary(name: string, entries: any[]): { title: string; body: string } {
  const today = new Date().toISOString().slice(0, 10)
  const items = entries
    .filter((e: any) => e.date === today && !e.done)
    .sort((a: any, b: any) => (a.time || '99:99').localeCompare(b.time || '99:99'))

  if (items.length === 0) {
    return {
      title: `Kizuna 絆 · Good morning, ${name} ☀️`,
      body:  'A peaceful day ahead — nothing scheduled today 🌸',
    }
  }

  const emoji: Record<string, string> = {
    meeting:'🗓', task:'✓', flight:'✈️', reminder:'⏰', event:'🎉', birthday:'🎂',
  }
  const lines = items.slice(0, 4).map((e: any) =>
    `${emoji[e.type] || '·'}${e.time ? ' ' + e.time.slice(0, 5) : ''} ${e.title}`
  )
  const more = items.length > 4 ? `\n+${items.length - 4} more` : ''

  return {
    title: `Kizuna 絆 · Good morning, ${name} ☀️`,
    body:  `${items.length} item${items.length !== 1 ? 's' : ''} today\n${lines.join('\n')}${more}`,
  }
}

// ── Main ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!VAPID_PUB || !VAPID_PRIV) {
    console.error('VAPID keys not set')
    return json({ error: 'VAPID keys not configured' }, 500)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, display_name, notify_hour')

  if (subErr) { console.error('DB error:', subErr.message); return json({ error: subErr.message }, 500) }
  if (!subs?.length) { console.log('No subscriptions'); return json({ sent: 0 }) }

  // Current hour in SGT (UTC+8)
  const nowUTC  = new Date()
  const hourSGT = (nowUTC.getUTCHours() + 8) % 24

  console.log(`Found ${subs.length} subscription(s) — SGT hour: ${hourSGT}`)

  // Filter to subscriptions whose notify_hour matches current SGT hour
  // Default notify_hour is 8 (8am SGT)
  const dueSubs = subs.filter((s: any) => (s.notify_hour ?? 8) === hourSGT)
  if (!dueSubs.length) {
    console.log(`No subscriptions due at hour ${hourSGT}`)
    return json({ sent: 0, message: `No notifications due at SGT ${hourSGT}:00` })
  }
  const results = []

  for (const sub of dueSubs) {
    try {
      // Get display name
      let name = sub.display_name
      if (!name) {
        const { data: p } = await db.from('profiles').select('display_name').eq('id', sub.user_id).single()
        name = p?.display_name || 'there'
      }

      // Load entries for this user AND shared entries from all workspace members
      // Step 1: get all workspace member user_ids
      const WORKSPACE_ID = '091ddb7a-c8a4-420f-b74f-e620916a44c2'
      const { data: members } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', WORKSPACE_ID)
      const memberIds = (members || []).map((m: any) => m.user_id)

      // Step 2: load own entries
      const { data: ownRows } = await db.from('entries').select('data')
        .eq('user_id', sub.user_id)
      const ownEntries = (ownRows || []).map((r: any) => r.data).filter(Boolean)

      // Step 3: load shared entries from other workspace members
      const otherIds = memberIds.filter((id: string) => id !== sub.user_id)
      let sharedEntries: any[] = []
      for (const memberId of otherIds) {
        const { data: sharedRows } = await db.from('entries').select('data')
          .eq('user_id', memberId)
        const memberEntries = (sharedRows || [])
          .map((r: any) => r.data)
          .filter((e: any) => e && e.visibility === 'shared')
        sharedEntries = [...sharedEntries, ...memberEntries]
      }

      const entries = [...ownEntries, ...sharedEntries]

      const { title, body } = buildSummary(name, entries)
      console.log(`Sending to ${name}: "${title}"`)

      const result = await sendPush(
        sub.endpoint, sub.p256dh, sub.auth,
        JSON.stringify({ title, body, tag: 'kizuna-morning', url: '/Kizuna-app/' })
      )

      console.log(`Result for ${name}: HTTP ${result.status} — ${result.body || 'ok'}`)

      // Remove expired subscriptions
      if (result.status === 404 || result.status === 410) {
        console.log(`Removing expired subscription for ${sub.user_id}`)
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }

      results.push({ user: name, status: result.status, ok: result.ok, appleError: result.body })
    } catch (err: any) {
      console.error(`Error for ${sub.user_id}:`, err?.message ?? String(err))
      results.push({ user_id: sub.user_id, ok: false, error: err?.message })
    }
  }

  const sent = results.filter((r: any) => r.ok).length
  console.log(`Done: ${sent}/${results.length} delivered`)
  return json({ sent, total: results.length, results })
})

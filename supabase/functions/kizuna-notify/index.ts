// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Morning Summary Push Notification v2
//  Uses npm:web-push which handles RFC 8291 payload encryption,
//  VAPID signing, and Apple APNs compatibility automatically.
//  Triggered by pg_cron at 00:00 UTC = 08:00 SGT daily.
// ═══════════════════════════════════════════════════════════════

import webpush  from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')       ?? ''
const SERVICE_KEY   = Deno.env.get('SERVICE_ROLE_KEY')    ?? ''
const VAPID_PUB     = Deno.env.get('VAPID_PUBLIC_KEY')    ?? ''
const VAPID_PRIV    = Deno.env.get('VAPID_PRIVATE_KEY')   ?? ''
const VAPID_SUBJECT = 'mailto:koksum@yahoo.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Build morning summary text ────────────────────────────────
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
    meeting:'🗓', task:'✓', flight:'✈️',
    reminder:'⏰', event:'🎉', birthday:'🎂',
  }

  const lines = items.slice(0, 4).map((e: any) => {
    const t = e.time ? ` ${e.time.slice(0,5)}` : ''
    return `${emoji[e.type] || '·'}${t} ${e.title}`
  })
  const more = items.length > 4 ? `\n+${items.length - 4} more` : ''

  return {
    title: `Kizuna 絆 · Good morning, ${name} ☀️`,
    body:  `${items.length} item${items.length !== 1 ? 's' : ''} today\n${lines.join('\n')}${more}`,
  }
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!VAPID_PUB || !VAPID_PRIV) {
    console.error('VAPID keys not set')
    return json({ error: 'VAPID keys not configured' }, 500)
  }

  // Configure web-push with VAPID details
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUB, VAPID_PRIV)

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  // Load all push subscriptions
  const { data: subs, error: subErr } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, display_name')

  if (subErr) {
    console.error('DB error:', subErr.message)
    return json({ error: subErr.message }, 500)
  }

  if (!subs || subs.length === 0) {
    console.log('No subscriptions found')
    return json({ sent: 0, message: 'No subscriptions' })
  }

  console.log(`Found ${subs.length} subscription(s)`)
  const results = []

  for (const sub of subs) {
    try {
      // Load entries for this user
      const { data: rows } = await db
        .from('entries').select('data').eq('user_id', sub.user_id)

      const entries = (rows || []).map((r: any) => r.data).filter(Boolean)

      // Get display name from profiles if not stored on sub
      let name = sub.display_name
      if (!name) {
        const { data: profile } = await db
          .from('profiles').select('display_name').eq('id', sub.user_id).single()
        name = profile?.display_name || 'there'
      }

      const { title, body } = buildSummary(name, entries)
      console.log(`Sending to ${name}: ${title}`)

      const payload = JSON.stringify({
        title,
        body,
        tag:  'kizuna-morning',
        url:  '/Kizuna-app/',
      })

      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }

      const res = await webpush.sendNotification(pushSub, payload, {
        TTL: 86400, // valid for 24h
      })

      console.log(`Sent to ${name}: HTTP ${res.statusCode}`)
      results.push({ user: name, status: res.statusCode, ok: true })

    } catch (err: any) {
      const status = err?.statusCode ?? 0
      console.error(`Failed for user ${sub.user_id}:`, err?.body || err?.message || err)

      // 404/410 = expired subscription — remove it
      if (status === 404 || status === 410) {
        console.log(`Removing expired subscription for ${sub.user_id}`)
        await db.from('push_subscriptions')
          .delete().eq('endpoint', sub.endpoint)
      }

      results.push({ user_id: sub.user_id, status, ok: false, error: err?.message })
    }
  }

  const sent = results.filter((r: any) => r.ok).length
  console.log(`Done: ${sent}/${results.length} delivered`)
  return json({ sent, total: results.length, results })
})

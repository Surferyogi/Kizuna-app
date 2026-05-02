// ═══════════════════════════════════════════════════════════════
//  Kizuna 絆 — Daily Quote Edge Function
//
//  Flow:
//  1. PWA calls this function with { prompt, label, isSpecial }
//  2. Function calls Claude API with populated prompt
//  3. Returns { quote, label, isSpecial } to PWA
//  4. PWA caches result in localStorage for the day
//
//  Security:
//  - Requires valid Supabase JWT (deployed WITH jwt verification)
//  - ANTHROPIC_API_KEY stored in Supabase Vault — never in browser
//  - Rate limited to 5 calls per user per 10 minutes
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// In-memory rate limiter — 5 calls per userId per 10 minutes
const callLog = new Map<string, number[]>()
const RATE_LIMIT = 5
const RATE_WINDOW = 10 * 60 * 1000

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const calls = (callLog.get(userId) || []).filter(t => now - t < RATE_WINDOW)
  if (calls.length >= RATE_LIMIT) return true
  callLog.set(userId, [...calls, now])
  return false
}

const SYSTEM_PROMPT = `You are a warm, emotionally intelligent quote writer for a personal life companion app used by a family. Generate a single original uplifting quote based on the context provided. 2–3 sentences maximum. Return the quote text only — no title, no attribution, no explanation, no quotation marks. Never use the words 'NLP', 'Neuro-Linguistic Programming', 'Hypnotherapy', or 'Hypnosis' anywhere — not even indirectly. Express all themes through feeling, metaphor, and outcome only.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // ── Auth — extract userId from JWT ────────────────────────────
  let userId = 'anonymous'
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (token) {
      // Decode JWT payload (base64) — no need to verify, Supabase gateway does that
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.sub || 'anonymous'
    }
  } catch { /* use anonymous */ }

  // ── Rate limit ─────────────────────────────────────────────────
  if (isRateLimited(userId)) {
    return json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
  }

  // ── Validate request ───────────────────────────────────────────
  let body: { prompt?: string; label?: string; isSpecial?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const { prompt, label, isSpecial } = body
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return json({ error: 'prompt is required.' }, 400)
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set')
    return json({ error: 'Service not configured.' }, 500)
  }

  // ── Call Claude API ────────────────────────────────────────────
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 200,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt.trim() }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Anthropic API error:', res.status, err)
      return json({ error: 'Quote generation failed.' }, 502)
    }

    const data = await res.json()
    const quote = data?.content?.[0]?.text?.trim()

    if (!quote) {
      console.error('Empty response from Anthropic:', JSON.stringify(data))
      return json({ error: 'Empty response from quote service.' }, 502)
    }

    return json({ quote, label: label || '', isSpecial: isSpecial || false })

  } catch (err) {
    console.error('kizuna-quote unhandled error:', err)
    return json({ error: 'Internal server error.' }, 500)
  }
})

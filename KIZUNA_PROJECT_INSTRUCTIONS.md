# Kizuna 絆 — Claude Project Instructions

> Paste this entire file as the **Project Instructions** in your Kizuna Claude Project.
> Also upload `Kizuna.md` (from the GitHub repo root) as a Project File for full schema/component detail.

---

## 1. PROJECT IDENTITY

- **App name:** Kizuna 絆 — mobile-first executive productivity PWA
- **Tagline:** Bonding with trust, loyalty & love — nurturing the invisible thread that connects hearts across time and distance
- **Live URL:** https://surferyogi.github.io/Kizuna-app/
- **GitHub repo:** https://github.com/Surferyogi/Kizuna-app (repo name is case-sensitive: `Kizuna-app`)
- **Supabase project ref:** `xsbohyvvghhztknikpyf`
- **Supabase dashboard:** https://supabase.com/dashboard/project/xsbohyvvghhztknikpyf
- **Primary user:** Koksum (admin/owner)
- **Email domain:** kizunaapp.com (email-only — no website hosted here)

---

## 2. TECH STACK

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 18 + Vite | Build tooling, HMR, PWA plugin |
| Styles | Inline JS only | No CSS files, no framework, no Tailwind, no MUI, no Radix |
| Routing | Single `useState('home')` | No router library — tab state only |
| State | Props down / callbacks up | No Redux, no Zustand, no Context |
| Database | Supabase (PostgreSQL) | Auth + realtime + RLS + edge functions |
| Auth | Supabase OTP (8-digit code) | Passwordless — email magic code |
| Edge Functions | Supabase (Deno/TypeScript) | `flight-status` function |
| Email | Resend + Amazon SES | SMTP via `kizunaapp.com` domain |
| Hosting | GitHub Pages + GitHub Actions | Auto-deploy on push to main |
| PWA | vite-plugin-pwa | Installable from Safari on iPhone |
| TypeScript | Edge Functions `.ts` only | Never used inside `.jsx` files |

---

## 3. FILE STRUCTURE

```
kizuna-app/
├── src/
│   ├── App.jsx          ← Entire frontend (single-file architecture)
│   └── index.html       ← PWA shell, Babel standalone, window.onerror handler
├── supabase/
│   └── functions/
│       └── flight-status/
│           └── index.ts ← Edge Function (Deno)
├── public/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── master_schema.sql    ← Full DB schema — run once in Supabase SQL Editor
├── vite.config.js       ← base MUST be '/Kizuna-app/' (case-sensitive)
├── package.json
└── Kizuna.md            ← Full project reference doc
```

---

## 4. SUPABASE DATABASE TABLES

| Table | Purpose |
|---|---|
| `entries` | All user entries (meeting, flight, task, reminder, event) stored as JSONB |
| `audit_log` | Immutable action history per entry |
| `profiles` | User display names |
| `flight_cache` | Cached flight status API responses |
| `workspaces` | Team workspaces (one per user, auto-created on signup) |
| `workspace_members` | Membership rows linking users to workspaces |
| `workspace_invites` | Pending email invites |

**RLS policy:** `entries` uses `SECURITY DEFINER` function. Own entries always visible. Workspace members can read entries where `data->>'visibility' = 'shared'`. Only entry owner can write/delete. `toggleDone` must only operate on own entries — never a teammate's shared entry.

---

## 5. AUTHENTICATION

- **Method:** Supabase OTP — 8-digit numeric code
- **Email template:** Must be set to `{{ .Token }}` (not the default magic link)
- **Supabase Site URL:** `https://surferyogi.github.io/Kizuna-app/`
- **Session persistence:** Uses `localStorage` — required for iOS PWA (Safari wipes sessionStorage)
- **DEV_BYPASS flag:** `DEV_BYPASS = false` in App.jsx for production; `true` only during local dev to skip OTP
- **Email rate limit:** Supabase built-in SMTP = 2 emails/hour max. Solution: use Resend SMTP configured in Supabase Auth settings

---

## 6. SECRETS & ENVIRONMENT VARIABLES

**GitHub Repository Secrets (for Actions/build):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Supabase Edge Function Secrets:**
- `AVIATIONSTACK_KEY`
- `RAPIDAPI_KEY`
- `SERVICE_ROLE_KEY`

---

## 7. DESIGN TOKENS — MUST ALWAYS USE, NEVER HARDCODE

```js
const C = {
  bg:      '#F8F5F1',   // warm cream parchment — page background
  card:    '#FFFEFB',   // near-white — card surfaces
  elevated:'#F2EDE7',   // warm ecru — inputs, chips
  border:  '#EAE2D8',   // whisper-thin warm beige
  muted:   '#C8BFB5',   // soft taupe — disabled, placeholders
  text:    '#2E2A26',   // warm charcoal — primary text (never harsh black)
  dim:     '#8C8279',   // warm mid-brown — secondary text
  rose:    '#C4826E',   // terracotta rose — primary accent
  roseL:   '#EAB8AC',   // light terracotta — hover/ghost states
  // Entry type colours (colour-blind safe)
  M:       '#7BAAC8',   // dusty sky blue   — meetings
  F:       '#E8A882',   // warm peach        — flights
  T:       '#85B898',   // sage green        — tasks
  R:       '#C8AD82',   // warm sand         — reminders
  E:       '#B09AC0',   // soft lavender     — events
};
// Aliases: C.gold = C.rose, C.goldL = C.roseL (backwards compat — keep them)
```

**Entry type maps:**
```js
const TC = { meeting:C.M, flight:C.F, task:C.T, reminder:C.R, event:C.E };
const TI = { meeting:'◯', flight:'◇', task:'□', reminder:'◷', event:'◈' };
const TL = { meeting:'Meeting', flight:'Flight', task:'Task', reminder:'Reminder', event:'Event' };
```

**Border radius tokens (`BR.*`)** — always use these, never hardcode pixel values.

---

## 8. CODING RULES — NON-NEGOTIABLE

### React Rules
```js
// ✅ Define ALL components at MODULE level — never inside a render function
function ECard({ entry }) { ... }           // ← correct: outside parent
function HomeTab({ entries, onAdd }) { ... } // ← correct: module level

// ❌ NEVER do this — causes remount on every render + cursor jump bugs
function App() {
  const ECard = () => <div/>;  // WRONG
  return <ECard />;
}

// ✅ useMemo for derived/filtered lists
const todayEntries = useMemo(() => entries.filter(...), [entries]);

// ✅ useCallback for functions passed as props
const handleAdd = useCallback((data) => { ... }, [deps]);

// ✅ useRef for mutable values that must NOT trigger re-renders
const loadingRef = useRef(false);
```

### State & Props Rules
```js
// ✅ State is LOCAL to the component that owns it
// ✅ Child components CANNOT access parent state — must be passed as props
// ✅ Always trace the full prop chain when a child needs parent state

// Example — syncStatus defined in App must be passed down explicitly:
// <HomeTab ... syncStatus={syncStatus} />   ← correct
// <HomeTab ... />  then using syncStatus in HomeTab  ← ReferenceError crash
```

### Inline Style Rules
```js
// ✅ Always use design tokens
style={{ background: C.card, borderRadius: BR.input, color: C.text }}

// ❌ Never hardcode colours or radii
style={{ background: '#FFFEFB', borderRadius: 14 }}

// ✅ Spread base styles + override
style={{ ...inputBase, border: `1.5px solid ${C.F}60` }}

// ✅ Conditional styles inline
style={{ color: isActive ? C.rose : C.dim }}
```

### No External Libraries
- No TypeScript in `.jsx` — TypeScript only in Edge Function `.ts` files
- No CSS files — all styles inline
- No Tailwind, MUI, Radix, or any UI library
- No router (react-router etc.) — tab state = single `useState`
- No Redux, Zustand, or Context for state — props down, callbacks up

---

## 9. KNOWN BUGS & THEIR FIXES (DO NOT REPEAT THESE)

| Bug | Root Cause | Fix |
|---|---|---|
| `Can't find variable: syncStatus` | State defined in App used in child without prop | Always pass state as explicit prop |
| `Unterminated regular expression` at Vite build | JSX element (`<CalIcon/>`) placed inside a module-level array constant | Move JSX rendering inside component functions, never in module-level arrays |
| SVG `<text>` causes Rollup parse failure | Rollup misreads `<text>` tag as regex start | Replace SVG `<text>` with absolutely-positioned HTML `<span>` |
| GitHub Pages 404 after deploy | `base: '/kizuna-app/'` — wrong case vs actual repo `Kizuna-app` | `vite.config.js` base must be `'/Kizuna-app/'` exactly |
| `col:C.red` not assigning | Colon (`:`) used in function body — valid object syntax but not assignment | Use `col = C.red` (equals sign) for assignments inside functions |
| Same build error line persists after fix | Old file still on GitHub — local fix not uploaded | Always verify the GitHub file was actually updated; check file size or grep for the change |
| Supabase `supabase link` — "operation not permitted" on `.temp` | macOS immutable flag on `.temp` folder | `sudo rm -rf supabase/.temp` then relink; or work from a copied directory |
| `dbLoadEntries` — shared entries not loading | Wrong Supabase JS JSONB filter syntax `.eq('data->>visibility', ...)` | Let RLS do the filtering — select all entries without explicit user_id filter; RLS returns exactly what's allowed |
| `toggleDone` writes entry under wrong user | Writing to `user.id` (current user) instead of entry owner | Guard: only toggle own entries; shared teammate entries are read-only |
| Email OTP rate limit (2/hour) | Supabase built-in SMTP limit | Configure Resend as custom SMTP in Supabase Auth settings |

---

## 10. VITE CONFIG — EXACT PRODUCTION VALUES

```js
// vite.config.js — do not change base, scope, or start_url
base: '/Kizuna-app/',   // case-sensitive — matches GitHub repo name exactly
scope:     '/Kizuna-app/',
start_url: '/Kizuna-app/',
```

---

## 11. EDGE FUNCTION DEPLOYMENT

```bash
# Always deploy with --no-verify-jwt (app calls it without user JWT)
supabase functions deploy flight-status --no-verify-jwt
```

---

## 12. GOING LIVE CHECKLIST

- [ ] `DEV_BYPASS = false` in `App.jsx`
- [ ] Supabase email template set to `{{ .Token }}` (8-digit code)
- [ ] Supabase Site URL = `https://surferyogi.github.io/Kizuna-app/`
- [ ] GitHub Secrets set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Supabase secrets set: `AVIATIONSTACK_KEY`, `RAPIDAPI_KEY`, `SERVICE_ROLE_KEY`
- [ ] `master_schema.sql` run in Supabase SQL Editor
- [ ] Edge Function deployed: `supabase functions deploy flight-status --no-verify-jwt`
- [ ] Resend SMTP configured in Supabase Auth (not built-in SMTP)
- [ ] Test OTP flow on iPhone Safari
- [ ] Install as PWA: Safari → Share → Add to Home Screen

---

## 13. DEVELOPMENT WORKFLOW RULES (FOR CLAUDE)

1. **Before writing any code:** outline the plan in bullet points and wait for explicit confirmation
2. **Surgical precision:** only modify the exact function/component asked — do not refactor, rename, or restructure anything else
3. **Preserve all past improvements:** every fix must carry forward all previous lessons learned and bug fixes
4. **Verify prop chains:** when adding a new value to a child component, trace that value from where it's defined (usually App state) all the way down through every intermediate component
5. **Build verification:** after any JSX change, mentally check — is any JSX inside a module-level array or object? If yes, move it into a component
6. **File upload verification:** after providing a fixed file, remind the user to confirm the new file was actually committed to GitHub (same error line = old file still there)
7. **No hallucinated values:** if a hex colour, API key, table name, or credential is not confirmed from the codebase, state it is not available rather than inventing it

---

*Kizuna 絆 — built with care, designed for trust.*

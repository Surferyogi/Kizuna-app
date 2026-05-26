# Kizuna 絆 — Complete App Reference & Developer Instructions

> Personal life coordination PWA for Koksum & Sophia.
> **Live:** https://surferyogi.github.io/Kizuna-app/ · **Repo:** https://github.com/Surferyogi/Kizuna-app
> **Stack:** React 18 · Vite 5 · Supabase (Singapore ap-southeast-1) · GitHub Pages · PWA

---

## 1. Users & Access

| User | Email | UUID | Role |
|---|---|---|---|
| Koksum | koksum@yahoo.com | `178529e4-ad5d-48ac-a5dc-90895314817b` | Admin / Workspace Owner |
| Sophia | sophiachenyq@gmail.com | `228febb2-fd52-4a26-bb29-0eec10e270dd` | Member |

**Workspace ID:** `091ddb7a`
**Supabase project:** `xsbohyvvghhztknikpyf` (Singapore region)

---

## 2. Architecture

```
src/App.jsx                    (~11000+ lines — entire app)
src/components/FestiveFireworks.jsx
public/push-handler.js
supabase/functions/kizuna-auth / kizuna-notify / kizuna-quote
```

### React Contexts
| Context | Value | Purpose |
|---|---|---|
| `ThemeContext` | `C_LIGHT` or `C_DARK` | Colour tokens |
| `WorkspaceContext` | `workspace.members[]` | Resolve traveller UUIDs — hoisted at ECard top |

---

## 3. Deployment

### Standard Deploy
```bash
cd ~/Downloads/kizuna-git
cp ~/Downloads/App.jsx src/App.jsx
wc -l src/App.jsx        # verify ~11000+ lines
git add src/App.jsx
git commit -m "Description"
git push
```

### Recovery from corruption
```bash
cd ~/Downloads
git clone https://github.com/Surferyogi/Kizuna-app.git kizuna-git
cd kizuna-git
git checkout <last_good_sha> -- src/App.jsx
wc -l src/App.jsx
```

### Three.js dependency (for Kodomo no Hi)
`index.html` must include before `</head>`:
```html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
```

---

## 4. Flight System

### Display Rules
| Scenario | Collapsed card | Detail panel |
|---|---|---|
| Owner flies, entered by owner | `✈ Name` only | Travellers: Name |
| Others fly, owner entered | `✈ PARENTS` | Travellers: PARENTS · Entered by: Owner |
| Legacy entry (no traveller field) | `✈ Owner` (implicit) | Travellers: Owner |

- `Entered by` shown in **detail only** (not on collapsed card)
- `travellerNamesMap` stores only explicitly selected travellers — self NOT auto-inserted

### Traveller Name Resolution Priority
1. `travellerNamesMap[uuid]` — stored at save
2. `e.userName` — for entry owner
3. `WorkspaceContext.find(m=>m.id===uuid)?.name` — fallback
4. Legacy (`traveller:''`, `travellers:null`) → show `e.userName` as implicit traveller

---

## 5. Home Tab

### What's excluded from all Home views
- `e.cancelled` entries — filtered everywhere
- Past-dated tasks (`date+T23:59 < now`) — hidden from Open Tasks + default view
- Landed flights (`liveLabel` contains 'land'/'arriv' OR `date < today`) — hidden from Next Flight

### Filter cards
| Card | Logic |
|---|---|
| Open Tasks | `type=task && !done && !cancelled && !(date < today)` |
| Next 48h | `d >= now && d <= now+48h && type≠task && !cancelled` |
| Next Flight | `type=flight && !cancelled && date >= today && not landed` |

---

## 6. Activity Icons (auto-matched from entry title)

### Special person icons (secondary, shown alongside activity icon)
- `anna` in title → 💕
- `sophia` in title → ❤️

### Key mappings
| Keywords | Icon |
|---|---|
| hair, haircut, salon, barber, lash, eyelash | 💈 / 👱‍♀️ |
| blood, blood test | ⛑️ |
| market, wet market, hawker | 🐟 |
| collect, pickup, fetch, receive | 🙌 |
| glasses, spectacles, optical | 🤓 |
| meeting, appt, appointment, catchup | 👥 |
| claim, renew, reimburs | 📃 |
| apply, submit, send, email | 📨 |
| build, create, design, develop | 👷‍♀️ |
| birthday, bday | 🎂 |
| pay, wallet, bank, money, cash | 💰 |
| train, mrt, subway, metro | 🚂 |
| bus, coach, shuttle | 🚌 |
| taxi, grab, uber | 🚕 |
| ship, boat, ferry, cruise | 🚢 |
| No match (AI fallback) | 🔸 |

AI fallback: calls Claude API with entry title, caches result in `localStorage`.

---

## 7. Search Tab — 3-Dimensional Filter

**WHEN** (8): All Time · Today · This Week · This Month · After This Month · Last Week · Last Month · Before Last Month

**WHAT** (7): All · Appt · Task · Flight · Reminder · Event · Birthday

**STATUS** (3): All · Active (upcoming) · Done/Landed/Past

`isVisuallyDone(e)` — time-aware, mirrors ECard strikethrough exactly. Cancelled = own state (not done/active).

---

## 8. Public Holidays (2026–2035)

**351 entries total:** 🇸🇬 Singapore (135) · 🇯🇵 Japan (161) · 🇫🇷 France (55)

Verified sources: MOM.gov.sg (SG 2026), singaporeholiday.com.sg (SG 2027-28), publicholidays.jp, computed Easter.

### Key SG corrections applied
| Year | Holiday | Correct date |
|---|---|---|
| 2026 | Deepavali | Nov 8 (Sun) + in lieu Nov 9 |
| 2026 | National Day | Aug 9 (Sun) + in lieu Aug 10 |
| 2027 | Hari Raya Haji | May 17 |
| 2027 | CNY | Feb 6-7 (both weekend → in lieu Mon+Tue) |
| 2028 | CNY | Jan 26-27 |
| 2028 | Hari Raya Haji | May 5 |
| 2028 | Deepavali | Oct 17 |

### JP corrections applied
- Emperor's Birthday (Feb 23) — **added all 10 years** (was completely missing)
- Marine Day 2030 — **Jul 15** (was wrongly May 15)
- Children's Day (May 5) — added all years
- New Year's Day (Jan 1) — added all years
- Silver Week 2026 Sep 22 Citizens' Holiday — added

### FR corrections applied
- Jour de l'An (Jan 1) — added all years (was missing)

---

## 9. Special Occasion Screens

### Priority order
```
isKodomo → isSeijin → isOtsukimi → isChristmas → special occasions → seasonal
```

### Kodomo no Hi (🎏 dev button) — Three.js scene
Full 5-phase Three.js scene requires:
```html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
```
in `index.html`.

**Scene contents:**
- 2 poles (x=−1.3 and x=+1.6) with yaguruma (spinning wheels) + gold finial
- 5 koinobori: magoi (black) · higoi (red) · ai-goi (blue) · midori-goi (green) · orenji-goi (orange)
- Each carp: 14-ring×28-seg deformable BufferGeometry, canvas scale texture, MeshPhysicalMaterial sheen, eye texture, barbels
- Wind: 3-octave fbm + gust envelope + direction shifts every ~14s with lull
- Sky: vertex-colour gradient plane (deep blue → pale blue)
- 14 medium 3D clouds across 3 depth layers, drifting at different speeds
- Ground plane (Lambert green)
- Phase 5: organic camera drift ±0.5u over ~116s

### Seijin no Hi (👘 dev button)
Canvas scene: torii gate, stone lanterns, stone courtyard, 10 figures (6 women in furisode + 4 men in suit/hakama), asanoha pattern, falling sakura petals.

### Other occasions
| Trigger keyword | Background |
|---|---|
| `otsukimi` / `mid-autumn` | Canvas: moon, rabbit, susuki grass, 210 stars |
| `christmas` / Dec 25 | Winter night sky: 280 stars, North Star, shooting stars |
| `anniversary` | Rose petals, gold bokeh |
| `mother` | 28 bouncing carnations |
| `father` | 14 paper planes |
| `birthday` | Balloons, confetti, sparkles |

---

## 10. Calendar Flags

- 🌍 toggle in CalendarTab header, persisted in `localStorage['kizuna_cal_flags']`
- `calLocationMap` memoized with `[userLocations, expandedEntries, user?.id]` — each user sees only **their own** country flags
- Back-fill uses *departure* country of first flight (not arrival)

---

## 11. Version

`APP_VERSION = 'v2026.05.23-17:00'` — shown in Settings, format `vyyyy.mm.dd-hh:mm`

---

## 12. Key Lessons & Gotchas

| Issue | Solution |
|---|---|
| App.jsx corrupted | `git clone` → `git checkout <sha> -- src/App.jsx` |
| `transmission:>0` on MeshPhysicalMaterial | Causes black screen in standalone — omit or use separate render pass |
| `ACESFilmicToneMapping` + `SRGBColorSpace` | Causes black screen if not set up carefully — safer to omit in standalone files |
| `travellerNamesMap` self-insert bug | Fixed: only selected travellers stored, not owner auto-added |
| Entered by shown when owner IS traveller | Fixed: only show when owner NOT in travellers list |
| Past flights in Home tab | Fixed: exclude if `date < today` OR liveLabel contains 'land' |
| Past tasks in Home tab | Fixed: exclude if `date+T23:59 < now` |
| Duplicate PUBLIC_HOLIDAYS | Old block left after replacement — search for 2nd `const PUBLIC_HOLIDAYS` |
| Three.js + React | Use `useRef` for canvas, `useEffect` for scene init, return cleanup cancels RAF |
| Cloud shader black | Use `MeshBasicMaterial` not `MeshStandardMaterial` for clouds — always white |

---

*Last updated: May 2026*
*Session: Kodomo no Hi Three.js (5 phases) · Seijin no Hi L99 · holiday corrections (351 entries) · flight display (Travellers vs Entered by) · Home tab past-item filtering · activity icons · two-pole layout · camera drift*

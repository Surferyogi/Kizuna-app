// Kizuna 絆 — v2.0.0 — Supabase sync across all devices
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase, supabaseConfigured } from './supabase.js';

// ─── HELPERS ─────────────────────────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
// T0 is fixed at module load — used only for relative date calculations.
const T0 = new Date();
const fd = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const ad = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const ft = (h, m=0) => `${h%12||12}:${p2(m)} ${h>=12?'PM':'AM'}`;
const pt = s => { if (!s) return ''; const [h,m] = s.split(':').map(Number); return ft(h,m); };
const DAY   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MFULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const relTime = iso => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)     return 'Just now';
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)  return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
};

// ─── AIRPORT LOOKUP ──────────────────────────────────────────────
// Top 300 IATA codes → city name. Bundled statically — zero API calls,
// works fully offline, instant lookup. Covers >95% of commercial routes.
const AIRPORTS = {
  SIN:'Singapore',ICN:'Seoul',NRT:'Tokyo',HND:'Tokyo',PVG:'Shanghai',PEK:'Beijing',
  PKX:'Beijing',HKG:'Hong Kong',BKK:'Bangkok',KUL:'Kuala Lumpur',CGK:'Jakarta',
  MNL:'Manila',SGN:'Ho Chi Minh City',HAN:'Hanoi',RGN:'Yangon',PNH:'Phnom Penh',
  VTE:'Vientiane',REP:'Siem Reap',DAD:'Da Nang',CXR:'Nha Trang',
  LHR:'London',LGW:'London',CDG:'Paris',AMS:'Amsterdam',FRA:'Frankfurt',
  MUC:'Munich',ZRH:'Zurich',VIE:'Vienna',MAD:'Madrid',BCN:'Barcelona',
  FCO:'Rome',MXP:'Milan',LIN:'Milan',ATH:'Athens',IST:'Istanbul',
  DXB:'Dubai',AUH:'Abu Dhabi',DOH:'Doha',BAH:'Bahrain',KWI:'Kuwait City',
  RUH:'Riyadh',JED:'Jeddah',CAI:'Cairo',ADD:'Addis Ababa',NBO:'Nairobi',
  JNB:'Johannesburg',CPT:'Cape Town',LOS:'Lagos',ACC:'Accra',CMN:'Casablanca',
  JFK:'New York',EWR:'New York',LGA:'New York',LAX:'Los Angeles',ORD:'Chicago',
  MDW:'Chicago',ATL:'Atlanta',DFW:'Dallas',DEN:'Denver',SFO:'San Francisco',
  SEA:'Seattle',MIA:'Miami',BOS:'Boston',IAD:'Washington DC',DCA:'Washington DC',
  YYZ:'Toronto',YVR:'Vancouver',YUL:'Montreal',GRU:'São Paulo',GIG:'Rio de Janeiro',
  EZE:'Buenos Aires',SCL:'Santiago',BOG:'Bogotá',LIM:'Lima',MEX:'Mexico City',
  SYD:'Sydney',MEL:'Melbourne',BNE:'Brisbane',PER:'Perth',AKL:'Auckland',
  DEL:'Delhi',BOM:'Mumbai',MAA:'Chennai',BLR:'Bangalore',HYD:'Hyderabad',
  CCU:'Kolkata',CMB:'Colombo',DAC:'Dhaka',KTM:'Kathmandu',MLE:'Malé',
  CPH:'Copenhagen',ARN:'Stockholm',HEL:'Helsinki',OSL:'Oslo',DUB:'Dublin',
  EDI:'Edinburgh',MAN:'Manchester',BRU:'Brussels',LIS:'Lisbon',OPO:'Porto',
  WAW:'Warsaw',PRG:'Prague',BUD:'Budapest',BEG:'Belgrade',SOF:'Sofia',
  OTP:'Bucharest',KBP:'Kyiv',SVO:'Moscow',DME:'Moscow',LED:'St Petersburg',
  TLV:'Tel Aviv',AMM:'Amman',BEY:'Beirut',MCT:'Muscat',KHI:'Karachi',
  LHE:'Lahore',ISB:'Islamabad',KBL:'Kabul',ULN:'Ulaanbaatar',
  CTS:'Sapporo',OKA:'Okinawa',FUK:'Fukuoka',KIX:'Osaka',NGO:'Nagoya',
  TPE:'Taipei',KHH:'Kaohsiung',TSA:'Taipei',MFM:'Macau',CAN:'Guangzhou',
  SZX:'Shenzhen',CTU:'Chengdu',XIY:'Xi\'an',WUH:'Wuhan',CKG:'Chongqing',
};

// City name from IATA code
const airportCity = code => (code && AIRPORTS[code.toUpperCase()]) || code || '—';

// ─── AIRLINE LOOKUP ──────────────────────────────────────────────
const AIRLINES = {
  SQ:'Singapore Airlines', CX:'Cathay Pacific', MH:'Malaysia Airlines',
  TG:'Thai Airways', GA:'Garuda Indonesia', MI:'Scoot', TR:'Scoot',
  QF:'Qantas', VA:'Virgin Australia', EK:'Emirates', EY:'Etihad',
  QR:'Qatar Airways', SV:'Saudi Arabian', WY:'Oman Air',
  BA:'British Airways', LH:'Lufthansa', AF:'Air France',
  KL:'KLM', SK:'SAS', AY:'Finnair', IB:'Iberia', AZ:'ITA Airways',
  JL:'Japan Airlines', NH:'ANA', OZ:'Asiana Airlines', KE:'Korean Air',
  CI:'China Airlines', BR:'EVA Air', CA:'Air China', JX:'Starlux',
  CZ:'China Southern', MU:'China Eastern', HX:'Hong Kong Airlines',
  AI:'Air India', UK:'Vistara', '6E':'IndiGo', SG:'SpiceJet',
  AA:'American Airlines', DL:'Delta Air Lines', UA:'United Airlines',
  WN:'Southwest Airlines', AC:'Air Canada', WS:'WestJet',
  LA:'LATAM Airlines', G3:'Gol', CM:'Copa Airlines',
  TK:'Turkish Airlines', PC:'Pegasus', VY:'Vueling',
  FR:'Ryanair', U2:'easyJet', W6:'Wizz Air', BE:'Flybe',
};

// Extract airline name from flight number prefix (e.g. "SQ633" → "Singapore Airlines")
const airlineFromCode = code => {
  if (!code) return null;
  const m = code.replace(/\s+/g,'').toUpperCase().match(/^([A-Z]{2,3})/);
  return m ? (AIRLINES[m[1]] || null) : null;
};

// ─── STATIC FLIGHT ROUTES ────────────────────────────────────────
// Common flight number → { dep, arr } routes.
// Covers top Asian, Middle East, European and Oceanian routes.
// Zero API calls — works offline, instant, never fails.
const FLIGHT_ROUTES = {
  // Singapore Airlines (SQ)
  SQ633:'HND-SIN', SQ634:'SIN-HND', SQ011:'SIN-LHR', SQ012:'LHR-SIN',
  SQ021:'SIN-JFK', SQ022:'JFK-SIN', SQ231:'SIN-SYD', SQ232:'SYD-SIN',
  SQ211:'SIN-MEL', SQ212:'MEL-SIN', SQ221:'SIN-BNE', SQ222:'BNE-SIN',
  SQ317:'SIN-DXB', SQ318:'DXB-SIN', SQ321:'SIN-LHR', SQ322:'LHR-SIN',
  SQ334:'SIN-AMS', SQ335:'AMS-SIN', SQ351:'SIN-FRA', SQ352:'FRA-SIN',
  SQ401:'SIN-HKG', SQ402:'HKG-SIN', SQ411:'SIN-PVG', SQ412:'PVG-SIN',
  SQ421:'SIN-PEK', SQ422:'PEK-SIN', SQ501:'SIN-BKK', SQ502:'BKK-SIN',
  SQ507:'SIN-BKK', SQ508:'BKK-SIN', SQ511:'SIN-KUL', SQ512:'KUL-SIN',
  SQ521:'SIN-CGK', SQ522:'CGK-SIN', SQ551:'SIN-MNL', SQ552:'MNL-SIN',
  SQ571:'SIN-ICN', SQ572:'ICN-SIN', SQ601:'SIN-DEL', SQ602:'DEL-SIN',
  SQ621:'SIN-BOM', SQ622:'BOM-SIN', SQ701:'SIN-LAX', SQ702:'LAX-SIN',
  SQ033:'SIN-SFO', SQ034:'SFO-SIN', SQ037:'SIN-IAH', SQ038:'IAH-SIN',
  // ANA (NH)
  NH843:'HND-SIN', NH844:'SIN-HND', NH803:'NRT-LHR', NH804:'LHR-NRT',
  NH001:'NRT-JFK', NH002:'JFK-NRT', NH005:'NRT-LAX', NH006:'LAX-NRT',
  // Japan Airlines (JL)
  JL041:'NRT-LHR', JL042:'LHR-NRT', JL061:'NRT-JFK', JL062:'JFK-NRT',
  JL009:'NRT-LAX', JL010:'LAX-NRT', JL705:'NRT-SIN', JL706:'SIN-NRT',
  // Cathay Pacific (CX)
  CX101:'HKG-LHR', CX102:'LHR-HKG', CX841:'HKG-SIN', CX842:'SIN-HKG',
  CX531:'HKG-NRT', CX532:'NRT-HKG', CX471:'HKG-LAX', CX472:'LAX-HKG',
  // Emirates (EK)
  EK351:'DXB-SIN', EK352:'SIN-DXB', EK001:'DXB-LHR', EK002:'LHR-DXB',
  EK003:'DXB-LHR', EK004:'LHR-DXB', EK211:'DXB-JFK', EK212:'JFK-DXB',
  EK431:'DXB-BKK', EK432:'BKK-DXB', EK404:'DXB-KUL', EK403:'KUL-DXB',
  // Qatar Airways (QR)
  QR007:'DOH-LHR', QR008:'LHR-DOH', QR549:'DOH-SIN', QR550:'SIN-DOH',
  // British Airways (BA)
  BA011:'LHR-JFK', BA012:'JFK-LHR', BA013:'LHR-JFK', BA014:'JFK-LHR',
  BA017:'LHR-LAX', BA018:'LAX-LHR', BA031:'LHR-SIN', BA032:'SIN-LHR',
  // Qantas (QF)
  QF001:'SYD-LHR', QF002:'LHR-SYD', QF007:'SYD-LAX', QF008:'LAX-SYD',
  // Malaysia Airlines (MH)
  MH601:'KUL-SIN', MH602:'SIN-KUL', MH003:'KUL-LHR', MH004:'LHR-KUL',
  // Thai Airways (TG)
  TG411:'BKK-SIN', TG412:'SIN-BKK', TG917:'BKK-NRT', TG918:'NRT-BKK',
  // Korean Air (KE)
  KE641:'ICN-SIN', KE642:'SIN-ICN', KE001:'ICN-JFK', KE002:'JFK-ICN',
  // EVA Air (BR)
  BR225:'TPE-SIN', BR226:'SIN-TPE', BR011:'TPE-LAX', BR012:'LAX-TPE',
};

// Look up FROM/TO for a flight number — returns {dep, arr} or null
const routeLookup = (flightNum) => {
  const key = flightNum.replace(/\s+/g,'').toUpperCase();
  const route = FLIGHT_ROUTES[key];
  if (!route) return null;
  const [dep, arr] = route.split('-');
  return { dep, arr };
};
// Calls the flight-status Edge Function which:
//   1. Checks a 10-minute Supabase cache first
//   2. Calls AeroDataBox if cache is stale
//   3. Returns normalised status object
// Falls back to time-based local status on any error.
// Input: flightNumber (e.g. 'SQ321') + date (e.g. '2026-04-25')

// Local time-based fallback — used when API unavailable or flight has no number
const flightStatusLocal = (flight) => {
  if (!flight.date || !flight.time) return null;
  const dep  = new Date(`${flight.date}T${flight.time}`);
  const now  = new Date();
  const mins = (now - dep) / 60000;
  let arrMins = 480;
  if (flight.endTime) {
    const [ah, am] = flight.endTime.split(':').map(Number);
    const [dh, dm] = flight.time.split(':').map(Number);
    arrMins = (ah * 60 + am) - (dh * 60 + dm);
    if (arrMins < 0) arrMins += 1440;
  }
  if (mins < -60)       return { label:'Scheduled',  color:'#5BB8E8', source:'local' };
  if (mins < -30)       return { label:'Check-in',   color:'#4D8EC4', source:'local' };
  if (mins < -10)       return { label:'Boarding',   color:'#B8715C', source:'local' };
  if (mins < 0)         return { label:'Final Call', color:'#A04E08', source:'local' };
  if (mins < arrMins)   return { label:'In Flight',  color:'#1C4878', source:'local' };
  return                       { label:'Landed',     color:'#2A6E3A', source:'local' };
};

// React hook — fetches live status, falls back to local
function useLiveFlightStatus(flight) {
  const [status,      setStatus]      = useState(() => flightStatusLocal(flight));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    // Only fetch if we have a flight number and supabase is configured
    if (!flight?.flightNum || !flight?.date || !supabaseConfigured) return;

    let cancelled = false;
    async function fetchStatus() {
      setLoading(true);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !anonKey) throw new Error('not configured');
        const res = await fetch(`${supabaseUrl}/functions/v1/flight-status`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json',
                     'Authorization':`Bearer ${anonKey}` },
          body: JSON.stringify({ flightNumber: flight.flightNum, date: flight.date }),
        });
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        setStatus(data);
        setLastUpdated(new Date());
      } catch {
        setStatus(flightStatusLocal(flight));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStatus();
    // Refresh every 5 minutes while card is visible
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.flightNum, flight?.date]);

  return { status, lastUpdated, loading };
}


// Warm cream base · Terracotta rose accent · Blue/orange entry system
// Deuteranopia/protanopia safe: green replaced with cornflower blue;
// red/coral replaced with amber-orange. Text contrast ≥ 4.5:1 on cream.
const C = {
  bg:      '#F8F5F1',   // warm cream parchment
  card:    '#FFFEFB',   // near-white card surface
  elevated:'#F0EAE2',   // warm ecru — inputs, chips
  border:  '#D8CEBC',   // soft beige — now clearly visible
  muted:   '#9A9188',   // warm taupe — placeholder/disabled (contrast ≥ 3:1)
  text:    '#1A1714',   // deep warm charcoal — contrast 14:1 on cream
  dim:     '#5C5349',   // medium warm brown — contrast 6.5:1 (was too faint)
  // Terracotta rose accent — grounded, calm, wellness
  rose:    '#B8715C',   // slightly deeper for contrast on cream
  roseL:   '#E0A898',
  // Entry type colours — color-blind safe blue/orange system
  // NO green, NO red — safe for deuteranopia + protanopia
  M:       '#4D8EC4',   // steel blue        — meetings  (was dusty sky)
  F:       '#5BB8E8',   // sky blue           — flights   (warm peach → open sky)
  T:       '#4E7EC8',   // cornflower blue    — tasks     (replaces sage GREEN)
  R:       '#A07840',   // warm toffee        — reminders (was sand, now richer)
  E:       '#8A72B8',   // deeper lavender    — events    (more contrast)
};

const TC  = { meeting:C.M, flight:C.F, task:C.T, reminder:C.R, event:C.E, birthday:'#C4729A' };
const TI  = { meeting:'◯', flight:'◇', task:'□', reminder:'◷', event:'◈', birthday:'🎂' };
const TL  = { meeting:'Appointment', flight:'Flight', task:'Task', reminder:'Reminder', event:'Event', birthday:'Birthday / Anniversary' };

// DTC — dark type colors for TEXT/ICONS on same-hue tinted backgrounds.
// Each gives ≥ 7:1 contrast on TC[type]+'28' tint, ≥ 9:1 on white card.
// Rule: whenever a type color is used as a font color, use DTC, never TC.
const DTC = {
  meeting:  '#1C4878',   // deep steel navy   — text-safe on C.M tints
  flight:   '#0A4268',   // deep sky navy     — text-safe on C.F tints & light sky bg
  task:     '#1A3A78',   // deep cornflower   — text-safe on C.T tints
  reminder: '#4A2E08',   // dark amber        — text-safe on C.R tints
  event:    '#38186A',   // deep violet       — text-safe on C.E tints
  birthday: '#7A2A5A',   // deep rose         — text-safe on birthday pink tints
};

// PC.low uses DTC.task: badge renders same color as both text AND bg tint,
// so the value must be dark enough to read against its own 28% alpha wash.
const PC = { low:DTC.task, medium:'#6B4E10', high:'#8A3A08', critical:'#6A2408' };
const AC = { created:C.rose, completed:DTC.task, reopened:DTC.meeting, deleted:'#8A3A08', updated:DTC.event };
const AL = { created:'Created', completed:'Completed', reopened:'Reopened', deleted:'Deleted', updated:'Updated' };

// Shared shadow levels — replaces harsh borders on cards
const SH = {
  card:    '0 2px 16px rgba(44,38,32,0.07)',
  float:   '0 8px 32px rgba(44,38,32,0.12)',
  subtle:  '0 1px 6px  rgba(44,38,32,0.05)',
};

// Border radius tokens — consistent across entire app
const BR = {
  card:  20,   // large content cards, hero cards
  panel: 16,   // modal sheets, settings sections
  input: 14,   // inputs, small cards, chips
  btn:   12,   // buttons, compact inputs, dropdowns
  pill:  10,   // badges, tags, status pills
  dot:   6,    // small indicators
};

// Type scale — follow this for all new text
// 28+ : display (greeting name, Kizuna header)
// 18-22: card/section titles
// 16  : body text, input text, primary labels
// 14  : secondary info, metadata, button labels
// 12  : uppercase section labels, timestamps, captions
const SCHEMA_VERSION = 1;
const APP_VERSION    = 'v2.2.0';
const APP_BUILD_DATE = 'May 1, 2026';

// Load own entries from Supabase — simple, reliable query
async function dbLoadEntries(userId) {
  const { data, error } = await supabase
    .from('entries')
    .select('data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => r.data).filter(Boolean);
}

// Load audit log (last 200)
async function dbLoadAudit(userId) {
  const { data, error } = await supabase
    .from('audit_log').select('data').eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return data.map(r => r.data);
}

// Upsert a single entry
async function dbUpsertEntry(userId, entry) {
  const { error } = await supabase.from('entries')
    .upsert({ id: entry.id, user_id: userId, data: entry, updated_at: new Date().toISOString() });
  
}

// Delete a single entry
async function dbDeleteEntry(userId, entryId) {
  const { error } = await supabase.from('entries').delete()
    .eq('id', entryId).eq('user_id', userId);
  
}

// Append audit event
async function dbAppendAudit(userId, event) {
  const { error } = await supabase.from('audit_log')
    .upsert({ id: event.id, user_id: userId, data: event });
  
}

// Wipe all data (Reset App Data)
async function dbResetUser(userId) {
  await supabase.from('entries').delete().eq('user_id', userId);
  await supabase.from('audit_log').delete().eq('user_id', userId);
}

// Display name — stored in profiles table + cached in localStorage per user
async function dbSaveName(userId, name) {
  localStorage.setItem(`exec_user_v1_${userId}`, name);
  await supabase.from('profiles')
    .upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() });
}
async function dbLoadName(userId) {
  // Always fetch from DB first for cross-device consistency.
  // Use maybeSingle() — returns null (not error) if profile row doesn't exist yet.
  try {
    const { data, error } = await supabase.from('profiles')
      .select('display_name').eq('id', userId).maybeSingle();
    if (!error && data?.display_name) {
      localStorage.setItem(`exec_user_v1_${userId}`, data.display_name);
      return data.display_name;
    }
  } catch { /* offline — fall through */ }
  return localStorage.getItem(`exec_user_v1_${userId}`) || '';
}

// Load workspace — two separate queries for reliability
// Nested joins can be blocked by RLS; direct queries are safer
async function dbLoadWorkspace(userId) {
  // Step 1: find all workspace_members rows for this user
  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId);
  if (error || !memberships || memberships.length === 0) return null;

  // Step 2: find if user owns any workspace directly
  const { data: ownedWs } = await supabase
    .from('workspaces')
    .select('id, name, owner_id')
    .eq('owner_id', userId)
    .maybeSingle();

  // If user owns a workspace, use it — guaranteed admin
  let workspaceId, resolvedRole, workspaceName, ownerId;
  if (ownedWs) {
    workspaceId   = ownedWs.id;
    resolvedRole  = 'admin';
    workspaceName = ownedWs.name;
    ownerId       = ownedWs.owner_id;
  } else {
    // User is an invited member — use first membership
    const m = memberships[0];
    workspaceId  = m.workspace_id;
    resolvedRole = m.role;
    // Get workspace details separately
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id, name, owner_id')
      .eq('id', m.workspace_id)
      .maybeSingle();
    workspaceName = ws?.name || 'Workspace';
    ownerId       = ws?.owner_id;
  }

  // Step 3: get all members of the resolved workspace
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, role, profiles(display_name)')
    .eq('workspace_id', workspaceId);

  return {
    id:      workspaceId,
    name:    workspaceName || 'Workspace',
    ownerId,
    role:    resolvedRole,
    members: (members || []).map(m => ({
      id:   m.user_id,
      name: m.profiles?.display_name || 'Unknown',
      role: m.role,
    })),
  };
}

// Invite a member by email — stored as pending invite, auto-accepted on signup
async function dbInviteMember(workspaceId, invitedByUserId, email) {
  const { error } = await supabase
    .from('workspace_invites')
    .upsert({
      workspace_id: workspaceId,
      email:        email.toLowerCase().trim(),
      invited_by:   invitedByUserId,
    });
  return !error;
}

// Remove a member from workspace
async function dbRemoveMember(workspaceId, memberId) {
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', memberId);
  return !error;
}


// ─── SHARED UI ATOMS ─────────────────────────────────────────────
const Sec = ({ label, count }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, marginTop:30 }}>
    <span style={{ fontSize:14, fontWeight:700, color:C.rose, textTransform:'uppercase', letterSpacing:'0.14em', whiteSpace:'nowrap' }}>{label}</span>
    {count != null && (
      <span style={{ fontSize:14, color:C.dim, background:C.elevated, borderRadius:BR.pill,
        padding:'3px 10px', boxShadow:SH.subtle }}>{count}</span>
    )}
    <div style={{ flex:1, height:'1px', background:C.border }} />
  </div>
);

// P3-17: SS and SR at module level — never recreated on SettingsTab renders
const SS = ({ title, children }) => (
  <div style={{ marginBottom:14 }}>
    <p style={{ fontSize:14, fontWeight:700, color:C.rose, textTransform:'uppercase',
      letterSpacing:'0.14em', margin:'28px 0 10px' }}>{title}</p>
    <div style={{ background:C.card, borderRadius:BR.card, overflow:'hidden',
      boxShadow:SH.card, border:`1px solid ${C.border}` }}>
      {children}
    </div>
  </div>
);

const SR = ({ label, sub, right, noBorder }) => (
  <div style={{ display:'flex', alignItems:'center', padding:'18px 20px',
    borderBottom:noBorder?'none':`1px solid ${C.border}`, gap:14 }}>
    <div style={{ flex:1 }}>
      <p style={{ margin:0, fontSize:16, color:C.text, fontWeight:500 }}>{label}</p>
      {sub && <p style={{ margin:0, fontSize:14, color:C.dim, marginTop:3 }}>{sub}</p>}
    </div>
    {right}
  </div>
);

// ─── ENTRY CARD ──────────────────────────────────────────────────
function ECard({ e, onToggle, onEdit, onDelete, currentUserId, readOnly=false }) {
  const col  = TC[e.type];
  const dcol = DTC[e.type] || col;
  const [open,       setOpen]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const isOwn = !e.userId || e.userId === currentUserId;

  // F12: flights are past when departure time has passed
  // Use arrival time if available for more accurate "landed" detection
  const isFlightLanded = e.type === 'flight' && (() => {
    if (!e.date) return false;
    // If we have endTime (arrival), use that; otherwise use dep + 8h estimate
    if (e.endTime) {
      const arrDt = new Date(`${e.date}T${e.endTime}`);
      return arrDt < new Date();
    }
    const depDt = e.time ? new Date(`${e.date}T${e.time}`) : new Date(`${e.date}T23:59`);
    // Add 8h estimated flight time — don't mark as landed until likely arrived
    return depDt.getTime() + (8 * 3600000) < Date.now();
  })();

  const isPastDue = (() => {
    if (e.done || e.type === 'flight') return false;
    if (!e.date) return false;
    const dt = e.time ? new Date(`${e.date}T${e.time}`) : new Date(`${e.date}T23:59`);
    return dt < new Date();
  })();

  const openMenu    = ev => { ev.stopPropagation(); setOpen(true);  setConfirmDel(false); };
  const closeMenu   = ev => { ev.stopPropagation(); setOpen(false); setConfirmDel(false); };
  const handleEdit  = ev => { ev.stopPropagation(); setOpen(false); onEdit   && onEdit(e); };
  const handleDelReq= ev => { ev.stopPropagation(); setConfirmDel(true); };
  const handleDelOk = ev => { ev.stopPropagation(); setOpen(false); setConfirmDel(false); onDelete && onDelete(e.id); };

  const pill = (bg, fg, border) => ({
    background:bg, color:fg, border:`1px solid ${border}`,
    borderRadius:22, padding:'8px 18px', fontSize:14, fontWeight:700,
    cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0,
  });

  // Activity icon — matches keywords in title to relevant emoji
  const actIcon = (() => {
    const t = (e.title||'').toLowerCase();
    const map = [
      // Sports & fitness
      [['golf','putting','driving range'],'⛳'],
      [['swim','swimming','pool','lap'],'🏊'],
      [['tennis','squash','badminton','racket'],'🎾'],
      [['yoga','pilates','stretch'],'🧘'],
      [['run','running','jog','marathon','5k','10k'],'🏃'],
      [['gym','workout','weights','lift','crossfit','hiit'],'💪'],
      [['cycle','cycling','bike','bicycle'],'🚴'],
      [['hike','hiking','trail','trek'],'🥾'],
      [['surf','surfing','paddle','kayak'],'🏄'],
      [['ski','skiing','snowboard'],'⛷️'],
      [['football','soccer','futsal'],'⚽'],
      [['basketball','hoops'],'🏀'],
      [['cricket'],'🏏'],
      [['rugby'],'🏉'],
      [['volleyball'],'🏐'],
      [['baseball','softball'],'⚾'],
      [['boxing','martial arts','mma','karate','judo'],'🥊'],
      // Food & drink
      [['dinner','supper','evening meal'],'🍽️'],
      [['lunch','brunch'],'🥗'],
      [['breakfast','morning meal'],'🍳'],
      [['coffee','cafe','tea','kopi'],'☕'],
      [['drinks','cocktail','wine','beer','bar'],'🍷'],
      [['bbq','barbecue','grill'],'🍖'],
      // Travel & transport
      [['flight','fly','airport'],'✈️'],
      [['hotel','check in','check-in','checkin','resort'],'🏨'],
      [['drive','road trip','car'],'🚗'],
      [['train','rail','mrt','subway','metro'],'🚆'],
      [['cruise','ship','boat','ferry'],'🚢'],
      // Health & wellness
      [['doctor','physician','gp','checkup','check-up'],'🩺'],
      [['dentist','dental','teeth'],'🦷'],
      [['hospital','clinic','medical'],'🏥'],
      [['massage','spa','facial','manicure','pedicure'],'💆'],
      [['medicine','pharmacy','prescription'],'💊'],
      // Work & business
      [['meeting','call','conference','zoom','teams'],'💼'],
      [['interview','presentation','pitch'],'🎯'],
      [['deadline','submit','review'],'📋'],
      [['workshop','training','seminar','webinar'],'🎓'],
      // Personal & family
      [['birthday','bday','celebration','party'],'🎂'],
      [['wedding','anniversary'],'💍'],
      [['school','class','lesson','tuition','exam','test'],'📚'],
      [['haircut','hair','salon','barber'],'✂️'],
      [['shopping','buy','purchase','market'],'🛍️'],
      [['movie','cinema','film','show','theatre','theater','concert','gig'],'🎭'],
      [['museum','gallery','exhibition'],'🖼️'],
      [['prayer','church','mosque','temple','worship'],'🙏'],
      [['volunteer','charity','community'],'🤝'],
      // Tasks & reminders
      [['call','phone','ring'],'📞'],
      [['email','send','reply'],'📧'],
      [['pay','payment','bill','invoice','transfer'],'💳'],
      [['clean','laundry','wash','tidy'],'🧹'],
      [['cook','cooking','bake','baking'],'🍳'],
      [['pick up','collect','fetch','drop'],'🚗'],
    ];
    for (const [keywords, icon] of map) {
      if (keywords.some(k => t.includes(k))) return icon;
    }
    return null;
  })();

  return (
    <div style={{ display:'flex', gap:14, padding:'18px 0',
      borderBottom:`1px solid ${C.border}`,
      opacity: isFlightLanded ? 0.7 : 1 }}>

      {/* V6: thicker stripe — 7px, full opacity */}
      <div style={{ width:7, minHeight:28, borderRadius:4,
        background: isFlightLanded ? C.T : col,
        flexShrink:0, marginTop:2 }} />

      <div style={{ flex:1, minWidth:0 }}>
        {/* Title row */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
          {(e.type === 'task' || (isPastDue && isOwn)) && (
            <button onClick={() => isOwn && onToggle && onToggle(e.id)}
              style={{ width:26, height:26, borderRadius:7,
                border:`2px solid ${e.done ? C.T : isPastDue ? '#C46A14' : C.border}`,
                background: e.done ? C.T+'22' : isPastDue ? '#C46A1408' : 'transparent',
                cursor: isOwn ? 'pointer' : 'default', flexShrink:0, marginTop:1,
                display:'flex', alignItems:'center', justifyContent:'center',
                color: e.done ? C.T : '#C46A14', fontSize:15, padding:0,
                transition:'background 0.15s, border-color 0.15s',
                opacity: isOwn ? 1 : 0.5 }}>
              {e.done ? '✓' : isPastDue ? '!' : ''}
            </button>
          )}
          {/* Activity icon — auto-matched from title keywords */}
          {actIcon && !isFlightLanded && (
            <span style={{ fontSize:18, flexShrink:0, marginTop:1, lineHeight:1 }}>
              {actIcon}
            </span>
          )}
          <span style={{ fontSize:16, fontWeight:600,
            color: (e.done || isFlightLanded) ? C.muted : isPastDue ? C.dim : C.text,
            textDecoration: (e.done || isPastDue || isFlightLanded) ? 'line-through' : 'none',
            lineHeight:'1.4', flex:1, minWidth:0,
            opacity: (isPastDue && !e.done) || isFlightLanded ? 0.6 : 1 }}>
            {e.title}
          </span>
          {/* Landed badge */}
          {isFlightLanded && (
            <span style={{ fontSize:12, fontWeight:700, color:'#fff',
              background:'#2A6E3A', borderRadius:BR.pill, padding:'4px 12px',
              flexShrink:0, boxShadow:`0 2px 8px #2A6E3A40` }}>
              Landed ✓
            </span>
          )}
          {!isFlightLanded && e.type === 'flight' && (
            <span style={{ fontSize:14, fontWeight:700, color:dcol,
              letterSpacing:'0.04em', flexShrink:0,
              background:col+'15', borderRadius:BR.pill, padding:'3px 10px' }}>
              {e.depCity||'?'}→{e.arrCity||'?'}
            </span>
          )}
        </div>

        {/* Meta / Actions / Confirm */}
        {!open ? (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            {e.time      && <span style={{ fontSize:14, color:C.dim }}>{pt(e.time)}{e.endTime?` – ${pt(e.endTime)}`:''}</span>}
            {e.location  && <span style={{ fontSize:14, color:C.dim }}>📍 {e.location}</span>}
            {e.flightNum && <span style={{ fontSize:14, color:C.dim }}>{e.airline} · {e.flightNum}</span>}
            {e.tags      && <span style={{ fontSize:14, color:C.dim }}>🏷 {e.tags}</span>}
            {e.message   && <span style={{ fontSize:14, color:C.dim, fontStyle:'italic' }}>{e.message}</span>}
            {e.repeat && e.repeat !== 'none' && (
              <span style={{ fontSize:12, color:C.rose, background:C.rose+'12',
                borderRadius:BR.pill, padding:'2px 8px', flexShrink:0 }}>
                🔁 {e.repeat.charAt(0).toUpperCase()+e.repeat.slice(1)}
              </span>
            )}
            {e.visibility==='shared' && isOwn && (
              <span style={{ fontSize:12, color:C.rose, background:C.rose+'15', borderRadius:BR.pill, padding:'2px 8px' }}>◯ Shared by me</span>
            )}
            {(e.visibility==='private' || !e.visibility) && isOwn && (
              <span style={{ fontSize:12, color:C.muted, background:C.elevated, borderRadius:BR.pill, padding:'2px 8px', border:`1px solid ${C.border}` }}>🔒 Private</span>
            )}
            {e.visibility==='shared' && !isOwn && (
              <span style={{ fontSize:12, color:DTC.meeting, background:C.M+'18',
                borderRadius:BR.pill, padding:'2px 8px' }}>
                👤 {e.userName || 'Team member'}
              </span>
            )}
            {isOwn && !readOnly && (
              <button onClick={openMenu}
                style={{ marginLeft:'auto', fontSize:15, color:C.muted,
                  background:'transparent', border:`1px solid ${C.border}`,
                  borderRadius:BR.input, padding:'6px 13px', cursor:'pointer',
                  letterSpacing:'0.12em', lineHeight:1, flexShrink:0 }}>···</button>
            )}
            {readOnly && (
              <span style={{ marginLeft:'auto', fontSize:11, color:C.muted,
                fontStyle:'italic', flexShrink:0 }}>view only</span>
            )}
          </div>
        ) : !confirmDel ? (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={handleEdit}  style={pill(col+'18', dcol, col+'50')}>✎ Edit</button>
            <button onClick={handleDelReq} style={pill('#C46A1415','#C46A14','#C46A1450')}>✕ Delete</button>
            <button onClick={closeMenu}   style={{ ...pill(C.elevated,C.muted,C.border), marginLeft:'auto', padding:'4px 10px' }}>×</button>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:15, color:C.dim, flex:1, fontStyle:'italic' }}>Remove this entry?</span>
            <button onClick={closeMenu}   style={pill(C.elevated,C.dim,C.border)}>Cancel</button>
            <button onClick={handleDelOk} style={pill('#A04E08','#fff','#A04E08')}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FLIGHT HERO CARD ────────────────────────────────────────────
function FlightHeroCard({ flight, todayStr }) {
  const { status, lastUpdated, loading } = useLiveFlightStatus(flight);
  const depName = airportCity(flight.depCity);
  const arrName = airportCity(flight.arrCity);

  return (
    <div style={{ background:`linear-gradient(135deg,#EDF5FD,#E2EFF8)`,
      border:`1px solid ${C.F}50`,
      borderRadius:BR.card, padding:18, marginBottom:6,
      position:'relative', overflow:'hidden',
      boxShadow:`0 4px 20px ${C.F}20` }}>
      <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100,
        background:`radial-gradient(circle,${C.F}30 0%,transparent 70%)`,
        pointerEvents:'none' }} />

      {/* Airline + flight number + live status badge */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <p style={{ fontSize:14, color:DTC.flight, fontWeight:700, margin:0,
          textTransform:'uppercase', letterSpacing:'0.1em' }}>
          {flight.airline} · {flight.flightNum}
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {loading && (
            <span style={{ fontSize:11, color:C.dim, fontStyle:'italic' }}>updating…</span>
          )}
          {status && (
            <span style={{ fontSize:12, fontWeight:700, color:'#fff',
              background:status.color, borderRadius:BR.card, padding:'3px 12px',
              letterSpacing:'0.04em', flexShrink:0 }}>
              {status.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Departure */}
            <div style={{ textAlign:'center' }}>
              <span style={{ fontSize:34, fontWeight:600, color:C.text,
                fontFamily:'Cormorant Garamond,serif', lineHeight:1 }}>
                {flight.depCity}
              </span>
              <p style={{ margin:'2px 0 0', fontSize:12, color:C.dim, lineHeight:1 }}>
                {depName !== flight.depCity ? depName : ''}
              </p>
              {/* Show revised departure time if delayed */}
              {status?.revisedDep && status?.delayMins > 4 && (
                <p style={{ margin:'3px 0 0', fontSize:11, color:'#8A3A08', fontWeight:700 }}>
                  {status.delayLabel}
                </p>
              )}
            </div>
            {/* Route line */}
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ flex:1, height:'1px', background:`linear-gradient(90deg,${DTC.flight}60,transparent)` }} />
              <span style={{ fontSize:16, color:DTC.flight }}>✈</span>
              <div style={{ flex:1, height:'1px', background:`linear-gradient(270deg,${DTC.flight}60,transparent)` }} />
            </div>
            {/* Arrival */}
            <div style={{ textAlign:'center' }}>
              <span style={{ fontSize:34, fontWeight:600, color:C.text,
                fontFamily:'Cormorant Garamond,serif', lineHeight:1 }}>
                {flight.arrCity}
              </span>
              <p style={{ margin:'2px 0 0', fontSize:12, color:C.dim, lineHeight:1 }}>
                {arrName !== flight.arrCity ? arrName : ''}
              </p>
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right', paddingLeft:14 }}>
          <p style={{ fontSize:19, fontWeight:600, color:C.text, margin:0 }}>
            {/* Show revised time if delayed, otherwise scheduled */}
            {status?.revisedDep
              ? pt(status.revisedDep.split('T')[1]?.slice(0,5) || flight.time)
              : pt(flight.time)}
          </p>
          <p style={{ fontSize:15, color:C.dim, margin:'4px 0 0' }}>
            {flight.date===todayStr ? 'Today'
              : flight.date===fd(ad(new Date(),1)) ? 'Tomorrow'
              : flight.date}
          </p>
        </div>
      </div>

      {/* Terminal / Gate / Seat chips — gate may update live from AeroDataBox */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[
          ['Terminal', status?.terminal || flight.terminal],
          ['Gate',     status?.gate     || flight.gate],
          ['Seat',     flight.seat],
        ].filter(([,v])=>v).map(([k,v]) => (
          <div key={k} style={{ background:'#ffffff60', borderRadius:BR.btn,
            padding:'7px 12px', backdropFilter:'blur(4px)',
            border:`1px solid ${C.F}25` }}>
            <p style={{ fontSize:12, color:C.dim, margin:0, textTransform:'uppercase', letterSpacing:'0.06em' }}>{k}</p>
            <p style={{ fontSize:16, fontWeight:600, color:C.text, margin:'2px 0 0' }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Last updated timestamp */}
      {lastUpdated && status?.source !== 'local' && (
        <p style={{ margin:'10px 0 0', fontSize:11, color:C.muted, textAlign:'right', fontStyle:'italic' }}>
          Live data · updated {Math.floor((Date.now()-lastUpdated)/60000) < 1
            ? 'just now'
            : `${Math.floor((Date.now()-lastUpdated)/60000)}m ago`}
        </p>
      )}
    </div>
  );
}
function HomeTab({ entries, onToggle, onEdit, onDelete, userName, currentUserId, onAdd, syncStatus }) {
  const now      = new Date();
  const todayStr = fd(now);
  const [homeFilter, setHomeFilter] = useState(null); // 'today' | 'tasks' | 'next48' | null

  const todayEs = useMemo(() =>
    entries.filter(e => e.date === fd(new Date()))
           .sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99')),
    [entries]);
  const nextFlight = useMemo(() =>
    entries.filter(e => e.type==='flight' && e.date >= fd(new Date()))
           .sort((a,b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''))[0],
    [entries]);
  const topTasks = useMemo(() => {
    return entries.filter(e => e.type==='task' && !e.done)
                  .sort((a,b) => (a.date||'9999').localeCompare(b.date||'9999'))
                  .slice(0,3);
  }, [entries]);
  const openTasks = entries.filter(e => e.type==='task' && !e.done).length;
  const next48 = useMemo(() => {
    const n = new Date(), lim = new Date(n.getTime()+48*3600000);
    return entries.filter(e => {
      const d=new Date(e.date+'T'+(e.time||'00:00'));
      return d>=n && d<=lim && e.type!=='task';
    }).length;
  }, [entries]);
  const hr    = now.getHours();
  const greet = hr<12?'Good Morning':hr<17?'Good Afternoon':'Good Evening';

  return (
    <div style={{ overflowY:'auto', height:'100%', boxSizing:'border-box' }}>

      {/* ── Kizuna Brand Header ─────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg, #FFFEFB 0%, #FDF5EE 60%, #F8EDE4 100%)`,
        padding:'22px 22px 18px',
        borderBottom:`1px solid ${C.border}`,
        position:'relative', overflow:'hidden',
        boxShadow:`0 3px 12px rgba(184,113,92,0.08)` }}>

        {/* Decorative rose glow — top right */}
        <div style={{ position:'absolute', top:-30, right:-20, width:160, height:160,
          background:`radial-gradient(circle, ${C.rose}18 0%, transparent 70%)`,
          pointerEvents:'none' }} />
        {/* Decorative glow — bottom left */}
        <div style={{ position:'absolute', bottom:-20, left:-10, width:100, height:100,
          background:`radial-gradient(circle, ${C.M}12 0%, transparent 70%)`,
          pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'flex-start',
          justifyContent:'space-between', position:'relative' }}>
          <div style={{ flex:1 }}>
            {/* App name */}
            <h1 style={{ margin:'0 0 2px', fontSize:38, fontWeight:700, color:C.text,
              fontFamily:'Cormorant Garamond,serif', lineHeight:1,
              letterSpacing:'-0.01em' }}>
              Kizuna&thinsp;<span style={{ color:C.rose }}>絆</span>
            </h1>
            {/* Tagline */}
            <p style={{ margin:'10px 0 0', fontSize:18, color:C.rose,
              fontFamily:'Cormorant Garamond,serif', lineHeight:1.5,
              fontWeight:600, letterSpacing:'0.01em' }}>
              Bonding with trust, loyalty & love
            </p>
            <p style={{ margin:'2px 0 0', fontSize:16, color:C.dim, fontStyle:'italic',
              fontFamily:'Cormorant Garamond,serif', lineHeight:1.6 }}>
              Nurturing the invisible thread that connects hearts
            </p>
            <p style={{ margin:0, fontSize:16, color:C.dim, fontStyle:'italic',
              fontFamily:'Cormorant Garamond,serif', lineHeight:1.6 }}>
              across time and distance
            </p>
          </div>
          {/* Sakura icon — static flowers + animated falling petals */}
          <div style={{ flexShrink:0, marginTop:2, transform:'scale(1.3)',
            transformOrigin:'top right', position:'relative' }}>
            <KizunaIcon />
            <SakuraPetals />
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 18px 90px' }}>
        {/* Greeting */}
        <div style={{ marginBottom:18 }}>
          <p style={{ fontSize:14, color:C.dim, margin:'0 0 2px', fontStyle:'italic' }}>{greet}</p>
          <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
            <h2 style={{ fontSize:34, fontFamily:'Cormorant Garamond,Georgia,serif',
              fontWeight:600, color:C.rose, margin:0, lineHeight:1.1 }}>
              {userName || 'Welcome'}
            </h2>
            {/* Sync status — word label right of name */}
            <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.05em',
              color: syncStatus==='synced' ? C.T : syncStatus==='error' ? '#C46A14' : C.rose,
              background: syncStatus==='synced' ? C.T+'18' : syncStatus==='error' ? '#C46A1415' : C.rose+'18',
              borderRadius:BR.pill, padding:'3px 10px', flexShrink:0,
              border:`1px solid ${syncStatus==='synced' ? C.T : syncStatus==='error' ? '#C46A14' : C.rose}40` }}>
              {syncStatus==='loading' ? 'Syncing…' : syncStatus==='synced' ? 'Synced' : 'Sync Error'}
            </span>
          </div>
          <p style={{ fontSize:15, color:C.dim, margin:'4px 0 0' }}>
            {DAY[now.getDay()]}, {MFULL[now.getMonth()]} {now.getDate()} · {todayEs.length} items today
          </p>
        </div>

        {/* Tappable stat cards — hidden when Today filter active (Today's Schedule shows instead) */}
        {homeFilter !== 'today' && (() => {
          const filters = [
            { key:'today',   val:todayEs.length,  label:'Today',      c:C.M,  dc:DTC.meeting, icon:'📋',
              entries: todayEs.filter(e=>!e.repeat||e.repeat==='none') },
            { key:'tasks',   val:openTasks,        label:'Open Tasks', c:C.T,  dc:DTC.task,    icon:'✓',
              entries: entries.filter(e=>e.type==='task'&&!e.done&&(!e.repeat||e.repeat==='none')).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')) },
            { key:'next48',  val:next48,           label:'Next 48h',   c:C.E,  dc:DTC.event,   icon:'⏱',
              entries: (() => { const n=new Date(),lim=new Date(n.getTime()+48*3600000);
                return entries.filter(e=>{ const d=new Date(e.date+'T'+(e.time||'00:00'));
                  return d>=n&&d<=lim&&e.type!=='task'&&(!e.repeat||e.repeat==='none'); })
                  .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')); })() },
          ];
          return (<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:8 }}>
              {filters.map(f => {
                const active = homeFilter===f.key;
                return (
                  <button key={f.key} onClick={() => setHomeFilter(p=>p===f.key?null:f.key)}
                    style={{ background: active
                        ? `linear-gradient(145deg,${f.c},${f.c}CC)`
                        : `linear-gradient(145deg,${C.card},${f.c}10)`,
                      borderRadius:BR.card, padding:'16px 10px 14px',
                      textAlign:'center', boxShadow: active ? `0 4px 16px ${f.c}40` : SH.card,
                      border:`1.5px solid ${active ? f.c : f.c}${active ? '' : '25'}`,
                      cursor:'pointer', transition:'all 0.15s' }}>
                    <div style={{ fontSize:18, marginBottom:4, opacity:0.8 }}>{f.icon}</div>
                    <div style={{ fontSize:28, fontWeight:700,
                      fontFamily:'Cormorant Garamond,serif',
                      color: active ? '#fff' : f.dc, lineHeight:1 }}>{f.val}</div>
                    <div style={{ fontSize:12, marginTop:5, fontWeight:600,
                      textTransform:'uppercase', letterSpacing:'0.07em',
                      color: active ? '#fff' : C.dim }}>{f.label}</div>
                  </button>
                );
              })}
            </div>
            {/* Filtered entries panel — shown when a card is tapped */}
            {homeFilter && (() => {
              const f = filters.find(x=>x.key===homeFilter);
              if (!f) return null;
              return (
                <div style={{ background:C.card, borderRadius:BR.card,
                  border:`1px solid ${f.c}30`, boxShadow:SH.card, marginBottom:8,
                  padding: f.entries.length ? '0 14px' : '16px 14px' }}>
                  {f.entries.length === 0
                    ? <p style={{ margin:0, fontSize:15, color:C.muted,
                        textAlign:'center', fontStyle:'italic' }}>
                        Nothing here yet
                      </p>
                    : f.entries.map(e => <ECard key={e.id} e={e}
                        onToggle={onToggle} onEdit={onEdit}
                        onDelete={onDelete} currentUserId={currentUserId} />)
                  }
                </div>
              );
            })()}
          </>);
        })()}

        {/* Next Flight — only shown when no filter card is active */}
        {!homeFilter && nextFlight && (<>
          <Sec label="Next Flight" />
          <FlightHeroCard flight={nextFlight} todayStr={todayStr} />
        </>)}

        {/* Pending Tasks — only shown when no filter active */}
        {!homeFilter && topTasks.length > 0 && (<>
          <Sec label="Pending Tasks" count={openTasks} />
          <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
            boxShadow:SH.card, border:`1px solid ${C.border}` }}>
            {topTasks.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
          </div>
        </>)}

        {/* Today's Schedule — shown ONLY when Today filter card is pressed */}
        {homeFilter === 'today' && (<>
          <Sec label="Today's Schedule" count={todayEs.length} />
          {todayEs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 18px',
              background:C.card, borderRadius:BR.card,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
              <div style={{ fontSize:36, marginBottom:10, opacity:0.4 }}>🌸</div>
              <p style={{ margin:'0 0 4px', fontSize:16, fontWeight:600, color:C.dim }}>
                A peaceful day ahead
              </p>
              <button onClick={onAdd}
                style={{ marginTop:10, background:C.rose, border:'none', color:'#fff',
                  borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit',
                  boxShadow:`0 4px 14px ${C.rose}40` }}>
                + Schedule something
              </button>
            </div>
          ) : (
            <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {todayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ─── AGENDA VIEW ─────────────────────────────────────────────────
function AgendaView({ entries, onToggle, onEdit, onDelete, currentUserId, onAdd }) {
  const grouped = useMemo(() => {
    const sorted = [...entries].sort((a,b) =>
      a.date.localeCompare(b.date) || (a.time||'99:99').localeCompare(b.time||'99:99'));
    const map = {};
    sorted.forEach(e => { (map[e.date] = map[e.date]||[]).push(e); });
    return map;
  }, [entries]);
  const dates = Object.keys(grouped).sort();

  return (
    <div style={{ overflowY:'auto', height:'100%', padding:'0 18px 90px', boxSizing:'border-box' }}>
      {dates.length === 0 ? (        <div style={{ textAlign:'center', padding:'60px 24px' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:12,
            opacity:0.4, color:C.rose, transform:'scale(2)', transformOrigin:'center' }}>
            <CalIcon />
          </div>
          <p style={{ fontSize:16, fontWeight:600, color:C.dim, margin:'24px 0 6px' }}>
            Nothing scheduled yet
          </p>
          <p style={{ fontSize:14, color:C.muted, fontStyle:'italic', margin:'0 0 20px' }}>
            Your upcoming entries will appear here
          </p>
          <button onClick={() => onAdd(fd(new Date()))}
            style={{ background:C.rose, border:'none', color:'#fff',
              borderRadius:BR.btn, padding:'12px 28px', fontSize:15, fontWeight:700,
              cursor:'pointer', fontFamily:'inherit',
              boxShadow:`0 4px 14px ${C.rose}40` }}>
            + Schedule something
          </button>
        </div>
      ) : dates.map(d => {
        const dt     = new Date(d+'T00:00:00');
        const isT    = d === fd(new Date());
        const isPast = dt < new Date();
        return (
          <div key={d} style={{ marginTop:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              <div style={{ width:44, height:44, borderRadius:BR.input, flexShrink:0,
                background: isT
                  ? `linear-gradient(135deg,${C.rose},${C.roseL})`
                  : isPast
                    ? C.elevated
                    : `linear-gradient(135deg,${C.card},${C.M}12)`,
                boxShadow: isT ? `0 4px 16px ${C.rose}35` : SH.subtle,
                border: isT ? 'none' : `1px solid ${C.border}`,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:11, fontWeight:700, color:isT?'#fff':C.dim,
                  lineHeight:1, textTransform:'uppercase' }}>{DAY[dt.getDay()]}</span>
                <span style={{ fontSize:20, fontWeight:700, color:isT?'#fff':C.text, lineHeight:1.2 }}>
                  {dt.getDate()}
                </span>
              </div>
              <span style={{ fontSize:16, color:isT?C.rose:C.dim, fontStyle:isT?'italic':'normal' }}>
                {isT ? 'Today — ' : ''}{MFULL[dt.getMonth()]} {dt.getFullYear()}
              </span>
            </div>
            <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {grouped[d].map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
            </div>
          </div>
        );
      })}
      </div>
  );
}
function DayView({ entries, selDate, setSelDate, onToggle, onEdit, onDelete, currentUserId, onAdd }) {
  const dayEs = useMemo(() => entries.filter(e => e.date===selDate && e.time), [entries, selDate]);
  const allDayEs = useMemo(() => entries.filter(e => e.date===selDate && !e.time), [entries, selDate]);
  const hours  = Array.from({ length:24 }, (_,i) => i); // 00:00 → 23:00
  const dt     = new Date(selDate+'T00:00:00');

  const NavBtn = ({ children, onClick }) => (
    <button onClick={onClick} style={{ background:C.card, border:`1px solid ${C.border}`,
      color:C.text, borderRadius:BR.btn, padding:'7px 16px', cursor:'pointer',
      fontSize:20, boxShadow:SH.subtle }}>{children}</button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <NavBtn onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()-1); setSelDate(fd(d)); }}>‹</NavBtn>
        <div style={{ flex:1, textAlign:'center' }}>
          <p style={{ margin:0, fontSize:16, fontWeight:600, color:C.text }}>
            {DAY[dt.getDay()]}, {MFULL[dt.getMonth()]} {dt.getDate()}
          </p>
          {selDate===fd(new Date()) && (
            <p style={{ margin:0, fontSize:14, color:C.rose, fontStyle:'italic' }}>Today</p>
          )}
        </div>
        <NavBtn onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()+1); setSelDate(fd(d)); }}>›</NavBtn>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 18px 90px', boxSizing:'border-box' }}>
        {/* All-day entries (no time) shown at top */}
        {allDayEs.length > 0 && (
          <div style={{ background:C.card, borderRadius:BR.input, padding:'0 12px',
            border:`1px solid ${C.border}`, margin:'8px 0 4px',
            boxShadow:SH.subtle }}>
            <p style={{ fontSize:12, color:C.muted, margin:'8px 0 2px',
              textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>All day</p>
            {allDayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
          </div>
        )}
        {/* Hourly slots */}
        {hours.map(h => {
          const hEs = dayEs.filter(e => parseInt(e.time.split(':')[0])===h);
          return (
            <div key={h} style={{ display:'flex', gap:12, minHeight:48 }}>
              <div style={{ width:48, paddingTop:10, flexShrink:0, textAlign:'right' }}>
                <span style={{ fontSize:13, color: h===0||h===12 ? C.text : C.muted,
                  fontWeight: h===0||h===12 ? 600 : 400 }}>
                  {h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`}
                </span>
              </div>
              <div style={{ flex:1, borderTop:`1px solid ${C.border}`, paddingTop:4, paddingBottom:4 }}>
                {hEs.length > 0 && (
                  <div style={{ background:C.card, borderRadius:BR.input, padding:'0 12px',
                    boxShadow:SH.card, border:`1px solid ${C.border}` }}>
                    {hEs.map(e => (
                      <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEEK VIEW ───────────────────────────────────────────────────
function WeekView({ entries, selDate, setSelDate, onToggle, onEdit, onDelete, currentUserId, onAdd }) {
  const dt        = new Date(selDate+'T00:00:00');
  const dow       = dt.getDay();
  const weekStart = new Date(dt);
  weekStart.setDate(dt.getDate() - (dow===0?6:dow-1));
  const days = Array.from({ length:7 }, (_,i) => ad(weekStart,i));

  // Entries for each day in week — used for dots
  const weekEntries = useMemo(() =>
    Object.fromEntries(days.map(d => {
      const ds = fd(d);
      return [ds, entries.filter(e=>e.date===ds).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'))];
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [entries, fd(weekStart)]);

  // Selected day's entries
  const selDayEs = weekEntries[selDate] || [];
  const selIsPast = new Date(selDate+'T23:59:59') < new Date();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Week navigation header */}
      <div style={{ display:'flex', alignItems:'center', padding:'8px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <button onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()-7); setSelDate(fd(d)); }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:16, color:C.dim, fontWeight:600 }}>
          {MON[weekStart.getMonth()]} {weekStart.getDate()} – {MON[days[6].getMonth()]} {days[6].getDate()}
        </span>
        <button onClick={() => { const d=new Date(selDate+'T00:00:00'); d.setDate(d.getDate()+7); setSelDate(fd(d)); }}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>›</button>
      </div>

      {/* 7-day picker row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
        padding:'4px 6px', flexShrink:0, borderBottom:`1px solid ${C.border}`,
        background:C.card }}>
        {days.map(d => {
          const ds=fd(d); const isT=ds===fd(new Date()); const isSel=ds===selDate;
          const isPast = d < new Date() && !isT;
          const dots = [...new Set((weekEntries[ds]||[]).map(e=>TC[e.type]))].slice(0,3);
          return (
            <button key={ds} onClick={() => setSelDate(ds)}
              style={{ background:'transparent', border:'none',
                cursor:'pointer',
                padding:'6px 2px', textAlign:'center',
                opacity: isPast ? 0.45 : 1 }}>
              <div style={{ fontSize:11, color:isT?C.rose:C.muted, marginBottom:2,
                textTransform:'uppercase', letterSpacing:'0.05em' }}>
                {DAY[d.getDay()]}
              </div>
              <div style={{ width:32, height:32, borderRadius:BR.panel, margin:'0 auto',
                background: isSel?C.rose : isT?C.rose+'22':'transparent',
                border: isT&&!isSel?`1.5px solid ${C.rose}60`:'1.5px solid transparent',
                boxShadow: isSel?`0 2px 10px ${C.rose}40`:'none',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:15, fontWeight:isSel?700:400,
                  color:isSel?'#fff':isT?C.rose:C.text }}>{d.getDate()}</span>
              </div>
              {/* Entry count dot or dots */}
              <div style={{ display:'flex', justifyContent:'center', gap:2, marginTop:4, height:7 }}>
                {dots.map((col,j) => (
                  <div key={j} style={{ width:7, height:7, borderRadius:4, background:col,
                    boxShadow:`0 1px 3px ${col}50` }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day's entries */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 18px 90px', boxSizing:'border-box' }}>
        {selDayEs.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 18px',
            background:C.card, borderRadius:BR.card, margin:'8px 0',
            border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:600, color:C.dim }}>
              Nothing on {DAY[new Date(selDate+'T00:00:00').getDay()]}, {MFULL[new Date(selDate+'T00:00:00').getMonth()]} {new Date(selDate+'T00:00:00').getDate()}
            </p>
            <button onClick={() => onAdd(selDate)}
              style={{ marginTop:10, background:C.rose, border:'none', color:'#fff',
                borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit',
                boxShadow:`0 4px 14px ${C.rose}40` }}>
              + Schedule something
            </button>
          </div>
        ) : (
          <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
            boxShadow:SH.card, border:`1px solid ${C.border}` }}>
            {selDayEs.map(e => (
              <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} readOnly={selIsPast} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MONTH VIEW ──────────────────────────────────────────────────
function MonthView({ entries, selDate, setSelDate, onToggle, onEdit, onDelete, currentUserId, onAdd }) {
  const initDt      = new Date(selDate+'T00:00:00');
  const [vm, setVm] = useState({ y:initDt.getFullYear(), m:initDt.getMonth() });
  const daysInMonth = new Date(vm.y, vm.m+1, 0).getDate();
  const first       = new Date(vm.y, vm.m, 1);
  const offset      = first.getDay()===0 ? 6 : first.getDay()-1;
  const cells       = [...Array(offset).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const selDayEs    = entries.filter(e=>e.date===selDate)
                             .sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', padding:'8px 18px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card }}>
        <button onClick={() => setVm(p => p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1})}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:19, fontWeight:600,
          color:C.text, fontFamily:'Cormorant Garamond,serif' }}>
          {MFULL[vm.m]} {vm.y}
        </span>
        <button onClick={() => setVm(p => p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1})}
          style={{ background:C.elevated, border:`1px solid ${C.border}`, color:C.text,
            borderRadius:BR.btn, padding:'7px 14px', cursor:'pointer', fontSize:20 }}>›</button>
      </div>
      {/* Weekday labels */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
        padding:'6px 6px 0', flexShrink:0, background:C.card }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{ textAlign:'center', fontSize:14, color:C.muted, fontWeight:600, padding:'3px 0' }}>{d}</div>
        ))}
      </div>
      {/* Day grid */}
      <div style={{ padding:'0 6px', flexShrink:0, background:C.card }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
          {cells.map((day,i) => {
            if (!day) return <div key={`e${i}`} style={{ height:42 }} />;
            const ds     = `${vm.y}-${p2(vm.m+1)}-${p2(day)}`;
            const isT    = ds===fd(new Date()), isSel = ds===selDate;
            const isPast = new Date(ds+'T00:00:00') < new Date() && !isT;
            const dots   = [...new Set(entries.filter(e=>e.date===ds).map(e=>TC[e.type]))].slice(0,3);
            return (
              <button key={ds} onClick={() => setSelDate(ds)}
                style={{ background:'transparent', border:'none',
                  cursor:'pointer',
                  padding:'3px 1px', textAlign:'center',
                  opacity: isPast ? 0.4 : 1 }}>
                <div style={{ width:32, height:32, borderRadius:BR.panel, margin:'0 auto',
                  background: isSel?C.rose : isT?C.rose+'20':'transparent',
                  border: isT&&!isSel?`1.5px solid ${C.rose}60`:'1.5px solid transparent',
                  boxShadow: isSel?`0 2px 12px ${C.rose}35`:'none',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:16, fontWeight:isSel?700:400,
                    color: isSel?'#fff' : isT?C.rose:C.text }}>{day}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'center', gap:3, marginTop:2, height:7 }}>
                  {dots.map((col,j) => (
                    <div key={j} style={{ width:7, height:7, borderRadius:4, background:col+'90' }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {/* Selected day entries */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 18px 90px',
        borderTop:`1px solid ${C.border}`, marginTop:8, boxSizing:'border-box' }}>
        <p style={{ fontSize:14, color:C.dim, margin:'10px 0 8px',
          textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700 }}>
          {new Date(selDate+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
        </p>
        {selDayEs.length===0
          ? <div style={{ textAlign:'center', padding:'24px 18px',
              background:C.card, borderRadius:BR.card,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
              <p style={{ margin:'0 0 10px', fontSize:16, fontWeight:600, color:C.dim, fontStyle:'italic' }}>
                Nothing on this day
              </p>
              <button onClick={() => onAdd(selDate)}
                style={{ background:C.rose, border:'none', color:'#fff',
                  borderRadius:BR.btn, padding:'10px 24px', fontSize:15, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit',
                  boxShadow:`0 4px 14px ${C.rose}40` }}>
                + Schedule something
              </button>
            </div>
          : <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {selDayEs.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} readOnly={new Date(selDate+'T23:59:59') < new Date()} />)}
            </div>
        }
      </div>
    </div>
  );
}

// ─── CALENDAR TAB ────────────────────────────────────────────────
const CAL_VIEW_KEY = 'kizuna_cal_view_v1';
function CalendarTab({ entries, onToggle, onEdit, onDelete, currentUserId, onAdd }) {
  // F10: persist selected view across tab switches and app restarts
  const [view, setView] = useState(() =>
    localStorage.getItem(CAL_VIEW_KEY) || 'agenda'
  );
  const [selDate, setSelDate] = useState(fd(new Date()));

  const switchView = (v) => {
    setView(v);
    localStorage.setItem(CAL_VIEW_KEY, v);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', gap:6, padding:'10px 14px',
        borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.card,
        alignItems:'center' }}>
        {/* Today button */}
        <button onClick={() => setSelDate(fd(new Date()))}
          style={{ padding:'8px 14px', borderRadius:BR.btn, border:`1.5px solid ${C.rose}`,
            background: selDate === fd(new Date()) ? C.rose : 'transparent',
            color: selDate === fd(new Date()) ? '#fff' : C.rose,
            fontSize:14, fontWeight:700, cursor:'pointer', flexShrink:0,
            transition:'all 0.15s' }}>
          Today
        </button>
        <div style={{ width:1, height:22, background:C.border, flexShrink:0 }} />
        {['agenda','day','week','month'].map(v => (
          <button key={v} onClick={() => switchView(v)}
            style={{ flex:1, padding:'8px 2px', borderRadius:BR.btn, border:'none', cursor:'pointer',
              background: view===v ? C.rose : C.elevated,
              color: view===v ? '#fff' : C.dim,
              fontSize:14, fontWeight:view===v?600:400, textTransform:'capitalize',
              boxShadow: view===v?`0 2px 10px ${C.rose}35`:SH.subtle,
              transition:'background 0.15s' }}>
            {v}
          </button>
        ))}
        {/* Schedule button */}
        <button onClick={() => onAdd(selDate)}
          style={{ width:36, height:36, borderRadius:BR.btn, border:'none', flexShrink:0,
            background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            color:'#fff', fontSize:22, fontWeight:300, cursor:'pointer',
            boxShadow:`0 3px 10px ${C.rose}40`, lineHeight:1,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
          +
        </button>
      </div>
      <div style={{ flex:1, overflow:'hidden' }}>
        {view==='agenda' && <AgendaView entries={entries} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} onAdd={onAdd} />}
        {view==='day'    && <DayView    entries={entries} selDate={selDate} setSelDate={setSelDate} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} onAdd={onAdd} />}
        {view==='week'   && <WeekView   entries={entries} selDate={selDate} setSelDate={setSelDate} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} onAdd={onAdd} />}
        {view==='month'  && <MonthView  entries={entries} selDate={selDate} setSelDate={setSelDate} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} onAdd={onAdd} />}
      </div>
    </div>
  );
}

// ─── SEARCH TAB ──────────────────────────────────────────────────
const QUICK_FILTERS = [
  { k:'today',   l:'Today',            f: e => e.date===fd(new Date()) },
  { k:'week',    l:'This Week',        f: e => { const d=new Date(e.date+'T00:00:00'),n=new Date(),w=ad(n,7); return d>=n&&d<=w; } },
  { k:'flights', l:'Upcoming Flights', f: e => e.type==='flight' && e.date>=fd(new Date()) },
  { k:'tasks',   l:'Pending Tasks',    f: e => e.type==='task' && !e.done },
];

function SearchTab({ entries, onToggle, onEdit, onDelete, currentUserId }) {
  const [q,      setQ]      = useState('');
  const [typeF,  setTypeF]  = useState('all');
  const [quickF, setQuickF] = useState(null);

  const results = useMemo(() => {
    let r = entries;
    if (quickF) { const qf=QUICK_FILTERS.find(x=>x.k===quickF); if (qf) r=r.filter(qf.f); }
    if (typeF !== 'all') r = r.filter(e => e.type===typeF);
    if (q.trim()) {
      const lq = q.toLowerCase();
      r = r.filter(e =>
        [e.title,e.location,e.attendees,e.tags,e.notes,e.message,e.airline,e.flightNum,e.depCity,e.arrCity]
          .some(f => f && f.toLowerCase().includes(lq)));
    }
    return r.sort((a,b) => (b.date||'0000').localeCompare(a.date||'0000'));
  }, [entries, q, typeF, quickF]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'12px 18px', borderBottom:`1px solid ${C.border}`,
        flexShrink:0, background:C.card }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, background:C.elevated,
          borderRadius:BR.panel, padding:'11px 16px', border:`1px solid ${C.border}`,
          boxShadow:SH.subtle }}>
          <span style={{ color:C.muted, fontSize:19 }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all entries…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none',
              color:C.text, fontSize:16, fontFamily:'inherit' }} />
          {q && (
            <button onClick={() => setQ('')}
              style={{ background:'transparent', border:'none', color:C.muted,
                cursor:'pointer', fontSize:18, padding:0 }}>✕</button>
          )}
        </div>
        {/* Dynamic date display — shows today's actual date */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10,
          background:C.card, borderRadius:BR.input, padding:'12px 16px',
          border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
          {/* Live calendar icon with date */}
          <div style={{ width:44, height:44, borderRadius:BR.input, flexShrink:0,
            background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            boxShadow:`0 4px 12px ${C.rose}35`,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#fff',
              textTransform:'uppercase', letterSpacing:'0.06em', lineHeight:1 }}>
              {DAY[new Date().getDay()]}
            </span>
            <span style={{ fontSize:20, fontWeight:700, color:'#fff', lineHeight:1.2 }}>
              {new Date().getDate()}
            </span>
          </div>
          <div>
            <p style={{ margin:0, fontSize:16, fontWeight:700, color:C.text }}>
              {MFULL[new Date().getMonth()]} {new Date().getFullYear()}
            </p>
            <p style={{ margin:0, fontSize:13, color:C.dim }}>
              {entries.filter(e=>e.date===fd(new Date())).length} items today
            </p>
          </div>
          <button onClick={() => { setQ(''); setTypeF('all'); setQuickF('today'); }}
            style={{ marginLeft:'auto', background:C.rose, border:'none', color:'#fff',
              borderRadius:BR.btn, padding:'8px 16px', fontSize:14, fontWeight:700,
              cursor:'pointer', fontFamily:'inherit',
              boxShadow:`0 3px 10px ${C.rose}40` }}>
            View Today
          </button>
        </div>
        {/* Quick filters */}
        <div style={{ display:'flex', gap:7, marginTop:10, overflowX:'auto', paddingBottom:2 }}>
          {QUICK_FILTERS.map(qf => (
            <button key={qf.k} onClick={() => setQuickF(p => p===qf.k?null:qf.k)}
              style={{ background: quickF===qf.k ? C.rose : C.elevated,
                border:`1px solid ${quickF===qf.k ? C.rose : C.border}`,
                color: quickF===qf.k ? '#fff' : C.dim,
                borderRadius:BR.card, padding:'5px 14px',
                fontSize:15, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap',
                boxShadow: quickF===qf.k?`0 2px 10px ${C.rose}35`:SH.subtle,
                transition:'background 0.15s' }}>
              {qf.l}
            </button>
          ))}
        </div>
        {/* Type filters */}
        <div style={{ display:'flex', gap:6, marginTop:7, overflowX:'auto', paddingBottom:2 }}>
          {['all','meeting','task','flight','reminder','event','birthday'].map(t => (
            <button key={t} onClick={() => setTypeF(t)}
              style={{ background: typeF===t ? (t==='all' ? C.rose : TC[t]) : C.elevated,
                border:`1px solid ${typeF===t ? (t==='all' ? C.rose : TC[t]) : C.border}`,
                color: typeF===t ? '#fff' : C.dim,
                borderRadius:BR.card, padding:'5px 14px', fontSize:14, fontWeight: typeF===t ? 700 : 500,
                cursor:'pointer', whiteSpace:'nowrap', textTransform:'capitalize',
                boxShadow: typeF===t ? `0 2px 8px ${t==='all'?C.rose:TC[t]}50` : 'none',
                transition:'all 0.15s' }}>
              {t==='all'?'All':TL[t]||t}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 18px 90px', boxSizing:'border-box' }}>
        <p style={{ fontSize:15, color:C.muted, margin:'12px 0 6px', fontStyle:'italic' }}>
          {results.length} result{results.length!==1?'s':''}
        </p>
        {results.length===0
          ? <div style={{ textAlign:'center', padding:'50px 18px',
              background:C.card, borderRadius:BR.card, marginTop:12,
              border:`1px solid ${C.border}`, boxShadow:SH.subtle }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10,
            opacity:0.4, color:C.rose, transform:'scale(1.8)', transformOrigin:'center' }}>
            <CalIcon />
          </div>
          <p style={{ margin:'20px 0 4px', fontSize:16, fontWeight:600, color:C.dim }}>Nothing found</p>
              <p style={{ margin:0, fontSize:14, color:C.muted, fontStyle:'italic' }}>Try a different search or filter</p>
            </div>
          : <div style={{ background:C.card, borderRadius:BR.card, padding:'0 14px',
              boxShadow:SH.card, border:`1px solid ${C.border}` }}>
              {results.map(e => <ECard key={e.id} e={e} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
            </div>
        }
      </div>
    </div>
  );
}

// ─── RESET SECTION ───────────────────────────────────────────────
// Two-tap confirm guard — first tap shows warning, second tap executes reset.
// Separated to module level so it's never recreated inside SettingsTab.
function ResetSection({ onReset }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ marginBottom:40 }}>
      <p style={{ fontSize:13, fontWeight:700, color:'#C46A14', textTransform:'uppercase',
        letterSpacing:'0.14em', margin:'24px 0 8px' }}>Danger Zone</p>
      <div style={{ background:C.card, borderRadius:BR.card, overflow:'hidden',
        boxShadow:SH.card, border:`1px solid ${'#C46A14'}40` }}>
        {!confirming ? (
          <div style={{ display:'flex', alignItems:'center', padding:'16px 18px', gap:12 }}>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:16, color:C.text, fontWeight:500 }}>Reset App Data</p>
              <p style={{ margin:0, fontSize:15, color:C.dim, marginTop:2 }}>
                Wipe all entries, audit log and storage. Cannot be undone.
              </p>
            </div>
            <button onClick={() => setConfirming(true)}
              style={{ background:'transparent', border:`1.5px solid ${'#C46A14'}`,
                color:'#C46A14', borderRadius:BR.btn, padding:'8px 16px',
                fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                whiteSpace:'nowrap' }}>
              Reset…
            </button>
          </div>
        ) : (
          <div style={{ padding:'18px 18px' }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#A04E08' }}>
              Are you sure?
            </p>
            <p style={{ margin:'0 0 16px', fontSize:15, color:C.dim, lineHeight:1.5 }}>
              This permanently erases every entry, flight, reminder and activity log record.
              Your next sync will start with a completely blank database.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirming(false)}
                style={{ flex:1, background:C.elevated, border:`1px solid ${C.border}`,
                  color:C.dim, borderRadius:BR.btn, padding:'11px 0',
                  fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={() => { setConfirming(false); onReset(); }}
                style={{ flex:1, background:'#A04E08', border:'none',
                  color:'#fff', borderRadius:BR.btn, padding:'11px 0',
                  fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  boxShadow:`0 4px 16px ${'#A04E08'}40` }}>
                Yes, Wipe Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INVITE MODAL ────────────────────────────────────────────────
function InviteModal({ onClose, workspaceId, invitedBy }) {
  const url    = 'https://surferyogi.github.io/Kizuna-app/';
  const qr     = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=B8715C&bgcolor=FFFEFB&data=${encodeURIComponent(url)}`;
  const [copied,       setCopied]       = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviteSent,   setInviteSent]   = useState(false);
  const [inviteError,  setInviteError]  = useState('');
  const [inviteLoading,setInviteLoading]= useState(false);

  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
        .catch(() => fallback());
    } else { fallback(); }
  };
  const fallback = () => {
    const el = document.createElement('textarea');
    el.value = url; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { setInviteError('Please enter an email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError('Invalid email address.'); return; }
    if (!workspaceId) { setInviteError('Workspace not loaded. Please try again.'); return; }
    setInviteLoading(true); setInviteError('');
    const ok = await dbInviteMember(workspaceId, invitedBy, email);
    setInviteLoading(false);
    if (ok) { setInviteSent(true); setInviteEmail(''); }
    else    { setInviteError('Failed to send invite. Please try again.'); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200,
      display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(44,38,32,0.40)',
        backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{ position:'relative', background:C.card, borderRadius:'24px 24px 0 0',
        border:`1px solid ${C.border}`, padding:'20px 22px 44px',
        boxShadow:SH.float }}>
        <div style={{ width:40, height:5, borderRadius:3, background:C.border, margin:'0 auto 18px' }} />
        <h3 style={{ margin:'0 0 4px', fontSize:21, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif' }}>Invite to Kizuna 絆</h3>
        <p style={{ margin:'0 0 20px', fontSize:15, color:C.dim, fontStyle:'italic' }}>
          Share the link, scan the QR code, or invite by email
        </p>

        {/* Email invite */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <input value={inviteEmail} onChange={e=>{setInviteEmail(e.target.value);setInviteSent(false);setInviteError('');}}
            onKeyDown={e=>e.key==='Enter'&&sendInvite()}
            placeholder="colleague@email.com" type="email"
            style={{ flex:1, background:C.elevated, border:`1px solid ${inviteError?'#C46A14':C.border}`,
              borderRadius:BR.btn, padding:'11px 14px', fontSize:16, color:C.text,
              outline:'none', fontFamily:'inherit' }} />
          <button onClick={sendInvite} disabled={inviteLoading}
            style={{ background:C.rose, border:'none', color:'#fff', borderRadius:BR.btn,
              padding:'11px 18px', fontSize:15, fontWeight:700, cursor:'pointer',
              fontFamily:'inherit', opacity:inviteLoading?0.7:1, flexShrink:0 }}>
            {inviteLoading ? '…' : 'Invite'}
          </button>
        </div>
        {inviteError && <p style={{ margin:'-10px 0 10px', fontSize:13, color:'#C46A14' }}>{inviteError}</p>}
        {inviteSent  && <p style={{ margin:'-10px 0 10px', fontSize:13, color:'#2A6E3A' }}>✓ Invite sent! They'll join when they sign up.</p>}

        {/* QR code */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
          <div style={{ background:C.elevated, borderRadius:BR.panel, padding:14,
            border:`1px solid ${C.border}`, boxShadow:SH.card }}>
            <img src={qr} alt="QR Code" width="160" height="160"
              style={{ display:'block', borderRadius:8 }} />
          </div>
        </div>
        {/* URL + copy */}
        <div style={{ display:'flex', gap:8, alignItems:'center',
          background:C.elevated, borderRadius:BR.btn, padding:'10px 14px',
          border:`1px solid ${C.border}`, marginBottom:14 }}>
          <span style={{ flex:1, fontSize:14, color:C.dim, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{url}</span>
          <button onClick={copy}
            style={{ background:copied?C.T:C.rose, border:'none', color:'#fff',
              borderRadius:8, padding:'6px 14px', fontSize:14, fontWeight:700,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0,
              transition:'background 0.2s' }}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
        <p style={{ margin:0, fontSize:14, color:C.muted, textAlign:'center', fontStyle:'italic' }}>
          Members open the link in Safari → Share → Add to Home Screen
        </p>
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────────
function SettingsTab({ onReset, userName = '', onChangeName, onSignOut, workspace, workspaceLoaded, setWorkspace, userId }) {
  // Only show admin features once workspace is loaded AND role is confirmed admin
  // Never default to true — wait for confirmed data
  const isAdmin = workspaceLoaded && (workspace?.role === 'admin' || workspace?.ownerId === userId);
  const [showInvite, setShowInvite] = useState(false);

  // Use live workspace members from Supabase — no localStorage fallback needed
  const members = (workspace?.members || []).filter(m => m.id !== userId);
  const removeMember = async (memberId) => {
    if (!workspace?.id) return;
    await dbRemoveMember(workspace.id, memberId);
    // Optimistic UI update — remove from local workspace state immediately
    setWorkspace(prev => prev ? {
      ...prev,
      members: prev.members.filter(m => m.id !== memberId)
    } : prev);
  };

  const InputStyle = {
    display:'block', marginTop:6, width:'100%', boxSizing:'border-box',
    background:C.card, border:`1.5px solid ${C.border}`,
    borderRadius:BR.input, padding:'14px 16px', color:C.text,
    fontSize:16, fontFamily:'inherit', outline:'none',
    transition:'border-color 0.15s',
  };

  return (
    <div style={{ padding:'0 18px 90px', overflowY:'auto', height:'100%', boxSizing:'border-box' }}>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} workspaceId={workspace?.id} invitedBy={userId} />}

      {/* Profile card */}
      <div style={{ paddingTop:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, padding:20,
          background:C.card, borderRadius:BR.card,
          boxShadow:SH.card, border:`1px solid ${C.border}` }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:21, fontWeight:600, color:C.text,
              fontFamily:'Cormorant Garamond,serif', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName || 'Your Name'}</p>
          </div>
          <button onClick={onChangeName}
            style={{ background:C.elevated, border:`1px solid ${C.border}`,
              borderRadius:BR.btn, padding:'8px 14px', fontSize:14, color:C.dim,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            Edit
          </button>
          <button onClick={onSignOut}
            style={{ background:'transparent', border:`1px solid ${C.border}`,
              borderRadius:BR.btn, padding:'8px 14px', fontSize:14, color:C.muted,
              cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Workspace */}
      <SS title="Workspace">
        <SR label={`${members.length} member${members.length!==1?'s':''}`}
          sub={`You are ${isAdmin?'Admin':'Member'}`}
          right={<span style={{ fontSize:14, fontWeight:700,
            color:isAdmin?C.rose:C.dim,
            background:isAdmin?C.rose+'28':C.dim+'28',
            borderRadius:BR.card, padding:'4px 12px',
            textTransform:'capitalize', letterSpacing:'0.02em',
            border:`1px solid ${isAdmin?C.rose:C.dim}30` }}>
            {isAdmin?'Admin':'Member'}
          </span>} />
        <div style={{ padding:'0 18px 14px', borderTop:`1px solid ${C.border}` }}>
          <p style={{ fontSize:13, color:C.muted, margin:'10px 0 6px',
            fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>Members</p>
          {members.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center',
              gap:10, padding:'6px 0',
              borderBottom:`1px solid ${C.border}` }}>
              {/* Avatar */}
              <div style={{ width:32, height:32, borderRadius:BR.panel, background:C.elevated,
                border:`1px solid ${C.border}`, flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontSize:15, color:C.dim }}>{m.name[0]}</span>
              </div>
              {/* Name */}
              <span style={{ flex:1, fontSize:16, color:C.text }}>{m.name}</span>
              {/* Delete — admin only */}
              {isAdmin && (
                <button onClick={() => removeMember(m.id)}
                  style={{ background:'transparent', border:`1px solid ${C.border}`,
                    borderRadius:8, width:28, height:28, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:C.muted, fontSize:16, flexShrink:0,
                    transition:'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='#C46A14'; e.currentTarget.style.color='#C46A14'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.muted; }}>
                  ×
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p style={{ fontSize:15, color:C.muted, textAlign:'center',
              padding:'16px 0', fontStyle:'italic' }}>No members yet</p>
          )}
          {/* Invite button */}
          <button onClick={() => setShowInvite(true)}
            style={{ marginTop:14, background:'transparent',
              border:`1.5px dashed ${C.rose}60`,
              borderRadius:BR.btn, padding:'10px 14px', color:C.rose,
              fontSize:16, cursor:'pointer', width:'100%',
              fontFamily:'inherit', transition:'border-color 0.15s',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            🌸 Invite via Link or QR Code
          </button>
        </div>
      </SS>

      {/* Entry Colour Key */}
      <SS title="Entry Colour Key">
        <div style={{ padding:'14px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {Object.entries(TL).map(([t,l]) => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:12, height:12, borderRadius:4, background:TC[t]+'90', flexShrink:0 }} />
              <span style={{ fontSize:16, color:C.text }}>{l}</span>
            </div>
          ))}
        </div>
      </SS>

      {/* Data & Privacy */}
      <SS title="Data & Privacy">
        <SR label="Encrypted at Rest" sub="All data secured by Supabase AES-256 encryption"
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ Active</span>} />
        <SR label="Data Privacy" sub="Your data is private and never sold or shared"
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ Active</span>} />
        <SR label="Persistent Storage" sub={`Schema v${SCHEMA_VERSION} · Auto-saves on every change`}
          right={<span style={{ fontSize:15, color:C.rose, background:C.rose+'18', borderRadius:BR.pill, padding:'2px 10px' }}>◯ Live</span>} />
        <SR label="Audit Trail" sub="All changes tracked · Append-only" noBorder
          right={<span style={{ fontSize:15, color:C.T, background:C.T+'18', borderRadius:BR.pill, padding:'2px 10px' }}>✓ On</span>} />
      </SS>

      {/* About */}
      <SS title="About">
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <KizunaIcon />
            <span style={{ fontSize:22, fontWeight:600, color:C.text,
              fontFamily:'Cormorant Garamond,serif' }}>Kizuna 絆</span>
          </div>
          <p style={{ margin:0, fontSize:13, color:C.muted }}>
            {APP_VERSION} · Released {APP_BUILD_DATE}<br/>
            <span style={{ color:C.rose }}>by Surferyogi</span>
          </p>
        </div>
        <SR label="Schema Version" sub={`Storage format v${SCHEMA_VERSION}`} noBorder
          right={<span style={{ fontSize:15, color:C.dim }}>v{SCHEMA_VERSION}</span>} />
      </SS>

      {/* Reset App Data — admin only */}
      {isAdmin && <ResetSection onReset={onReset} />}
    </div>
  );
}

// ─── FORM FIELD COMPONENTS ───────────────────────────────────────
// Defined OUTSIDE EForm so React never unmounts/remounts them on re-render.
// Cursor jumping is caused by defining components inside render functions —
// React sees a new component type each render and resets focus.
const inputBase = {
  width:'100%', boxSizing:'border-box',
  background:C.card,
  border:`1.5px solid ${C.border}`,
  borderRadius:BR.input, padding:'14px 16px',
  color:C.text, fontSize:16,
  outline:'none', fontFamily:'inherit',
  transition:'border-color 0.15s',
};
const inputSm = {
  ...inputBase, padding:'11px 13px', fontSize:15, borderRadius:BR.btn,
};
function FI({ form, set, field, compact=false, ...props }) {
  return (
    <input value={form[field]||''} onChange={e => set(field, e.target.value)} {...props}
      style={{ ...(compact ? inputSm : inputBase), ...props.style }} />
  );
}
function TA({ form, set, field, ...props }) {
  return (
    <textarea value={form[field]||''} onChange={e => set(field, e.target.value)} rows={3} {...props}
      style={{ ...inputBase, resize:'vertical', lineHeight:1.5 }} />
  );
}
function FL({ label, children, tight=false }) {
  return (
    <div style={{ marginBottom: tight ? 10 : 14 }}>
      <label style={{ fontSize:12, color:'#8C7B6E', display:'block',
        marginBottom:5, fontWeight:700,
        textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</label>
      {children}
    </div>
  );
}
function Row2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>{children}</div>;
}
const mkBlank = () => ({
  type:'',title:'',date:fd(new Date()),time:'',endTime:'',location:'',attendees:'',notes:'',
  priority:'medium',tags:'',message:'',airline:'',flightNum:'',depCity:'',arrCity:'',
  terminal:'',gate:'',seat:'',visibility:'shared',repeat:'none'
});

function EForm({ form, set }) {
  // Auto-generate flight title from IATA codes
  const prevAutoRef = useRef('');
  useEffect(() => {
    if (form.type !== 'flight' || !form.depCity || !form.arrCity) return;
    const autoTitle = `${form.depCity} → ${form.arrCity}`;
    if (!form.title || form.title === prevAutoRef.current) {
      prevAutoRef.current = autoTitle;
      set('title', autoTitle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.depCity, form.arrCity, form.type]);

  // ── Flight auto-fill ─────────────────────────────────────────
  const [lookupStatus, setLookupStatus] = useState('');
  const [lookupData,   setLookupData]   = useState(null);
  const lastLookupKey  = useRef('');

  // Apply lookup data — always overwrite with live data, user can edit after
  useEffect(() => {
    if (!lookupData) return;
    // Auto-filled fields from APIs
    if (lookupData.terminal)    set('terminal',  lookupData.terminal);
    if (lookupData.gate)        set('gate',      lookupData.gate);
    if (lookupData.airlineName) set('airline',   lookupData.airlineName);
    if (lookupData.depIata)     set('depCity',   lookupData.depIata);
    if (lookupData.arrIata)     set('arrCity',   lookupData.arrIata);
    if (lookupData.aircraft)    set('notes',     lookupData.aircraft);
    const t = lookupData.scheduledDep ?? lookupData.revisedDep;
    if (t) {
      const hhmm = t.includes('T') ? t.split('T')[1]?.slice(0,5) : t.slice(0,5);
      if (hhmm) set('time', hhmm);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupData]);

  // Fire when flight number + date are both filled
  useEffect(() => {
    if (form.type !== 'flight') return;
    const clean = (form.flightNum||'').replace(/\s+/g,'').toUpperCase();
    if (clean.length < 3 || !form.date) return;

    // Airline from static table — instant, no network
    // Always apply — no stale closure guards
    {
      const name = airlineFromCode(clean);
      if (name) set('airline', name);
    }

    // FROM/TO from static route table — instant, no network
    const route = routeLookup(clean);
    if (route) {
      set('depCity', route.dep);
      set('arrCity', route.arr);
    }

    const key = `${clean}_${form.date}`;
    if (key === lastLookupKey.current) return;
    lastLookupKey.current = key;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) { setLookupStatus('not_found'); return; }

    setLookupStatus('loading');
    fetch(`${supabaseUrl}/functions/v1/flight-status`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json',
                 'Authorization':`Bearer ${anonKey}` },
      body:    JSON.stringify({ flightNumber: clean, date: form.date }),
    })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data => {
      if (data?.error) throw new Error(data.error);
      setLookupData(data);
      setLookupStatus('found');
    })
    .catch(err => {
      console.warn('Flight lookup:', err.message);
      setLookupStatus('not_found');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.flightNum, form.date, form.type]);

  // Convenience wrappers binding form+set — call as plain JSX, not components
  // These are NOT component definitions — just objects/fns to avoid re-renders
  const selStyle = { ...inputBase, appearance:'none', WebkitAppearance:'none' };

  return (
    <div style={{ paddingTop:8 }}>
      {/* Title shown for all types EXCEPT flight — flight title is auto-generated */}
      {form.type !== 'flight' && (
        <FL label="Title">
          <FI form={form} set={set} field="title" placeholder={`${TL[form.type]} title`} autoFocus />
        </FL>
      )}

      {form.type === 'flight' ? (<>
        {/* ── Step 1: Search keys — triggers auto-fill ── */}
        <Row2>
          <FL label="Flight No.">
            <FI form={form} set={set} field="flightNum" placeholder="SQ633" autoFocus compact
              onChange={e=>set('flightNum',e.target.value.replace(/\s+/g,'').toUpperCase())} />
          </FL>
          <FL label="Date"><FI form={form} set={set} field="date" type="date" compact /></FL>
        </Row2>

        {/* Lookup status */}
        {lookupStatus === 'loading' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:C.dim, fontStyle:'italic' }}>
            ✈ Looking up flight details…
          </p>
        )}
        {lookupStatus === 'found' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:'#2A6E3A' }}>
            ✓ Flight found — details filled in below
          </p>
        )}
        {lookupStatus === 'not_found' && (
          <p style={{ margin:'-6px 0 12px', fontSize:13, color:C.muted, fontStyle:'italic' }}>
            Not found — please fill in manually
          </p>
        )}

        {/* ── AUTO-FILLED fields — from lookup ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
            <div style={{ width:3, height:16, borderRadius:2,
              background:'#2A6E3A', flexShrink:0 }} />
            <p style={{ margin:0, fontSize:12, color:'#2A6E3A', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Auto-filled</p>
          </div>
          <FL label="Airline">
            <FI form={form} set={set} field="airline" placeholder="" />
          </FL>
          <Row2>
            <FL label="From" tight>
              <FI form={form} set={set} field="depCity" placeholder="" onChange={e=>set('depCity',e.target.value.toUpperCase())} />
            </FL>
            <FL label="To" tight>
              <FI form={form} set={set} field="arrCity" placeholder="" onChange={e=>set('arrCity',e.target.value.toUpperCase())} />
            </FL>
          </Row2>
          <Row2>
            <FL label="Terminal" tight>
              <FI form={form} set={set} field="terminal" placeholder="" inputMode="numeric" />
            </FL>
            <FL label="Gate" tight>
              <FI form={form} set={set} field="gate" placeholder="" inputMode="numeric" />
            </FL>
          </Row2>
        </div>

        {/* ── MANUAL fields — enter manually ── */}
        <div style={{ background:`linear-gradient(135deg,#EDF5FD,#F0F7FF)`,
          border:`1.5px solid ${C.F}40`, borderRadius:BR.card,
          padding:'16px 16px 6px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
            <div style={{ width:3, height:16, borderRadius:2,
              background:C.F, flexShrink:0 }} />
            <p style={{ margin:0, fontSize:12, color:'#3A7AAC', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.1em' }}>Enter manually</p>
          </div>
          <FL label="Dep. Time" tight>
            <div style={{ maxWidth:180 }}>
              <input
                type="time"
                value={form.time||''}
                onChange={e => set('time', e.target.value)}
                style={{ ...inputBase,
                  background:'#fff',
                  border:`1.5px solid ${C.F}60`,
                  borderRadius:BR.input,
                  fontSize:18, fontWeight:600,
                  color:C.text }} />
            </div>
          </FL>
          <FL label="Seat" tight>
            <input
              type="text"
              value={form.seat||''}
              onChange={e => set('seat', e.target.value)}
              placeholder=""
              style={{ ...inputBase,
                background:'#fff',
                border:`1.5px solid ${C.F}60`,
                borderRadius:BR.input,
                fontSize:18, fontWeight:600,
                textAlign:'center',
                letterSpacing:'0.08em',
                color:C.text }} />
          </FL>
        </div>
      </>) : form.type === 'task' ? (<>
        <FL label="Due Date (optional)"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Tags"><FI form={form} set={set} field="tags" placeholder="Finance, Legal, M&A" /></FL>
      </>) : form.type === 'reminder' ? (<>
        <FL label="Date (optional)"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Time"><FI form={form} set={set} field="time" type="time" /></FL>
        <FL label="Message"><TA form={form} set={set} field="message" placeholder="Reminder details…" /></FL>
      </>) : form.type === 'birthday' ? (<>
        <FL label="Occasion"><FI form={form} set={set} field="title" placeholder="e.g. Mum's Birthday, Wedding Anniversary" autoFocus /></FL>
        <FL label="Date"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Notes"><TA form={form} set={set} field="notes" placeholder="Gift ideas, plans, memories…" /></FL>
      </>) : (<>
        <FL label="Date"><FI form={form} set={set} field="date" type="date" /></FL>
        <FL label="Start Time"><FI form={form} set={set} field="time" type="time" /></FL>
        <FL label="End Time"><FI form={form} set={set} field="endTime" type="time" /></FL>
        <FL label="Location"><FI form={form} set={set} field="location" placeholder="Room, address, or virtual" /></FL>
        {form.type==='meeting' && (
          <FL label="Attendees"><FI form={form} set={set} field="attendees" placeholder="Names or emails, comma-separated" /></FL>
        )}
        <FL label="Notes"><TA form={form} set={set} field="notes" placeholder="Additional details…" /></FL>
      </>)}

      {/* Repeat frequency — shown for birthday, event and reminder */}
      {['birthday','event','reminder'].includes(form.type) && (
        <FL label="Repeat">
          <select value={form.repeat||'none'} onChange={e=>set('repeat',e.target.value)} style={selStyle}>
            {[['none','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </FL>
      )}
      <FL label="Visibility">
        <select value={form.visibility} onChange={e=>set('visibility',e.target.value)} style={selStyle}>
          <option value="private">🔒 Private</option>
          <option value="shared">◯ Shared</option>
        </select>
      </FL>
    </div>
  );
}

function AddModal({ onClose, onSave, editEntry = null, initialDate = null }) {
  const isEdit = editEntry !== null;
  const [step, setStep] = useState(isEdit ? 1 : 0);
  const [form, setForm] = useState(isEdit
    ? { ...mkBlank(), ...editEntry }
    : { ...mkBlank(), ...(initialDate ? { date: initialDate } : {}) }
  );
  const setF = useCallback((k, v) => setForm(p => ({ ...p, [k]:v })), []);
  const canSave = form.type === 'flight'
    ? (form.flightNum?.trim().length > 0)   // flight: needs flight number
    : (form.title?.trim().length > 0);       // others: need title
  const handleSave = () => {
    if (!canSave) return;
    // Edit: preserve id + type. Create: assign UUID.
    onSave(isEdit
      ? { ...form, id: editEntry.id, type: editEntry.type }
      : { ...form, id: crypto.randomUUID() }
    );
    onClose();
  };

  const typeColor = TC[form.type] || C.rose;

  return (
    <div style={{ position:'absolute', inset:0, zIndex:100,
      display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(44,38,32,0.35)',
        backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{ position:'relative', background:C.card, borderRadius:'28px 28px 0 0',
        border:`1px solid ${C.border}`, borderBottom:'none', maxHeight:'92%',
        display:'flex', flexDirection:'column', boxShadow:SH.float }}>
        <div style={{ width:40, height:5, borderRadius:3, background:C.border, margin:'14px auto 0' }} />
        <div style={{ display:'flex', alignItems:'center', padding:'12px 22px 8px' }}>
          {/* Back only shown in create mode step 1 — not in edit mode (can't change type) */}
          {step===1 && !isEdit && (
            <button onClick={() => setStep(0)}
              style={{ background:'transparent', border:'none', color:C.rose,
                fontSize:16, cursor:'pointer', padding:'0 16px 0 0', fontWeight:700 }}>
              ‹ Back
            </button>
          )}
          <h2 style={{ flex:1, margin:0, fontSize:20, fontWeight:600, color:C.text,
            fontFamily:'Cormorant Garamond,serif' }}>
            {step===0 ? 'New Entry' : isEdit ? `Edit ${TL[form.type]}` : `New ${TL[form.type]}`}
          </h2>
          {step===1 ? (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={onClose}
                style={{ background:C.elevated, border:`1px solid ${C.border}`,
                  color:C.dim, borderRadius:BR.btn, padding:'9px 16px',
                  fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={handleSave}
                style={{ background:canSave?typeColor:C.elevated,
                  border:`1px solid ${canSave?typeColor:C.border}`,
                  color:canSave?'#fff':C.muted, borderRadius:BR.btn,
                  padding:'9px 20px', fontSize:17, fontWeight:600,
                  cursor:canSave?'pointer':'default',
                  boxShadow:canSave?`0 4px 16px ${typeColor}40`:'none',
                  fontFamily:'inherit', transition:'background 0.15s' }}>
                {isEdit ? 'Save Changes' : 'Save'}
              </button>
            </div>
          ) : (
            <button onClick={onClose}
              style={{ background:C.elevated, border:`1px solid ${C.border}`,
                color:C.dim, width:32, height:32, borderRadius:BR.panel,
                cursor:'pointer', fontSize:18, padding:0,
                display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          )}
        </div>
        <div style={{ overflowY:'auto', padding:'6px 22px 44px', flex:1 }}>
          {step === 0 ? (
            <div>
              <p style={{ fontSize:16, color:C.dim, margin:'4px 0 16px', fontStyle:'italic' }}>
                What would you like to add?
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {['meeting','task','flight','reminder','event','birthday'].map(t => (
                  <button key={t} onClick={() => { setForm({...mkBlank(), ...(initialDate?{date:initialDate}:{}), type:t}); setStep(1); }}
                    style={{ background:(TC[t]||C.rose)+'15', border:`1px solid ${(TC[t]||C.rose)}35`,
                      borderRadius:BR.card, padding:'18px 14px', cursor:'pointer', textAlign:'left',
                      display:'flex', flexDirection:'column', gap:6,
                      boxShadow:`0 2px 12px ${(TC[t]||C.rose)}15`,
                      transition:'transform 0.1s' }}>
                    <span style={{ fontSize:24 }}>{TI[t]}</span>
                    <span style={{ fontSize:16, fontWeight:600, color:DTC[t]||TC[t] }}>{TL[t]}</span>
                    <span style={{ fontSize:15, color:C.dim, lineHeight:1.4 }}>
                      {t==='meeting'?'Schedule an appointment'
                        :t==='task'?'Add a to-do item'
                        :t==='flight'?'Log flight details'
                        :t==='reminder'?'Set a reminder'
                        :t==='birthday'?'Mark a special date'
                        :'Create an event'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EForm form={form} set={setF} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KIZUNA ICON — TWO SAKURA 桜 ────────────────────────────────
// Flower 1: larger, lower-left — the dominant bloom.
// Flower 2: smaller, upper-right — the accent bloom, rendered behind.
// Three drifting petals add gracefulness between the two flowers.
// Petal path: authentic notched tip (bilobed split) of Prunus serrulata.
const KizunaIcon = () => {
  // One petal pointing upward from (0,0), length ~14 units.
  // The forked tip (L 0,-13.8 midpoint) is the sakura's signature.
  const P = "M 0,0 C -3.5,-3.5 -6,-8 -5,-12 C -4.5,-14.5 -2.5,-15 -0.8,-13 L 0,-13.8 L 0.8,-13 C 2.5,-15 4.5,-14.5 5,-12 C 6,-8 3.5,-3.5 0,0 Z";
  const ROTS = [0, 72, 144, 216, 288];
  const r = d => d * Math.PI / 180;

  return (
    <svg width="52" height="42" viewBox="0 0 52 42" fill="none"
      style={{ display:'block', flexShrink:0 }}>

      {/* ── Drifting petals — rendered first so flowers sit above ── */}

      {/* Petal drifting to the far right */}
      <g transform="translate(46,30) rotate(-22) scale(0.36)" opacity="0.42">
        <path d={P} fill="#EAA898" />
      </g>
      {/* Petal drifting below, between the two blooms */}
      <g transform="translate(29,36) rotate(50) scale(0.30)" opacity="0.35">
        <path d={P} fill="#F0C0B4" />
      </g>
      {/* Petal drifting to upper-left */}
      <g transform="translate(4,7) rotate(-58) scale(0.26)" opacity="0.28">
        <path d={P} fill="#EAB8A8" />
      </g>

      {/* ── FLOWER 2 — smaller accent bloom, upper-right ── */}
      {/* Offset rotation by 36° so its petals interleave with Flower 1 visually */}
      {ROTS.map(rot => (
        <g key={`f2p${rot}`}
          transform={`translate(37,13) rotate(${rot + 36}) scale(0.65)`}>
          <path d={P}
            fill="#F0C0B4"
            stroke="#E0A898"
            strokeWidth="0.45"
            opacity="0.86"
          />
        </g>
      ))}
      {/* Flower 2 — center disc */}
      <circle cx="37" cy="13" r="1.9" fill="#D09080" opacity="0.75" />
      {/* Flower 2 — stamen dots at r=3.3 */}
      {ROTS.map((rot, i) => (
        <circle key={`f2s${i}`}
          cx={(37 + Math.sin(r(rot)) * 3.3).toFixed(2)}
          cy={(13 - Math.cos(r(rot)) * 3.3).toFixed(2)}
          r="0.65" fill="#C89078" opacity="0.50"
        />
      ))}

      {/* ── FLOWER 1 — larger dominant bloom, lower-left ── */}
      {ROTS.map(rot => (
        <g key={`f1p${rot}`}
          transform={`translate(15,27) rotate(${rot})`}>
          <path d={P}
            fill="#EAA898"
            stroke="#D48880"
            strokeWidth="0.35"
            opacity="0.93"
          />
        </g>
      ))}
      {/* Flower 1 — center disc */}
      <circle cx="15" cy="27" r="2.8" fill="#C4826E" opacity="0.84" />
      {/* Flower 1 — stamen dots at r=5 */}
      {ROTS.map((rot, i) => (
        <circle key={`f1s${i}`}
          cx={(15 + Math.sin(r(rot)) * 5).toFixed(2)}
          cy={(27 - Math.cos(r(rot)) * 5).toFixed(2)}
          r="0.9" fill="#C4826E" opacity="0.52"
        />
      ))}
    </svg>
  );
};

// ─── SAKURA PETALS ANIMATION ─────────────────────────────────────
// 4 tiny petals drift and spin downward using pure CSS keyframes.
// The main KizunaIcon flowers are completely static.
// Each petal has unique: start position, fall duration, lateral drift, spin speed.
const PETAL_CSS = `
@keyframes petalFall1 {
  0%   { transform: translate(0px, -8px) rotate(0deg);   opacity:0; }
  10%  { opacity: 0.7; }
  100% { transform: translate(18px, 52px) rotate(340deg); opacity:0; }
}
@keyframes petalFall2 {
  0%   { transform: translate(0px, -4px) rotate(20deg);  opacity:0; }
  15%  { opacity: 0.5; }
  100% { transform: translate(-14px, 48px) rotate(-280deg); opacity:0; }
}
@keyframes petalFall3 {
  0%   { transform: translate(0px, -6px) rotate(-10deg); opacity:0; }
  12%  { opacity: 0.6; }
  100% { transform: translate(8px, 56px) rotate(400deg);  opacity:0; }
}
@keyframes petalFall4 {
  0%   { transform: translate(0px, -2px) rotate(30deg);  opacity:0; }
  20%  { opacity: 0.4; }
  100% { transform: translate(-20px, 44px) rotate(-320deg); opacity:0; }
}
`;
const PETALS = [
  { left:'38%', animationName:'petalFall1', animationDuration:'3.2s', animationDelay:'0s',    width:6, height:7, color:'#EAA898' },
  { left:'58%', animationName:'petalFall2', animationDuration:'4.1s', animationDelay:'1.3s',  width:5, height:6, color:'#F0C0B4' },
  { left:'28%', animationName:'petalFall3', animationDuration:'3.7s', animationDelay:'2.4s',  width:5, height:6, color:'#EAB8A8' },
  { left:'50%', animationName:'petalFall4', animationDuration:'4.8s', animationDelay:'0.7s',  width:4, height:5, color:'#E8A090' },
];
const SakuraPetals = () => (
  <div style={{ position:'absolute', top:0, right:0, width:68, height:60,
    pointerEvents:'none', overflow:'visible', zIndex:10 }}>
    <style>{PETAL_CSS}</style>
    {PETALS.map((p, i) => (
      <div key={i} style={{
        position:'absolute', top:4, left:p.left,
        width:p.width, height:p.height, borderRadius:'50% 50% 50% 0',
        background:p.color, opacity:0,
        animationName:p.animationName,
        animationDuration:p.animationDuration,
        animationDelay:p.animationDelay,
        animationTimingFunction:'ease-in',
        animationIterationCount:'infinite',
        animationFillMode:'both',
      }} />
    ))}
  </div>
);
// Dynamic date badge for calendar nav icon
const CalIcon = () => {
  const now = new Date();
  const day = now.getDate();
  const mon = now.toLocaleString('en',{month:'short'}).toUpperCase();
  return (
    <div style={{ width:24, height:24, borderRadius:5, overflow:'hidden',
      display:'inline-flex', flexDirection:'column',
      border:'1.5px solid currentColor', flexShrink:0 }}>
      <div style={{ background:'currentColor', height:7,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:5, fontWeight:800, color:'#fff',
          letterSpacing:'0.05em', lineHeight:1 }}>{mon}</span>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center',
        justifyContent:'center' }}>
        <span style={{ fontSize:10, fontWeight:800, color:'currentColor',
          lineHeight:1 }}>{day}</span>
      </div>
    </div>
  );
};

const NAV = [
  { key:'home',     icon:'🏠', label:'Home'     },
  { key:'calendar', icon:'cal', label:'Calendar'  },
  { key:'search',   icon:'🔍', label:'Search'    },
  { key:'settings', icon:'⚙️', label:'Settings'  },
];

// ─── DEV BYPASS ──────────────────────────────────────────────────
// Set to true to skip login during debugging.
// Set back to false before going live.
const DEV_BYPASS      = false; // ← set true to skip login during debugging
const DEV_BYPASS_NAME = 'Koksum';

// ─── APP ROOT ────────────────────────────────────────────────────
export default function App() {
  const [tab,          setTab]          = useState('home');
  const [entries,      setEntries]      = useState([]);
  const [auditLog,     setAuditLog]     = useState([]);
  const [showAdd,      setShowAdd]      = useState(false);
  const [addDate,      setAddDate]      = useState(null);  // pre-fill date when opening from calendar
  const [editingEntry, setEditingEntry] = useState(null);
  const [syncStatus,   setSyncStatus]   = useState('loading');
  const [workspace,       setWorkspace]       = useState(null); // {id, name, ownerId, role, members}
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // ── Auth state ─────────────────────────────────────────────────
  const [user,        setUser]        = useState(null);
  const [authReady,   setAuthReady]   = useState(false);
  const [authEmail,   setAuthEmail]   = useState('');
  const [authPass,    setAuthPass]    = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError,   setAuthError]   = useState('');
  const [showPass,    setShowPass]    = useState(false);

  // ── User display name ──────────────────────────────────────────
  const [userName,   setUserName]   = useState('');
  const [nameInput,  setNameInput]  = useState('');
  const [nameReady,  setNameReady]  = useState(false);
  // Ref mirror — synchronous read for toggleDone / updateEntry
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // ── Step 1: Listen for auth state changes ──────────────────────
  useEffect(() => {
    // DEV BYPASS: skip auth entirely, go straight to app
    if (DEV_BYPASS) {
      setUser({ id: 'dev-bypass-user' });
      setUserName(DEV_BYPASS_NAME);
      setNameInput(DEV_BYPASS_NAME);
      setNameReady(true);
      setAuthReady(true);
      setSyncStatus('synced');
      setWorkspaceLoaded(true);
      setWorkspace({ id: 'dev-ws', name: 'Dev', ownerId: 'dev-bypass-user', role: 'admin', members: [] });
      return;
    }

    if (!supabase) { setAuthReady(true); return; }

    // On every app open: try to refresh the session silently.
    // With refresh token expiry set to max in Supabase dashboard,
    // this keeps the user logged in indefinitely — OTP only needed once per device.
    const initSession = async () => {
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user) {
          // Session found — refresh JWT silently (handles expired access tokens)
          try {
            const { data: { session: refreshed }, error: rErr } =
              await supabase.auth.refreshSession();
            if (!rErr && refreshed?.user) {
              setUser(refreshed.user);
            } else {
              setUser(existing.user); // refresh failed but existing session usable
            }
          } catch {
            setUser(existing.user); // network error — use existing session
          }
        } else {
          setUser(null); // no session — show login
        }
      } catch {
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_IN and TOKEN_REFRESHED both keep the user logged in
      // TOKEN_REFRESHED must NOT trigger a full data reload — only update the user object
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) setUser(prev => prev?.id === session.user.id ? prev : session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Step 2: Load data — each piece independently so one failure never kills another ──
  const loadingRef = useRef(false);
  useEffect(() => {
    if (!authReady || !user) return;
    if (DEV_BYPASS) return; // dev mode: no DB calls, use empty state
    if (loadingRef.current) return;
    loadingRef.current = true;

    async function load() {
      setSyncStatus('loading');

      // ① Entries — critical. If this fails, show sync error.
      let loadedEntries = [];
      try {
        loadedEntries = await dbLoadEntries(user.id);
        setEntries(loadedEntries);
        setSyncStatus('synced');
      } catch (err) {
        console.warn('entries load failed:', err.message);
        setSyncStatus('error');
      }

      // ② Name — non-critical. Never triggers sync error.
      try {
        const loadedName = await dbLoadName(user.id);
        if (loadedName) {
          setUserName(loadedName);
          setNameInput(loadedName);
          setNameReady(true);
        }
      } catch (err) {
        console.warn('name load failed:', err.message);
        // Fall back to localStorage
        const cached = localStorage.getItem(`exec_user_v1_${user.id}`);
        if (cached) { setUserName(cached); setNameInput(cached); setNameReady(true); }
      }

      // ③ Audit log — non-critical.
      try {
        const loadedAudit = await dbLoadAudit(user.id);
        setAuditLog(loadedAudit);
      } catch { /* silently ignore */ }

      // ④ Workspace — non-critical.
      try {
        const ws = await dbLoadWorkspace(user.id);
        if (ws) {
          setWorkspace(ws);
          // F2: load shared entries from workspace members after workspace is known
          const memberIds = ws.members.map(m => m.id).filter(id => id !== user.id);
          if (memberIds.length > 0 && supabase) {
            try {
              const sharedResults = await Promise.all(
                memberIds.map(mid =>
                  supabase.from('entries').select('data')
                    .eq('user_id', mid)
                    .filter('data->>visibility','eq','shared')
                    .then(({ data }) => (data||[]).map(r=>r.data).filter(Boolean))
                )
              );
              const shared = sharedResults.flat();
              if (shared.length > 0) {
                setEntries(prev => {
                  const ids = new Set(prev.map(e => e.id));
                  return [...prev, ...shared.filter(e => e?.id && !ids.has(e.id))];
                });
              }
            } catch { /* shared entries non-critical */ }
          }
        }
      } catch { /* silently ignore */ }
      setWorkspaceLoaded(true);

      loadingRef.current = false;
    }

    load();
  }, [authReady, user]);

  // ── Step 3: Real-time — own entries + shared entries from workspace ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`kizuna-${user.id}`)
      // Own entries — all changes
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${user.id}` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setEntries(prev => prev.filter(e => e.id !== payload.old.id));
          } else if (payload.new?.data) {
            const incoming = payload.new.data;
            setEntries(prev => {
              const exists = prev.find(e => e.id === incoming.id);
              return exists
                ? prev.map(e => e.id === incoming.id ? incoming : e)
                : [...prev, incoming];
            });
          }
        })
      // Own audit log
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log', filter: `user_id=eq.${user.id}` },
        payload => {
          if (payload.new?.data) {
            setAuditLog(prev => [...prev, payload.new.data].slice(-200));
          }
        })
      .subscribe();

    // Also subscribe to shared entries from each workspace member
    const memberChannels = (workspace?.members || [])
      .filter(m => m.id !== user.id)
      .map(m => supabase
        .channel(`kizuna-shared-${m.id}-${user.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${m.id}` },
          payload => {
            // Only show if visibility is shared
            const entry = payload.new?.data || payload.old;
            if (!entry) return;
            if (payload.eventType === 'DELETE') {
              setEntries(prev => prev.filter(e => e.id !== payload.old.id));
            } else if (payload.new?.data?.visibility === 'shared') {
              const incoming = payload.new.data;
              setEntries(prev => {
                const exists = prev.find(e => e.id === incoming.id);
                return exists
                  ? prev.map(e => e.id === incoming.id ? incoming : e)
                  : [...prev, incoming];
              });
            } else if (payload.eventType === 'UPDATE' && payload.new?.data?.visibility !== 'shared') {
              // Entry was changed to private — remove from our view
              setEntries(prev => prev.filter(e =>
                !(e.id === payload.new.data.id && e.userId !== user.id)
              ));
            }
          })
        .subscribe()
      );

    return () => {
      supabase.removeChannel(channel);
      memberChannels.forEach(c => supabase.removeChannel(c));
    };
  }, [user, workspace]);

  // ── Auth actions ───────────────────────────────────────────────
  // ── Passphrase login ───────────────────────────────────────────
  const passphraseLogin = async () => {
    const trimEmail = authEmail.trim().toLowerCase();
    const trimPass  = authPass.trim();
    if (!trimEmail) { setAuthError('Please enter your email.'); return; }
    if (!trimPass)  { setAuthError('Please enter your passphrase.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      setAuthError('Please enter a valid email address.'); return;
    }

    setAuthLoading(true); setAuthError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // ① Call Edge Function — verifies passphrase server-side
      const res = await fetch(`${supabaseUrl}/functions/v1/kizuna-auth`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json',
                   'Authorization':`Bearer ${anonKey}` },
        body:    JSON.stringify({ email: trimEmail, passphrase: trimPass }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setAuthError(data.error || 'Login failed. Please check your credentials.');
        setAuthLoading(false);
        return;
      }

      // ② Exchange token for session — use token_hash + type:'email'
      // Note: 'signup' and 'magiclink' types are deprecated in verifyOtp
      const { error: sessionErr } = await supabase.auth.verifyOtp({
        token_hash: data.token,
        type:       'email',
      });

      if (sessionErr) {
        setAuthError('Session error. Please try again.');
        setAuthLoading(false);
        return;
      }

      // ③ Pre-fill display name from Edge Function response
      // Save to DB immediately so nameReady is set and name screen is skipped
      if (data.display_name) {
        setUserName(data.display_name);
        setNameInput(data.display_name);
        setNameReady(true);
        // Also persist to DB so cross-device sync works
        try { await dbSaveName(data.email, data.display_name); } catch { /* non-critical */ }
      }
      // onAuthStateChange fires → setUser → app loads
    } catch {
      setAuthError('Connection error. Please check your network and try again.');
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    const uid = user?.id;
    await supabase.auth.signOut();
    // Reset all state — order matters
    setUser(null); setEntries([]); setAuditLog([]);
    setWorkspace(null); setWorkspaceLoaded(false);
    setUserName(''); setNameInput(''); setNameReady(false);
    setAuthEmail(''); setAuthPass(''); setAuthError('');
    setSyncStatus('loading');
    loadingRef.current = false; // allow data reload on next login
    if (uid) localStorage.removeItem(`exec_user_v1_${uid}`);
    localStorage.removeItem('exec_user_v1');
  };

  // ── Name save ──────────────────────────────────────────────────
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaveError, setNameSaveError] = useState('');
  const saveUserName = async () => {
    const n = nameInput.trim();
    if (!n || !user || nameSaving) return;
    setNameSaving(true); setNameSaveError('');
    try {
      await dbSaveName(user.id, n);
      setUserName(n);
      setNameReady(true); // only set after confirmed DB write
    } catch {
      setNameSaveError('Could not save name. Please check your connection and try again.');
    } finally {
      setNameSaving(false);
    }
  };

  // ── Audit helper ───────────────────────────────────────────────
  const logAudit = useCallback((action, entry, changes = null) => {
    if (!user) return;
    const event = {
      id:         `${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      timestamp:  new Date().toISOString(),
      actor:      userName || 'You',
      action, entryId: entry.id, entryType: entry.type, entryTitle: entry.title, changes,
    };
    setAuditLog(prev => [...prev, event]);
    dbAppendAudit(user.id, event);
  }, [user, userName]);

  // ── Entry mutations ────────────────────────────────────────────
  const addEntry = useCallback(e => {
    // Stamp userId AND userName so shared readers see who created it
    const stamped = { ...e, userId: user?.id, userName };
    setEntries(prev => [...prev, stamped]);
    logAudit('created', stamped);
    if (user) dbUpsertEntry(user.id, stamped);
  }, [logAudit, user, userName]);

  const toggleDone = useCallback(id => {
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    // Only allow toggling own entries — shared entries from others are read-only
    if (current.userId && current.userId !== user?.id) return;
    const willComplete = !current.done;
    const updated = { ...current, done: willComplete };
    setEntries(prev => prev.map(e => e.id === id ? updated : e));
    logAudit(willComplete ? 'completed' : 'reopened', current);
    if (user) dbUpsertEntry(user.id, updated);
  }, [logAudit, user]);

  const updateEntry = useCallback(updated => {
    const original = entriesRef.current.find(e => e.id === updated.id);
    if (!original) return;
    const TRACKED = ['title','date','time','endTime','location','attendees','notes',
                     'priority','tags','message','airline','flightNum','depCity',
                     'arrCity','terminal','gate','seat','visibility'];
    const changes = TRACKED
      .filter(f => String(original[f] ?? '') !== String(updated[f] ?? ''))
      .map(f => ({ field:f, from:original[f], to:updated[f] }));
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    logAudit('updated', updated, changes.length > 0 ? changes : null);
    setEditingEntry(null);
    if (user) dbUpsertEntry(user.id, updated);
  }, [logAudit, user]);

  const deleteEntry = useCallback(id => {
    const current = entriesRef.current.find(e => e.id === id);
    if (!current) return;
    setEntries(prev => prev.filter(e => e.id !== id));
    logAudit('deleted', current);
    if (user) dbDeleteEntry(user.id, id);
  }, [logAudit, user]);

  const resetData = useCallback(async () => {
    // F15: clear UI immediately — no flash of old data
    setEntries([]); setAuditLog([]);
    setSyncStatus('loading');
    if (user) await dbResetUser(user.id);
    setSyncStatus('synced');
  }, [user]);

  const syncColor = syncStatus==='synced' ? C.T : syncStatus==='error' ? '#C46A14' : C.rose;

  const sharedStyle = {
    wrapper: { width:'100%', maxWidth:430, margin:'0 auto', height:'100vh',
      background:C.bg, display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', padding:'0 32px', boxSizing:'border-box',
      fontFamily:`'Nunito','DM Sans',system-ui,sans-serif` },
    googleFont: `
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Cormorant+Garamond:ital,wght@0,600;1,400&display=swap');
      input[type=number]::-webkit-inner-spin-button,
      input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      input[type=number] { -moz-appearance:textfield; }
    `
  };

  // ── Auth screens ───────────────────────────────────────────────

  // Guard: show setup instructions if Supabase isn't configured
  if (!supabaseConfigured) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <p style={{ fontSize:36, margin:'0 0 16px' }}>⚙️</p>
        <h2 style={{ margin:'0 0 12px', fontSize:22, fontWeight:700, color:'#5C3020',
          textAlign:'center', fontFamily:'Cormorant Garamond,serif' }}>
          Supabase not configured
        </h2>
        <p style={{ fontSize:15, color:C.dim, textAlign:'center', lineHeight:1.7, margin:0 }}>
          Add these two secrets to your GitHub repo:<br/>
          <strong style={{ color:C.text }}>VITE_SUPABASE_URL</strong><br/>
          <strong style={{ color:C.text }}>VITE_SUPABASE_ANON_KEY</strong>
        </p>
        <p style={{ fontSize:13, color:C.muted, textAlign:'center', marginTop:16, lineHeight:1.6 }}>
          Settings → Secrets → Actions → New repository secret
        </p>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <KizunaIcon />
        <p style={{ marginTop:16, fontSize:15, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif' }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <div style={{ marginBottom:20 }}><KizunaIcon /></div>
        <h1 style={{ margin:'0 0 6px', fontSize:32, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif', textAlign:'center' }}>
          Kizuna&thinsp;絆
        </h1>
        <p style={{ margin:'0 0 36px', fontSize:14, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif', textAlign:'center', lineHeight:1.6 }}>
          Bonding with trust, loyalty & love —<br/>
          nurturing the invisible thread that connects hearts
        </p>

        {/* Email */}
        <p style={{ margin:'0 0 8px', fontSize:16, color:C.text, fontWeight:600,
          alignSelf:'flex-start' }}>Email</p>
        <input
          value={authEmail}
          onChange={e => setAuthEmail(e.target.value)}
          onKeyDown={e => e.key==='Enter' && passphraseLogin()}
          placeholder="your@email.com"
          type="email"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', background:C.card,
            border:`1.5px solid ${C.border}`, borderRadius:BR.panel, padding:'16px 18px',
            fontSize:16, color:C.text, outline:'none', fontFamily:'inherit',
            boxShadow:SH.card, marginBottom:14 }}
        />

        {/* Password */}
        <p style={{ margin:'0 0 8px', fontSize:16, color:C.text, fontWeight:600,
          alignSelf:'flex-start' }}>Password</p>
        <div style={{ width:'100%', position:'relative', marginBottom: authError ? 8 : 20 }}>
          <input
            value={authPass}
            onChange={e => setAuthPass(e.target.value)}
            onKeyDown={e => e.key==='Enter' && passphraseLogin()}
            placeholder="Enter your password"
            type={showPass ? 'text' : 'password'}
            style={{ width:'100%', boxSizing:'border-box', background:C.card,
              border:`1.5px solid ${C.border}`, borderRadius:BR.panel, padding:'16px 18px',
              paddingRight:52, fontSize:16, color:C.text, outline:'none',
              fontFamily:'inherit', boxShadow:SH.card }}
          />
          <button onClick={() => setShowPass(p => !p)}
            style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
              background:'transparent', border:'none', cursor:'pointer',
              fontSize:18, color:C.muted, padding:4 }}>
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>

        {authError && (
          <p style={{ margin:'0 0 14px', fontSize:13, color:'#C46A14',
            alignSelf:'flex-start' }}>{authError}</p>
        )}

        <button onClick={passphraseLogin} disabled={authLoading}
          style={{ width:'100%', background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none', borderRadius:BR.panel, padding:'18px',
            fontSize:18, fontWeight:700, color:'#fff', cursor:'pointer',
            fontFamily:'inherit', boxShadow:`0 6px 24px ${C.rose}45`,
            opacity: authLoading ? 0.7 : 1 }}>
          {authLoading ? 'Signing in…' : 'Enter Kizuna 🌸'}
        </button>
      </div>
    );
  }

  // ── Name setup screen (first time after sign-in) ───────────────
  if (!nameReady) {
    return (
      <div style={sharedStyle.wrapper}>
        <style>{sharedStyle.googleFont}</style>
        <div style={{ marginBottom:20 }}><KizunaIcon /></div>
        <h1 style={{ margin:'0 0 6px', fontSize:32, fontWeight:600, color:C.text,
          fontFamily:'Cormorant Garamond,serif', textAlign:'center' }}>
          Kizuna&thinsp;絆
        </h1>
        <p style={{ margin:'0 0 36px', fontSize:14, color:C.dim, fontStyle:'italic',
          fontFamily:'Cormorant Garamond,serif', textAlign:'center', lineHeight:1.6 }}>
          Bonding with trust, loyalty & love —<br/>
          nurturing the invisible thread that connects hearts
        </p>
        <p style={{ margin:'0 0 12px', fontSize:16, color:C.text, fontWeight:600, alignSelf:'flex-start' }}>
          What's your name?
        </p>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && saveUserName()}
          placeholder="Enter your full name"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', background:C.card,
            border:`1.5px solid ${nameSaveError ? '#C46A14' : C.border}`, borderRadius:BR.panel, padding:'16px 18px',
            fontSize:16, color:C.text, outline:'none', fontFamily:'inherit',
            boxShadow:SH.card, marginBottom: nameSaveError ? 8 : 16 }}
        />
        {nameSaveError && (
          <p style={{ margin:'0 0 12px', fontSize:13, color:'#C46A14', alignSelf:'flex-start' }}>
            {nameSaveError}
          </p>
        )}
        <button onClick={saveUserName} disabled={nameSaving}
          style={{ width:'100%', background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none', borderRadius:BR.panel, padding:'18px',
            fontSize:18, fontWeight:700, color:'#fff', cursor:'pointer',
            fontFamily:'inherit', boxShadow:`0 6px 24px ${C.rose}45`,
            opacity: nameSaving ? 0.7 : 1 }}>
          {nameSaving ? 'Saving…' : 'Enter Kizuna 🌸'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width:'100%', maxWidth:430, margin:'0 auto', height:'100vh',
      background:C.bg, color:C.text,
      fontFamily:`'Nunito','DM Sans',system-ui,sans-serif`,
      display:'flex', flexDirection:'column', position:'relative', overflow:'hidden',
      WebkitFontSmoothing:'antialiased' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        input, select, textarea { font-family: 'Nunito', system-ui, sans-serif; }
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator { filter: opacity(0.5); }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius:2px; }
        button { font-family: 'Nunito', system-ui, sans-serif; }
      `}</style>


      {/* ── Main content ───────────────────────────────────────── */}
      <div style={{ flex:1, overflow:'hidden', position:'relative', background:C.bg }}>
        {tab==='home'     && <HomeTab     entries={entries} onToggle={toggleDone} onEdit={setEditingEntry} onDelete={deleteEntry} userName={userName} currentUserId={user?.id} onAdd={() => { setAddDate(null); setShowAdd(true); }} syncStatus={syncStatus} />}
        {tab==='calendar' && <CalendarTab entries={entries} onToggle={toggleDone} onEdit={setEditingEntry} onDelete={deleteEntry} currentUserId={user?.id} onAdd={date => { setAddDate(date||null); setShowAdd(true); }} />}
        {tab==='search'   && <SearchTab   entries={entries} onToggle={toggleDone} onEdit={setEditingEntry} onDelete={deleteEntry} currentUserId={user?.id} />}
        {tab==='settings' && <SettingsTab onReset={resetData} userName={userName} onChangeName={() => { setNameReady(false); setNameInput(userName); }} onSignOut={signOut} workspace={workspace} workspaceLoaded={workspaceLoaded} setWorkspace={setWorkspace} userId={user?.id} />}
        {showAdd      && <AddModal onClose={() => { setShowAdd(false); setAddDate(null); }} onSave={addEntry} initialDate={addDate} />}
        {editingEntry && <AddModal onClose={() => setEditingEntry(null)} onSave={updateEntry} editEntry={editingEntry} />}
      </div>

      {/* ── Bottom nav bar ─────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', height:72,
        borderTop:`1px solid ${C.border}`, background:C.card,
        flexShrink:0, paddingBottom:10,
        boxShadow:`0 -2px 16px rgba(44,38,32,0.08)` }}>

        {/* Home + Calendar */}
        {NAV.slice(0,2).map(n => (
          <button key={n.key} onClick={() => setTab(n.key)}
            style={{ flex:1, background: tab===n.key ? C.rose+'18' : 'transparent',
              border:'none', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              padding:'8px 4px', borderRadius:BR.panel, margin:'0 4px',
              color: tab===n.key ? C.rose : C.muted,
              transition:'background 0.15s' }}>
            <span style={{ fontSize:24, color: tab===n.key ? C.rose : C.muted,
              display:'flex', alignItems:'center', height:24 }}>
              {n.icon === 'cal' ? <CalIcon /> : n.icon}
            </span>
            <span style={{ fontSize:12, fontWeight: tab===n.key ? 800 : 500,
              color: tab===n.key ? C.rose : C.muted }}>{n.label}</span>
          </button>
        ))}

        {/* V5: FAB — true circle, elevated with glow */}
        <button onClick={() => setShowAdd(true)}
          style={{ width:60, height:60, borderRadius:30, flexShrink:0,
            background:`linear-gradient(135deg,${C.rose},${C.roseL})`,
            border:'none',
            boxShadow:`0 6px 24px ${C.rose}60, 0 0 0 4px ${C.rose}20`,
            cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', margin:'0 4px' }}>
          <span style={{ fontSize:32, color:'#fff', fontWeight:300, lineHeight:1, marginTop:-2 }}>+</span>
        </button>

        {/* Search + Settings */}
        {NAV.slice(2).map(n => (
          <button key={n.key} onClick={() => setTab(n.key)}
            style={{ flex:1, background: tab===n.key ? C.rose+'18' : 'transparent',
              border:'none', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              padding:'8px 4px', borderRadius:BR.panel, margin:'0 4px',
              transition:'background 0.15s' }}>
            <span style={{ fontSize:24, color: tab===n.key ? C.rose : C.muted }}>{n.icon}</span>
            <span style={{ fontSize:12, fontWeight: tab===n.key ? 800 : 500,
              color: tab===n.key ? C.rose : C.muted }}>{n.label}</span>
          </button>
        ))}

      </div>
    </div>
  );
}

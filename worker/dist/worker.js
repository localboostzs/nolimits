/**
 * NoLimits Buchungs-Proxy: GitHub Pages -> Cloudflare Worker -> Cal.com API v2
 *
 * Geheimnisse (nur Cloudflare-Secret, nie im Code/Frontend):
 *   CAL_API_KEY   optional; öffentliche Event-Types funktionieren auch ohne Schlüssel
 * Variablen:
 *   ALLOWED_ORIGINS  Komma-getrennte Liste erlaubter Origins (CORS)
 *
 * Später auf Isens Konto umstellen: nur CAL_API_KEY und src/services.js (Event-Type-IDs) ändern.
 */
// Servicekonfiguration. Für Isens Konto nur diese Datei (Event-Type-IDs) und das Secret CAL_API_KEY austauschen.
const CAL_BASE = 'https://api.cal.com';
const TIME_ZONE = 'Europe/Zurich';

const SERVICES = {
  'haarschnitt-bartschnitt-rasieren': { eventTypeId: 7888954, name: "Haarschnitt mit Bartschnitt und Rasieren", minutes: 60, price: 60 },
  'haarschnitt-bartschnitt-augenbrauen': { eventTypeId: 7888956, name: "Haarschnitt mit Bartschnitt + Augenbrauen", minutes: 45, price: 55 },
  'haarschnitt-waschen': { eventTypeId: 7888952, name: "Haarschnitt mit Waschen", minutes: 45, price: 50 },
  'haarschnitt-bartschnitt': { eventTypeId: 7888951, name: "Haarschnitt & Bartschnitt", minutes: 45, price: 45 },
  'classic-scissor-cut': { eventTypeId: 7888958, name: "Classic Hair Scissor Cut", minutes: 30, price: 40 },
  'haarschnitt': { eventTypeId: 7888953, name: "Haarschnitt", minutes: 30, price: 30 },
  'jugendliche-10-14': { eventTypeId: 7888957, name: "Jugendliche (von 10 bis 14 Jahre alt)", minutes: 30, price: 25 },
  'bartschnitt': { eventTypeId: 7888955, name: "Bartschnitt", minutes: 15, price: 15 },
  'augenbrauen-zupfen': { eventTypeId: 7888946, name: "Augenbrauen zupfen", minutes: 15, price: 15 },
};



// Nicht in /api/services veröffentlichen. Dieser Service ist nur für authentifizierte
// Mitarbeiter-API-Aufrufe vorgesehen. Cal.com "hidden" allein ist KEIN Zugriffsschutz.
const ADMIN_SERVICES = {
  'gentleman-rasur': { eventTypeId: 7912905, name: 'Gentleman Rasur', minutes: 30, price: 30 }
};

async function requireStaff(req, env) {
  const url = env.NL_SUPABASE_URL || '';
  const key = env.NL_SUPABASE_PUBLISHABLE_KEY || '';
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(url) || !key.startsWith('sb_publishable_')) {
    return { ok: false, status: 503, code: 'admin_not_configured', message: 'Die interne Verwaltung wird noch eingerichtet.' };
  }
  const header = req.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token.length > 4096) {
    return { ok: false, status: 401, code: 'login_required', message: 'Bitte anmelden.' };
  }
  const heads = { 'apikey': key, 'Authorization': 'Bearer ' + token };
  let userResponse;
  try {
    userResponse = await fetch(url + '/auth/v1/user', { headers: heads, redirect: 'error' });
  } catch {
    return { ok: false, status: 503, code: 'auth_unavailable', message: 'Anmeldung momentan nicht überprüfbar.' };
  }
  if (!userResponse.ok) return { ok: false, status: 401, code: 'session_invalid', message: 'Bitte erneut anmelden.' };
  const user = await userResponse.json().catch(() => null);
  if (!/^[0-9a-f-]{36}$/i.test(user?.id || '')) return { ok: false, status: 403, code: 'forbidden', message: 'Kein Zugriff.' };
  // Die SELECT-RLS-Policy gibt ausschliesslich die eigene Staff-Zeile zurück.
  let staffResponse;
  try {
    staffResponse = await fetch(url + '/rest/v1/nl_staff?user_id=eq.' + encodeURIComponent(user.id) + '&select=role,active&limit=1',
      { headers: heads, redirect: 'error' });
  } catch {
    return { ok: false, status: 503, code: 'auth_unavailable', message: 'Berechtigung momentan nicht überprüfbar.' };
  }
  if (!staffResponse.ok) return { ok: false, status: 403, code: 'forbidden', message: 'Keine Verwaltungsberechtigung.' };
  const rows = await staffResponse.json().catch(() => []);
  if (!Array.isArray(rows) || !rows[0]?.active || !['owner','staff'].includes(rows[0].role)) {
    return { ok: false, status: 403, code: 'forbidden', message: 'Keine Verwaltungsberechtigung.' };
  }
  return { ok: true, userId: user.id };
}

async function listCalBookings(env, status) {
  if (!env.CAL_API_KEY) throw new Error('CAL_API_KEY not configured');
  const all = [];
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ status, take: '100', skip: String(page * 100) });
    const response = await calFetch(CAL_BASE + '/v2/bookings?' + q,
      { headers: calHeaders(env, '2024-08-13') });
    if (!response.ok) throw new Error('Cal bookings unavailable');
    const body = await response.json().catch(() => null);
    const records = Array.isArray(body?.data) ? body.data : (body?.data?.bookings || []);
    if (!Array.isArray(records)) throw new Error('Unexpected Cal data');
    all.push(...records);
    if (records.length < 100 || body?.pagination?.hasNextPage === false) break;
  }
  return all;
}
async function getContacts(req, env) {
  try {
    const [upcoming, past] = await Promise.all([
      listCalBookings(env, 'upcoming'), listCalBookings(env, 'past')
    ]);
    const grouped = new Map();
    const names = new Map(Object.entries(SERVICES).concat(Object.entries(ADMIN_SERVICES))
      .map(([,s]) => [s.eventTypeId, s.name]));
    for (const [kind, list] of [['upcoming',upcoming], ['past',past]]) {
      for (const b of list) {
        const attendee = b.attendees?.[0] || {};
        const email = String(attendee.email || '').trim().toLowerCase();
        if (!email || email.length > 120) continue;
        let c = grouped.get(email);
        if (!c) {
          c = { name: String(attendee.name || '').slice(0,80), email,
            phone: String(attendee.phoneNumber || '').slice(0,30), upcoming:[], past:[] };
          grouped.set(email, c);
        }
        if (!c.phone && attendee.phoneNumber) c.phone = String(attendee.phoneNumber).slice(0,30);
        const eventTypeId = b.eventTypeId || b.eventType?.id;
        const service = names.get(Number(eventTypeId)) || String(b.title || 'Termin').split(' zwischen ')[0];
        c[kind].push({
          uid: b.uid, start: b.start || b.startTime,
          end: b.end || b.endTime, status: b.status, service
        });
      }
    }
    const contacts = Array.from(grouped.values());
    contacts.forEach(c => {
      c.upcoming.sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
      c.past.sort((a,b) => Date.parse(b.start)-Date.parse(a.start));
    });
    contacts.sort((a,b) => (a.name||a.email).localeCompare(b.name||b.email, 'de'));
    return json({ ok: true, contacts }, 200, req, env, { 'Cache-Control': 'no-store' });
  } catch {
    return fail('contacts_unavailable', 'Kunden und Termine konnten nicht geladen werden.', 502, req, env);
  }
}

const DEFAULT_ORIGINS = ['https://localboostzs.github.io'];
const MAX_BODY = 4096;
const RANGE_DAYS_MAX = 62;

// Begrenzung: bevorzugt Cloudflares Rate-Limiting-Binding (gilt über alle Isolates eines Standorts),
// sonst Rückfall auf einen einfachen Zähler pro Isolate (best effort, ohne Datenbank).
const buckets = new Map();
async function limited(env, binding, key, max, windowMs) {
  const rl = env[binding];
  if (rl && typeof rl.limit === 'function') {
    try { const { success } = await rl.limit({ key }); return !success; } catch { /* Rückfall */ }
  }
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); return true; }
  b.push(now);
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

function origins(env) {
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const h = { 'Vary': 'Origin' };
  if (origin && origins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(data, status, req, env, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(req, env),
      ...extra,
    },
  });
}

function fail(code, message, status, req, env) {
  return json({ ok: false, error: { code, message } }, status, req, env);
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const isEmail = (s) => s.length <= 120 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(s);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

function calHeaders(env, version) {
  const h = { 'cal-api-version': version, 'Content-Type': 'application/json' };
  if (env.CAL_API_KEY) h.Authorization = 'Bearer ' + env.CAL_API_KEY;
  return h;
}

async function calFetch(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') || 'local';
}

async function getSlots(url, req, env, privateService) {
  if (await limited(env, 'RL_SLOTS', 's:' + clientIp(req), 60, 60_000)) return fail('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.', 429, req, env);
  const service = privateService || SERVICES[url.searchParams.get('service')];
  const start = url.searchParams.get('start') || '';
  const end = url.searchParams.get('end') || '';
  if (!service) return fail('invalid_service', 'Unbekannte Dienstleistung.', 400, req, env);
  if (!isDate(start) || !isDate(end) || end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > RANGE_DAYS_MAX) {
    return fail('invalid_range', 'Ungültiger Zeitraum.', 400, req, env);
  }
  const q = new URLSearchParams({ eventTypeId: String(service.eventTypeId), start, end, timeZone: TIME_ZONE });
  let res;
  try {
    res = await calFetch(`${CAL_BASE}/v2/slots?${q}`, { headers: calHeaders(env, '2024-09-04') });
  } catch {
    return fail('upstream_unreachable', 'Die Terminabfrage ist gerade nicht erreichbar.', 502, req, env);
  }
  if (!res.ok) return fail('upstream_error', 'Termine konnten nicht geladen werden.', 502, req, env);
  const body = await res.json().catch(() => null);
  const days = {};
  const now = Date.now();
  for (const [day, list] of Object.entries(body?.data || {})) {
    const starts = (Array.isArray(list) ? list : []).map((s) => s.start).filter((s) => typeof s === 'string' && Date.parse(s) > now);
    if (starts.length) days[day] = starts;
  }
  return json({ ok: true, timeZone: TIME_ZONE, minutes: service.minutes, days }, 200, req, env, { 'Cache-Control': 'no-store' });
}

async function book(req, env, adminMode = false) {
  if (await limited(env, 'RL_BOOK', 'b:' + clientIp(req), 5, 10 * 60_000)) return fail('rate_limited', 'Zu viele Buchungsversuche. Bitte später erneut versuchen.', 429, req, env);
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return fail('too_large', 'Anfrage zu gross.', 413, req, env);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail('too_large', 'Anfrage zu gross.', 413, req, env);
  let b;
  try { b = JSON.parse(raw); } catch { return fail('invalid_json', 'Ungültige Anfrage.', 400, req, env); }
  if (!b || typeof b !== 'object') return fail('invalid_json', 'Ungültige Anfrage.', 400, req, env);

  // Missbrauchsschutz: Honeypot-Feld muss leer sein, Formular darf nicht in unter 3 s abgeschickt werden.
  if (b.website) return json({ ok: false, error: { code: 'rejected', message: 'Anfrage abgelehnt.' } }, 400, req, env);
  if (typeof b.elapsedMs === 'number' && b.elapsedMs < 3000) return fail('too_fast', 'Bitte Angaben in Ruhe prüfen und erneut senden.', 400, req, env);

  const service = adminMode ? (ADMIN_SERVICES[b.service] || SERVICES[b.service]) : SERVICES[b.service];
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  const phone = clean(b.phone, 30);
  const notes = clean(b.notes, 500);
  const startMs = Date.parse(b.start);
  if (!service) return fail('invalid_service', 'Unbekannte Dienstleistung.', 400, req, env);
  if (name.length < 2) return fail('invalid_name', 'Bitte Namen angeben.', 400, req, env);
  if (!isEmail(email)) return fail('invalid_email', 'Bitte gültige E-Mail-Adresse angeben.', 400, req, env);
  if (!/^\+?[0-9 ()\/.-]{7,25}$/.test(phone)) return fail('invalid_phone', 'Bitte gültige Telefonnummer angeben.', 400, req, env);
  if (b.accepted !== true) return fail('terms_required', 'Bitte die Stornierungsbedingungen bestätigen.', 400, req, env);
  if (Number.isNaN(startMs) || startMs < Date.now() || startMs > Date.now() + 366 * 86400000) return fail('invalid_start', 'Ungültiger Termin.', 400, req, env);

  const payload = {
    start: new Date(startMs).toISOString(),
    eventTypeId: service.eventTypeId,
    attendee: { name, email, timeZone: TIME_ZONE, language: 'de', phoneNumber: phone },
    bookingFieldsResponses: { ...(adminMode && ADMIN_SERVICES[b.service] ? {} : { stornierungsbedingungen_akzeptiert: true }), ...(notes ? { notes } : {}) },
  };
  let res;
  try {
    res = await calFetch(`${CAL_BASE}/v2/bookings`, { method: 'POST', headers: calHeaders(env, '2024-08-13'), body: JSON.stringify(payload) });
  } catch {
    return fail('upstream_unreachable', 'Die Buchung konnte nicht gesendet werden. Bitte erneut versuchen.', 502, req, env);
  }
  const out = await res.json().catch(() => null);
  if (!res.ok) {
    // Keine Kundendaten weiterreichen oder protokollieren; nur eine sinnvolle Fehlerklasse zurückgeben.
    const msg = String(out?.message || out?.error?.message || '').toLowerCase();
    if (/email|mail/.test(msg)) return fail('invalid_email', 'Diese E-Mail-Adresse kann keine Nachrichten empfangen. Bitte eine gültige Adresse angeben.', 400, req, env);
    if (/phone|telefon/.test(msg)) return fail('invalid_phone', 'Bitte gültige Telefonnummer angeben.', 400, req, env);
    if (res.status === 409 || /available|booked|busy|conflict|slot|no_available/.test(msg)) {
      return fail('slot_unavailable', 'Dieser Termin ist leider nicht mehr verfügbar. Bitte einen anderen wählen.', 409, req, env);
    }
    return fail('upstream_error', 'Die Buchung konnte nicht abgeschlossen werden.', 502, req, env);
  }
  const d = out?.data;
  // Nur bestätigte Buchungen als Erfolg melden.
  if (!d || d.status !== 'accepted') return fail('not_confirmed', 'Die Buchung wurde nicht bestätigt. Bitte erneut versuchen.', 502, req, env);
  return json({ ok: true, booking: { uid: d.uid, status: d.status, start: d.start, end: d.end, service: service.name } }, 201, req, env);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    const origin = req.headers.get('Origin');
    if (origin && !origins(env).includes(origin)) return fail('forbidden_origin', 'Origin nicht erlaubt.', 403, req, env);
    try {
      if (url.pathname.startsWith('/api/admin/')) {
        const access = await requireStaff(req, env);
        if (!access.ok) return fail(access.code, access.message, access.status, req, env);
        if (req.method === 'GET' && url.pathname === '/api/admin/services') {
          const list = Object.entries(SERVICES).concat(Object.entries(ADMIN_SERVICES))
            .map(([key,s]) => ({ key, name:s.name, minutes:s.minutes, price:s.price ?? null, internal:!!ADMIN_SERVICES[key] }));
          return json({ ok:true, services:list }, 200, req, env);
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/contacts') return await getContacts(req, env);
        if (req.method === 'GET' && url.pathname === '/api/admin/slots') {
          const key = url.searchParams.get('service');
          const service = SERVICES[key] || ADMIN_SERVICES[key];
          if (!service) return fail('invalid_service','Unbekannte Leistung.',400,req,env);
          return await getSlots(url, req, env, service);
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/book') return await book(req, env, true);
        return fail('not_found','Nicht gefunden.',404,req,env);
      }
      if (req.method === 'GET' && url.pathname === '/api/services') {
        const list = Object.entries(SERVICES).map(([key, s]) => ({ key, name: s.name, minutes: s.minutes, price: s.price ?? null }));
        return json({ ok: true, timeZone: TIME_ZONE, services: list }, 200, req, env);
      }
      if (req.method === 'GET' && url.pathname === '/api/slots') return await getSlots(url, req, env);
      if (req.method === 'POST' && url.pathname === '/api/book') return await book(req, env);
      if (req.method === 'GET' && url.pathname === '/api/health') return json({ ok: true }, 200, req, env);
      return fail('not_found', 'Nicht gefunden.', 404, req, env);
    } catch {
      return fail('internal', 'Interner Fehler.', 500, req, env);
    }
  },
};

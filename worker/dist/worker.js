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
    h['Access-Control-Allow-Headers'] = 'Content-Type';
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

async function getSlots(url, req, env) {
  if (await limited(env, 'RL_SLOTS', 's:' + clientIp(req), 60, 60_000)) return fail('rate_limited', 'Zu viele Anfragen. Bitte kurz warten.', 429, req, env);
  const service = SERVICES[url.searchParams.get('service')];
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

async function book(req, env) {
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

  const service = SERVICES[b.service];
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
    bookingFieldsResponses: { stornierungsbedingungen_akzeptiert: true, ...(notes ? { notes } : {}) },
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

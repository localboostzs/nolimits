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
    userResponse = await fetch(url + '/auth/v1/user', { headers: heads, redirect: 'manual' });
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
      { headers: heads, redirect: 'manual' });
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
  const grouped = new Map();
  const names = new Map(Object.entries(SERVICES).concat(Object.entries(ADMIN_SERVICES))
    .map(([,s]) => [s.eventTypeId, s.name]));
  const headings = {
    bookingsWarning: false,
    legacyWarning: false,
    profilesWarning: false,
  };
  const staffHeaders = {
    apikey: env.NL_SUPABASE_PUBLISHABLE_KEY,
    Authorization: req.headers.get('Authorization') || '',
    Accept: 'application/json'
  };
  async function getStaffRows(table, fields, limit) {
    const endpoint = env.NL_SUPABASE_URL + '/rest/v1/' + table +
      '?select=' + encodeURIComponent(fields) + '&limit=' + limit;
    const response = await fetch(endpoint, {headers:staffHeaders,redirect:'manual'});
    if(!response.ok) throw new Error('Staff directory unavailable: ' + table);
    const data = await response.json();
    if(!Array.isArray(data)) throw new Error('Unexpected directory response: ' + table);
    return data;
  }
  function record(email,name,phone,externalId) {
    const cleanEmail = String(email||'').trim().toLowerCase().slice(0,120);
    const contactKey = cleanEmail && isEmail(cleanEmail) ? cleanEmail
      : externalId ? 'wix:' + String(externalId).slice(0,160) : '';
    if (!contactKey) return null;
    let c=grouped.get(contactKey);
    if(!c) {
      c={name:String(name||'').slice(0,100),email:cleanEmail,
        phone:String(phone||'').slice(0,30),upcoming:[],past:[]};
      grouped.set(contactKey,c);
    }
    if (!c.name && name) c.name=String(name).slice(0,100);
    if (!c.phone && phone) c.phone=String(phone).slice(0,30);
    return c;
  }
  // Echte NoLimits-Kundenkonten auch vor der Cal.com-Anbindung anzeigen.
  // Supabase RLS erlaubt nur aktivierten Mitarbeitern diese Listenabfrage.
  try {
    const profiles = await getStaffRows('nl_customer_profiles',
      'email,full_name,phone,last_service_key', 2000);
    for (const p of profiles) {
      const c=record(p.email,p.full_name,p.phone);
      if (c) {
        c.registered=true;
        if (p.last_service_key && SERVICES[p.last_service_key])
          c.recentService=SERVICES[p.last_service_key].name;
      }
    }
  } catch {
    return fail('profiles_unavailable',
      'Kundenkonten konnten nicht geladen werden. Bitte Administrator kontaktieren.',502,req,env);
  }

  // Wix-Kontakte importieren wir ausschliesslich nach Isens Freigabe.
  try {
    const legacy = await getStaffRows('nl_legacy_contacts','external_id,name,email,phone',2000);
    for (const p of legacy) {
      const c=record(p.email,p.name,p.phone,p.external_id);
      if(c) c.legacy=true;
    }
  } catch {
    headings.legacyWarning=true;
  }

  // Kein Cal.com-API-Key in Testumgebung: Kundenliste bleibt verwendbar,
  // keine erfundenen kommenden/alten Termine anzeigen.
  if (!env.CAL_API_KEY) {
    headings.bookingsWarning=true;
  } else {
    try {
      const [upcoming,past] = await Promise.all([
        listCalBookings(env,'upcoming'),listCalBookings(env,'past')]);
      for (const [kind,list] of [['upcoming',upcoming],['past',past]]) {
        for (const b of list) {
          const eventTypeId=Number(b.eventTypeId || b.eventType?.id);
          // Filter VOR Aufnahme des Kontakts: keine privaten/unabhängigen
          // Cal.com-Termine oder deren Teilnehmer in NoLimits anzeigen.
          if (!names.has(eventTypeId)) continue;
          const attendee=b.attendees?.[0]||{};
          const c=record(attendee.email,attendee.name,attendee.phoneNumber);
          if(!c) continue;
          c[kind].push({
            uid:b.uid,start:b.start||b.startTime,end:b.end||b.endTime,
            status:b.status,service:names.get(eventTypeId)
          });
        }
      }
    } catch {
      headings.bookingsWarning=true;
    }
  }

  const contacts=Array.from(grouped.values());
  contacts.forEach(c=>{
    c.upcoming.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    c.past.sort((a,b)=>Date.parse(b.start)-Date.parse(a.start));
  });
  contacts.sort((a,b)=>(a.name||a.email).localeCompare(b.name||b.email,'de'));
  return json({ok:true,contacts,...headings},200,req,env,
    {'Cache-Control':'no-store'});
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
  const token = env.CAL_API_KEY ? await managementToken(d.uid, d.start, env) : null;
  const manageUrl = token ? FRONTEND_BASE + MANAGE_PATH + '?uid=' + encodeURIComponent(d.uid) + '&token=' + encodeURIComponent(token) : null;
  return json({ ok: true, booking: { uid: d.uid, status: d.status, start: d.start, end: d.end, service: service.name, manageUrl } }, 201, req, env);
}


/* Customer booking management: stateless signed links, no PII or secret in public repo. */
const MANAGE_PATH = '/nolimits/termin-verwalten/';
const FRONTEND_BASE = 'https://localboostzs.github.io';
const VALID_UID = /^[A-Za-z0-9_-]{12,120}$/;
function serviceForCal(eventTypeId) {
  return Object.entries({ ...SERVICES, ...ADMIN_SERVICES })
    .find(([, value]) => Number(value.eventTypeId) === Number(eventTypeId)) || null;
}
function serviceForWebhook(p) {
  const match = serviceForCal(p?.eventTypeId || p?.eventType?.id);
  if (match) return match;
  const slug = String(p?.type || p?.eventType?.slug || '');
  return Object.entries({ ...SERVICES, ...ADMIN_SERVICES }).find(([key]) =>
    slug === 'nolimits-' + key || (key === 'gentleman-rasur' && slug === 'nolimits-intern-gentleman-rasur')) || null;
}
const asB64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function hexBytes(s) {
  if (!/^[0-9a-f]{64}$/i.test(s)) return null;
  return new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
}
async function managementToken(uid, start, env) {
  if (!VALID_UID.test(uid) || !env.NL_MANAGE_SECRET) return null;
  const expiry = Math.floor(Date.parse(start) / 1000) + 7 * 86400;
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return null;
  const signed = await crypto.subtle.sign('HMAC', await hmacKey(env.NL_MANAGE_SECRET), new TextEncoder().encode(uid + ':' + expiry));
  return expiry + '.' + asB64(signed);
}
async function validManagementToken(uid, token, env) {
  if (!env.NL_MANAGE_SECRET || !VALID_UID.test(uid) || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(token || '')) return false;
  const [expiration, tag] = token.split('.');
  const exp = Number(expiration);
  if (exp < Math.floor(Date.now() / 1000) || exp > Math.floor(Date.now() / 1000) + 400 * 86400) return false;
  try {
    const bytes = Uint8Array.from(atob(tag.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', await hmacKey(env.NL_MANAGE_SECRET), bytes, new TextEncoder().encode(uid + ':' + expiration));
  } catch { return false; }
}
async function readCalBooking(uid, env) {
  const res = await calFetch(CAL_BASE + '/v2/bookings/' + encodeURIComponent(uid), { headers: calHeaders(env, '2024-08-13') });
  if (!res.ok) return { response: res, booking: null };
  const data = await res.json().catch(() => null);
  const b = data?.data || data?.booking || null;
  if (!b || b.uid !== uid || !serviceForCal(b.eventTypeId || b.eventType?.id)) return { response: null, booking: null };
  return { response: res, booking: b };
}
async function accessManage(req, env, uid, token) {
  if (!env.CAL_API_KEY) return { error: fail('not_configured', 'Die Terminverwaltung wird gerade eingerichtet. Bis dahin bitte den Stornolink aus der Cal.com-E-Mail verwenden.', 503, req, env) };
  if (!(await validManagementToken(uid, token, env))) return { error: fail('invalid_link', 'Dieser Buchungslink ist ungültig oder abgelaufen.', 403, req, env) };
  try {
    const found = await readCalBooking(uid, env);
    if (!found.booking) return { error: fail('not_found', 'Termin nicht gefunden.', 404, req, env) };
    return { booking: found.booking, matched: serviceForCal(found.booking.eventTypeId || found.booking.eventType?.id) };
  } catch { return { error: fail('unavailable', 'Die Terminverwaltung ist derzeit nicht erreichbar.', 502, req, env) }; }
}
async function routeManage(req, env, url) {
  if (await limited(env, 'RL_SLOTS', 'manage:' + clientIp(req), 40, 60000)) return fail('rate_limited', 'Bitte später erneut versuchen.', 429, req, env);
  const post = req.method === 'POST';
  if (post && Number(req.headers.get('Content-Length') || 0) > 2048) return fail('too_large', 'Anfrage zu gross.', 413, req, env);
  const data = post ? await req.json().catch(() => null) : url.searchParams;
  const uid = clean(post ? data?.uid : data?.get('uid'), 120);
  const token = clean(post ? data?.token : data?.get('token'), 120);
  const a = await accessManage(req, env, uid, token);
  if (a.error) return a.error;
  const b = a.booking, matched = a.matched;
  const startMs = Date.parse(b.start);
  if (!post && url.pathname === '/api/manage') {
    return json({ ok:true, booking: {
      service: matched[1].name, serviceKey: matched[0], eventTypeId: matched[1].eventTypeId,
      minutes: matched[1].minutes, price: matched[1].price,
      start: b.start, end: b.end, status:b.status,
      canManage:b.status === 'accepted' && startMs > Date.now()
    } }, 200, req, env);
  }
  if (b.status !== 'accepted' || startMs <= Date.now()) return fail('not_active', 'Dieser Termin kann nicht mehr geändert werden.', 409, req, env);
  if (!post && url.pathname === '/api/manage/slots') {
    if (url.searchParams.get('service') !== matched[0]) return fail('invalid_service','Diese Dienstleistung darf nicht geändert werden.',400,req,env);
    return await getSlots(url, req, env, matched[1]);
  }
  if (post && url.pathname === '/api/manage/cancel') {
    if (data.confirm !== true) return fail('confirmation_required', 'Bitte zuerst die Stornierung bestätigen.',400,req,env);
    const reason = clean(data.reason, 200) || 'Vom Kunden über die NoLimits-Website storniert';
    try {
      const r = await calFetch(CAL_BASE + '/v2/bookings/' + encodeURIComponent(uid) + '/cancel', {
        method:'POST', headers:calHeaders(env,'2026-02-25'), body:JSON.stringify({cancellationReason:reason})
      });
      if (!r.ok) return fail('upstream_error','Die Stornierung wurde nicht bestätigt. Bitte versuche es erneut.',502,req,env);
      return json({ok:true,status:'cancelled'},200,req,env);
    } catch { return fail('unavailable', 'Stornierung momentan nicht erreichbar.',502,req,env); }
  }
  if (post && url.pathname === '/api/manage/reschedule') {
    if (data.confirm !== true) return fail('confirmation_required','Bitte die Umbuchung bestätigen.',400,req,env);
    const nextMs = Date.parse(data.start);
    if (!Number.isFinite(nextMs) || nextMs < Date.now() || nextMs > Date.now() + 366 * 86400000) return fail('invalid_start','Ungültiger neuer Termin.',400,req,env);
    const chosen = new Date(nextMs).toISOString();
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(nextMs));
    const value = (part) => parts.find(p => p.type === part)?.value || '';
    const dateKey = value('year')+'-'+value('month')+'-'+value('day');
    try {
      const q = new URLSearchParams({eventTypeId:String(matched[1].eventTypeId),start:dateKey,end:dateKey,timeZone:TIME_ZONE});
      const slots = await calFetch(CAL_BASE+'/v2/slots?'+q,{headers:calHeaders(env,'2024-09-04')});
      if (!slots.ok) return fail('unavailable','Verfügbarkeit konnte nicht geprüft werden.',502,req,env);
      const available = await slots.json().catch(()=>null);
      const all = Object.values(available?.data||{}).flatMap(v=>Array.isArray(v)?v:[]);
      if (!all.some(x=>Date.parse(x.start) === nextMs)) return fail('slot_unavailable','Dieser Zeitpunkt ist nicht mehr verfügbar.',409,req,env);
      const r = await calFetch(CAL_BASE+'/v2/bookings/'+encodeURIComponent(uid)+'/reschedule',{
        method:'POST',headers:calHeaders(env,'2026-02-25'),
        body:JSON.stringify({start:chosen,reschedulingReason:'Durch Kunden auf der NoLimits-Website umgebucht'})
      });
      if (!r.ok) return fail('upstream_error','Umbuchung nicht bestätigt. Bitte erneut versuchen.',502,req,env);
      const out = await r.json().catch(()=>null), newer = out?.data;
      return json({ok:true,booking:{start:newer?.start||chosen,end:newer?.end||null,status:newer?.status||'accepted',
        manageUrl: newer?.uid && newer?.start ? FRONTEND_BASE+MANAGE_PATH+'?uid='+encodeURIComponent(newer.uid)+'&token='+encodeURIComponent(await managementToken(newer.uid,newer.start,env)) : null
      }},200,req,env);
    } catch { return fail('unavailable','Umbuchung momentan nicht erreichbar.',502,req,env); }
  }
  return fail('not_found','Nicht gefunden.',404,req,env);
}
function mailEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function mailHtml(event, p, match, manageUrl) {
  const cancelled = event === 'BOOKING_CANCELLED';
  const when = new Intl.DateTimeFormat('de-CH',{timeZone:TIME_ZONE,dateStyle:'full',timeStyle:'short'}).format(new Date(p.startTime));
  const price = match[1].price == null ? '' : '<div style="margin-top:8px">Preis: <strong>CHF '+mailEscape(match[1].price)+'</strong> · Bezahlung vor Ort</div>';
  const title = cancelled ? 'Dein Termin wurde storniert' : (event==='BOOKING_RESCHEDULED'?'Dein Termin wurde verschoben':'Dein Termin ist bestätigt');
  const safeLink = manageUrl ? '<a href="'+mailEscape(manageUrl)+'" style="display:inline-block;background:#d5b477;color:#141312;text-decoration:none;padding:14px 24px;border-radius:5px;font-weight:700;margin-top:22px">Termin verwalten</a>':'';
  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f1ed;color:#1c1c1a;font:16px/1.55 Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:35px 14px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden"><tr><td style="background:#141312;color:#d5b477;text-align:center;padding:26px"><div style="font-weight:800;letter-spacing:3px;font-size:27px">NOLIMITS</div><div style="font-size:11px;letter-spacing:4px">BARBERSHOP</div></td></tr><tr><td style="padding:32px 30px"><h1 style="font-size:25px;line-height:1.2;margin:0 0 10px">'+title+'</h1><p style="margin:0 0 22px">'+(cancelled?'Deine Buchung wurde erfolgreich aufgehoben.':'Wir freuen uns auf deinen Besuch bei NoLimits.')+'</p><div style="background:#f5f3ef;border-left:4px solid #d5b477;padding:18px"><strong>'+mailEscape(match[1].name)+'</strong><div style="margin-top:8px">'+mailEscape(when)+' Uhr</div><div style="margin-top:8px">Dauer: '+mailEscape(match[1].minutes)+' Minuten</div>'+price+'<div style="margin-top:8px">Schmiedgasse 94, 6438 Ibach</div></div>'+safeLink+'<p style="color:#666;font-size:13px;margin-top:24px">Falls du die Buchung nicht vorgenommen hast, melde dich bitte direkt beim Barbershop. Gib diesen persönlichen Verwaltungslink nicht an andere weiter.</p></td></tr><tr><td style="padding:18px 30px;text-align:center;background:#f5f3ef;color:#777;font-size:12px">NoLimits Barbershop · Schmiedgasse 94 · 6438 Ibach · Schweiz</td></tr></table></td></tr></table></body></html>';
}
async function onCalWebhook(req, env) {
  if (!env.CAL_WEBHOOK_SECRET) return json({ok:false},503,req,env);
  if (Number(req.headers.get('Content-Length') || 0) > 40000) return fail('too_large','Zu grosse Nachricht.',413,req,env);
  const raw = await req.text();
  if (raw.length > 40000) return fail('too_large','Zu grosse Nachricht.',413,req,env);
  const sig = (req.headers.get('X-Cal-Signature-256') || '').replace(/^sha256=/i,'');
  const bytes = hexBytes(sig);
  if (!bytes || !(await crypto.subtle.verify('HMAC',await hmacKey(env.CAL_WEBHOOK_SECRET),bytes,new TextEncoder().encode(raw)))) {
    return fail('invalid_signature','Ungültige Signatur.',401,req,env);
  }
  const event = JSON.parse(raw);
  const typ = String(event?.triggerEvent||'');
  if (!['BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_CANCELLED','BOOKING_RESCHEDULED'].includes(typ)) return json({ok:true,ignored:true},200,req,env);
  const p = event.payload||event;
  const uid = String(p.uid||'');
  if (!VALID_UID.test(uid) || !Number.isFinite(Date.parse(p.startTime))) return json({ok:true,ignored:true},200,req,env);
  // Cal.com can emit a cancellation for the old booking when rescheduling.
  if (typ==='BOOKING_CANCELLED' && (p.rescheduledToUid || p.rescheduleUid)) return json({ok:true,ignored:true},200,req,env);
  if (env.NL_EMAIL_ENABLED !== 'true' || !env.RESEND_API_KEY || !env.CAL_API_KEY || !env.NL_MANAGE_SECRET) return json({ok:true,skipped:'mail_not_enabled'},200,req,env);
  let match = serviceForWebhook(p);
  // Some BOOKING_CANCELLED webhooks omit eventTypeId/type. Resolve the UID
  // with the server-side Cal.com token; never trust arbitrary webhook titles.
  if (!match) {
    try {
      const lookup = await readCalBooking(uid, env);
      if (lookup.booking) match = serviceForCal(lookup.booking.eventTypeId || lookup.booking.eventType?.id);
    } catch { /* Cal.com unavailable; do not send an unverified email. */ }
  }
  if (!match) return json({ok:true,ignored:true},200,req,env);
  const customer = (p.attendees || []).find(a=>isEmail(String(a.email||'')));
  if (!customer) return json({ok:true,ignored:true},200,req,env);
  const tok = typ==='BOOKING_CANCELLED'?null:await managementToken(uid,p.startTime,env);
  const link = tok ? FRONTEND_BASE+MANAGE_PATH+'?uid='+encodeURIComponent(uid)+'&token='+encodeURIComponent(tok) : null;
  const subject = typ==='BOOKING_CANCELLED'?'Dein Termin wurde storniert – NoLimits Barbershop':typ==='BOOKING_RESCHEDULED'?'Dein neuer Termin – NoLimits Barbershop':'Dein Termin ist bestätigt – NoLimits Barbershop';
  const mail = {from:'NoLimits Barbershop <login@nolimits-barber.ch>',to:[customer.email],subject,html:mailHtml(typ,p,match,link)};
  const key = 'nolimits/'+typ+'/'+uid;
  const resp=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify(mail),redirect:'manual'
  });
  if (!resp.ok) return fail('delivery_failed','E-Mail nicht zugestellt.',502,req,env);
  return json({ok:true,sent:true},200,req,env);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    const origin = req.headers.get('Origin');
    if (origin && !origins(env).includes(origin)) return fail('forbidden_origin', 'Origin nicht erlaubt.', 403, req, env);
    try {
      if (req.method === 'POST' && url.pathname === '/api/webhooks/cal') return await onCalWebhook(req, env);
      if ((req.method === 'GET' || req.method === 'POST') && (url.pathname === '/api/manage' || url.pathname.startsWith('/api/manage/'))) return await routeManage(req, env, url);
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

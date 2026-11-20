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
import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';




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
  const names = new Map(Object.entries(SERVICES).concat(
    env.NL_ALIAS_STAGING_ONLY === 'true' ? [] : Object.entries(ADMIN_SERVICES)
  ).map(([,s]) => [s.eventTypeId, s.name]));
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
      // Resolve opaque booking aliases back to real customer addresses in the CRM.
      const controlledBookings = [...upcoming, ...past].filter(b =>
        names.has(Number(b.eventTypeId || b.eventType?.id)));
      const resolvedAliases = await lookupBookingAliases(env,
        controlledBookings.map(b => b.attendees?.[0]?.email));
      for (const [kind,list] of [['upcoming',upcoming],['past',past]]) {
        for (const b of list) {
          const eventTypeId=Number(b.eventTypeId || b.eventType?.id);
          // Filter VOR Aufnahme des Kontakts: keine privaten/unabhängigen
          // Cal.com-Termine oder deren Teilnehmer in NoLimits anzeigen.
          if (!names.has(eventTypeId)) continue;
          const attendee=b.attendees?.[0]||{};
          const customerEmail = isAliasEmail(attendee.email, env)
            ? resolvedAliases.get(String(attendee.email).toLowerCase()) : attendee.email;
          if (!customerEmail) { headings.bookingsWarning=true; continue; }
          const c=record(customerEmail,attendee.name,attendee.phoneNumber);
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
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With';
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

// --- NoLimits alias bookings (opt-in only, disabled by default) ---
// The real email stays in NoLimits Supabase; Cal.com receives an opaque alias.
// Do not enable on production until email routing, migrations and webhooks are tested.
function aliasSettings(env) {
  const domain = String(env.NL_ALIAS_DOMAIN || '').trim().toLowerCase();
  const prefix = String(env.NL_ALIAS_PREFIX || 'buchung').trim().toLowerCase();
  const separator = env.NL_ALIAS_SEPARATOR === '+' ? '+' : '-';
  if (!/^[a-z0-9](?:[a-z0-9.-]{1,90})\.[a-z]{2,}$/.test(domain) ||
      !/^[a-z][a-z0-9-]{0,19}$/.test(prefix)) return null;
  return { domain, prefix, separator };
}
function isAliasEmail(email, env) {
  const cfg = aliasSettings(env);
  if (!cfg) return false;
  const e = String(email || '').toLowerCase();
  const start = cfg.prefix + cfg.separator;
  return e.endsWith('@' + cfg.domain) &&
    /^[0-9a-f]{32}$/.test(e.slice(start.length, -('@' + cfg.domain).length)) &&
    e.startsWith(start);
}
function aliasApiConfig(env) {
  const url = String(env.NL_SUPABASE_URL || '');
  const key = String(env.NL_SUPABASE_SECRET_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) ||
      !(key.startsWith('sb_secret_') || key.startsWith('eyJ'))) {
    throw Error('Alias database is not configured');
  }
  // New Supabase sb_secret keys must be sent on apikey, NOT Authorization: Bearer.
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  return { url: url + '/rest/v1/nl_booking_email_aliases', headers };
}
async function createBookingAlias(env, customerEmail, eventTypeId) {
  const cfg = aliasSettings(env);
  if (!cfg) throw Error('Alias domain is not configured');
  const unique = crypto.randomUUID().replace(/-/g, '');
  const alias = cfg.prefix + cfg.separator + unique + '@' + cfg.domain;
  const db = aliasApiConfig(env);
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ alias_email: alias, customer_email: customerEmail, event_type_id: eventTypeId }),
    redirect: 'manual'
  });
  if (!response.ok) throw Error('Could not store alias before booking');
  return alias;
}
async function bindBookingAlias(env, alias, uid) {
  if (!alias || !VALID_UID.test(uid)) return;
  const db = aliasApiConfig(env);
  const response = await fetch(db.url + '?alias_email=eq.' + encodeURIComponent(alias), {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ booking_uid: uid }),
    redirect: 'manual'
  });
  if (!response.ok) throw Error('Alias booking UID update failed');
}
// Remove an alias only after Cal.com has DEFINITIVELY rejected its request.
// Never delete after network timeouts/5xx or ambiguous booking states: a
// confirmed booking and its later webhook might still need the mapping.
async function discardRejectedBookingAlias(env, alias) {
  if (!isAliasEmail(alias, env)) return false;
  const db = aliasApiConfig(env);
  const response = await fetch(db.url + '?alias_email=eq.' + encodeURIComponent(alias) +
    '&booking_uid=is.null', {
    method: 'DELETE',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    redirect: 'manual'
  });
  if (!response.ok) throw Error('Unable to remove rejected booking alias');
  return true;
}

async function lookupBookingAliases(env, addresses) {
  const aliases = [...new Set(addresses.map(e => String(e || '').trim().toLowerCase()).filter(e => isAliasEmail(e, env)))];
  const found = new Map();
  if (!aliases.length) return found;
  const db = aliasApiConfig(env);
  for (let i = 0; i < aliases.length; i += 30) {
    const batch = aliases.slice(i, i + 30);
    const query = new URLSearchParams({
      select: 'alias_email,customer_email',
      alias_email: 'in.(' + batch.map(a => '"' + a + '"').join(',') + ')'
    });
    const response = await fetch(db.url + '?' + query, { headers: db.headers, redirect: 'manual' });
    if (!response.ok) throw Error('Alias lookup failed');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw Error('Invalid alias lookup');
    for (const row of rows) {
      if (isAliasEmail(row.alias_email, env) && isEmail(String(row.customer_email || ''))) {
        found.set(String(row.alias_email).toLowerCase(), String(row.customer_email).toLowerCase());
      }
    }
  }
  return found;
}
async function resolveAttendeeEmail(env, email) {
  if (!isAliasEmail(email, env)) return email;
  const map = await lookupBookingAliases(env, [email]);
  const realEmail = map.get(String(email).toLowerCase());
  if (!realEmail) throw Error('Unmapped booking alias');
  return realEmail;
}
// --- End NoLimits alias bookings ---

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

  // Staff LAB bookings are allowed only against SERVICES (hidden Cal.com LAB event).
  // Never fall through to a production-only internal event type from ADMIN_SERVICES.
  if (adminMode && env.NL_ALIAS_STAGING_ONLY === 'true' && !Object.hasOwn(SERVICES, b.service)) {
    return fail('staging_admin_disabled','Nur die interne Testleistung ist in dieser Umgebung buchbar.',403,req,env);
  }
  const service = adminMode ? (ADMIN_SERVICES[b.service] || SERVICES[b.service]) : SERVICES[b.service];
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  if (env.NL_ALIAS_STAGING_ONLY === 'true' && !/^[a-z0-9._%+-]+@localboost-zs\.ch$/i.test(email)) {
    return fail('staging_test_email_only', 'In dieser Testumgebung nur interne LocalBoost-Testadressen.', 403, req, env);
  }
  const phone = clean(b.phone, 30);
  const notes = clean(b.notes, 500);
  const startMs = Date.parse(b.start);
  if (!service) return fail('invalid_service', 'Unbekannte Dienstleistung.', 400, req, env);
  if (name.length < 2) return fail('invalid_name', 'Bitte Namen angeben.', 400, req, env);
  if (!isEmail(email)) return fail('invalid_email', 'Bitte gültige E-Mail-Adresse angeben.', 400, req, env);
  if (!/^\+?[0-9 ()\/.-]{7,25}$/.test(phone)) return fail('invalid_phone', 'Bitte gültige Telefonnummer angeben.', 400, req, env);
  if (b.accepted !== true) return fail('terms_required', 'Bitte die Stornierungsbedingungen bestätigen.', 400, req, env);
  if (Number.isNaN(startMs) || startMs < Date.now() || startMs > Date.now() + 366 * 86400000) return fail('invalid_start', 'Ungültiger Termin.', 400, req, env);

  // Alias mode is OFF unless explicitly enabled on this Worker deployment.
  // Store mapping BEFORE contacting Cal.com, so immediate webhooks can resolve it.
  let bookingAlias = null;
  if (env.NL_ALIAS_MODE === 'enabled') {
    try {
      bookingAlias = await createBookingAlias(env, email, service.eventTypeId);
    } catch {
      return fail('alias_unavailable', 'Die Buchung ist momentan nicht verfügbar. Bitte später erneut versuchen.', 503, req, env);
    }
  }
  const payload = {
    start: new Date(startMs).toISOString(),
    eventTypeId: service.eventTypeId,
    attendee: { name, email: bookingAlias || email, timeZone: TIME_ZONE, language: 'de', phoneNumber: phone },
    bookingFieldsResponses: { ...((env.NL_ALIAS_STAGING_ONLY === 'true' || (adminMode && ADMIN_SERVICES[b.service])) ? {} : { stornierungsbedingungen_akzeptiert: true }), ...(notes ? { notes } : {}) },
  };
  let res;
  try {
    res = await calFetch(`${CAL_BASE}/v2/bookings`, { method: 'POST', headers: calHeaders(env, '2024-08-13'), body: JSON.stringify(payload) });
  } catch {
    return fail('upstream_unreachable', 'Die Buchung konnte nicht gesendet werden. Bitte erneut versuchen.', 502, req, env);
  }
  const out = await res.json().catch(() => null);
  if (!res.ok) {
    // For definite validation/conflict rejections Cal.com did not create a
    // booking. Delete only the still-unbound alias to avoid storing unnecessary
    // customer email addresses indefinitely. On timeouts/5xx keep it for
    // possible delayed acceptance and webhook delivery.
    if (bookingAlias && [400, 409, 422].includes(res.status)) {
      await discardRejectedBookingAlias(env, bookingAlias).catch(() => null);
    }
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
  // UID binding is best-effort: alias->real email was already persisted before Cal.com.
  // Never return a booking error after Cal.com has accepted it (avoids double bookings).
  if (bookingAlias) await bindBookingAlias(env, bookingAlias, d.uid).catch(() => null);
  const token = env.CAL_API_KEY ? await managementToken(d.uid, d.start, env) : null;
  const manageUrl = customerManageLink(d.uid, token, env);
  return json({ ok: true, booking: { uid: d.uid, status: d.status, start: d.start, end: d.end, service: service.name, manageUrl } }, 201, req, env);
}


/* Customer booking management: stateless signed links, no PII or secret in public repo. */
// The customer-facing site changes only AFTER Isen approves go-live.
// Only the approved NoLimits domains are allowed; arbitrary URLs in Worker
// environment configuration cannot redirect signed management links.
const DEFAULT_PUBLIC_SITE_BASE = 'https://localboostzs.github.io/nolimits';
function publicSiteBase(env) {
  const configured = String(env.NL_PUBLIC_SITE_BASE || '').trim().replace(/\/+$/, '');
  if (configured === DEFAULT_PUBLIC_SITE_BASE ||
      /^https:\/\/(?:www\.)?nolimits-barber\.ch$/i.test(configured)) return configured;
  return DEFAULT_PUBLIC_SITE_BASE;
}
function customerManageLink(uid, token, env) {
  return token ? publicSiteBase(env) + '/termin-verwalten/?uid=' +
    encodeURIComponent(uid) + '&token=' + encodeURIComponent(token) : null;
}
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
        manageUrl: newer?.uid && newer?.start ? customerManageLink(newer.uid,
          await managementToken(newer.uid, newer.start, env), env) : null
      }},200,req,env);
    } catch { return fail('unavailable','Umbuchung momentan nicht erreichbar.',502,req,env); }
  }
  return fail('not_found','Nicht gefunden.',404,req,env);
}
// Optional .ics for real customers: no Cal.com attendee alias or auth token is included.
// Stable UID comes from the alias UUID, so reschedule/cancel refer to the same entry.
function calendarEscape(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}
function calendarFold(line) {
  let out = '', count = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (count + bytes > 75) {
      out += '\r\n ';
      count = 1;
    }
    out += char;
    count += bytes;
  }
  return out;
}
function calendarUTC(time) {
  const value = new Date(time);
  if (!Number.isFinite(value.getTime())) throw Error('Invalid calendar time');
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function calendarAttachment(type, p, match, attendeeEmail, env) {
  if (env.NL_ICS_ENABLED !== 'true' || !isAliasEmail(attendeeEmail, env)) return null;
  const aliasId = String(attendeeEmail).toLowerCase().match(/(?:\+|-)([0-9a-f]{32})@/)?.[1];
  if (!aliasId) return null;
  const begin = Date.parse(p.startTime);
  if (!Number.isFinite(begin)) return null;
  const rawEnd = Date.parse(p.endTime || '');
  const finish = Number.isFinite(rawEnd) && rawEnd > begin
    ? rawEnd : begin + match[1].minutes * 60000;
  const cancelled = type === 'BOOKING_CANCELLED';
  const method = cancelled ? 'CANCEL' : 'PUBLISH';
  const sequence = cancelled ? 2 : type === 'BOOKING_RESCHEDULED' ? 1 : 0;
  const properties = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NoLimits Barbershop//Terminservice//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:' + method,
    'BEGIN:VEVENT',
    'UID:nolimits-' + aliasId + '@nolimits-barber.ch',
    'DTSTAMP:' + calendarUTC(Date.now()),
    'DTSTART:' + calendarUTC(begin),
    'DTEND:' + calendarUTC(finish),
    'SEQUENCE:' + sequence,
    'STATUS:' + (cancelled ? 'CANCELLED' : 'CONFIRMED'),
    'SUMMARY:' + calendarEscape('NoLimits Barbershop – ' + match[1].name),
    'LOCATION:' + calendarEscape('Schmiedgasse 94, 6438 Ibach, Schweiz'),
    'DESCRIPTION:' + calendarEscape('Termin bei NoLimits Barbershop. Änderungen und Absagen über den persönlichen Link aus der Bestätigungs-E-Mail. Bei manueller Kalenderübernahme aktualisieren sich Einträge je nach Kalender-App nicht automatisch.'),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  const ics = properties.map(calendarFold).join('\r\n') + '\r\n';
  return {
    filename: 'NoLimits_Termin.ics',
    content: btoa(String.fromCharCode(...new TextEncoder().encode(ics))),
    content_type: 'text/calendar; charset=utf-8'
  };
}

function mailEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function mailHtml(event, p, match, manageUrl, hasCalendar = false, env = {}) {
  const cancelled = event === 'BOOKING_CANCELLED';
  const title = cancelled ? 'Dein Termin wurde storniert' : event === 'BOOKING_RESCHEDULED' ? 'Dein Termin wurde verschoben' : 'Dein Termin ist bestätigt';
  const intro = cancelled ? 'Dein Termin wurde erfolgreich storniert. Hier findest du die Angaben zur abgesagten Buchung.' : event === 'BOOKING_RESCHEDULED' ? 'Dein Termin wurde erfolgreich verschoben. Hier sind deine neuen Termindetails.' : 'Vielen Dank für deine Buchung. Wir freuen uns auf deinen Besuch bei NoLimits.';
  const securityHint = cancelled ? 'Du hast diese Stornierung nicht veranlasst? Kontaktiere bitte direkt den Barbershop.' : 'Falls du die Buchung nicht vorgenommen hast, kontaktiere bitte direkt den Barbershop. Deinen persönlichen Terminlink solltest du nicht weitergeben.';
  const when = new Intl.DateTimeFormat('de-CH',{timeZone:TIME_ZONE,dateStyle:'full',timeStyle:'short'}).format(new Date(p.startTime));
  const price = match[1].price == null ? '' : '<div style="font-size:14px;line-height:1.8;color:#59534a;"><strong style="color:#171715;">Preis:</strong> CHF '+mailEscape(match[1].price)+' · Bezahlung vor Ort</div>';
  const safeLink = manageUrl ? '<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate;margin-top:27px;"><tr><td style="background:#c0974f;border-radius:3px;"><a class="email-button" href="'+mailEscape(manageUrl)+'" style="display:inline-block;padding:16px 29px;color:#0f0f0e;background:#c0974f;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;text-decoration:none;letter-spacing:.2px;">Termin verwalten</a></td></tr></table>' : '';
  return `<!DOCTYPE html>
<html lang="de-CH" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title} | NoLimits Barbershop</title>
<style>
  @media only screen and (max-width: 600px) {
    .email-shell { width: 100% !important; }
    .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
    .email-title { font-size: 30px !important; line-height: 1.2 !important; }
    .email-button { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#ebe4d8;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;color:#1b1a17;">
<div style="display:none;font-size:1px;line-height:1px;opacity:0;max-height:0;overflow:hidden;color:#ebe4d8;">${title} – deine Buchungsinformationen von NoLimits Barbershop.</div>
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background-color:#ebe4d8;">
<tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" class="email-shell" width="560" border="0" cellspacing="0" cellpadding="0" style="width:560px;max-width:100%;border-collapse:collapse;background-color:#f4efe7;">
<tr><td align="center" style="background:#0f0f0e;padding:35px 24px 28px;border-top:5px solid #c0974f;">
<img src="${mailEscape(publicSiteBase(env)+'/assets/img/logo-nolimits.jpg')}" alt="NoLimits Barbershop" width="78" height="78" style="width:78px;height:78px;object-fit:cover;border:0;display:block;margin:0 auto 17px;">
<div style="font-size:11px;font-weight:700;letter-spacing:3px;line-height:17px;color:#d9b672;text-transform:uppercase;">NOLIMITS BARBERSHOP</div>
<div style="height:1px;width:72px;background:#c0974f;margin-top:16px;"></div>
</td></tr>
<tr><td class="email-padding" style="padding:46px 45px 36px;">
<div style="font-size:10px;line-height:16px;font-weight:700;color:#8d6a2c;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:15px;">DEIN TERMIN BEI NOLIMITS</div>
<h1 class="email-title" style="font-family:Georgia,'Times New Roman',serif;font-size:37px;line-height:1.16;font-weight:400;letter-spacing:-.6px;margin:0 0 20px;color:#171715;">${title}</h1>
<p style="font-size:15px;line-height:1.8;color:#59534a;margin:0 0 27px;">${intro}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background-color:#ebe4d8;border-left:4px solid #c0974f;">
<tr><td style="padding:22px 23px;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;color:#171715;margin-bottom:16px;">${mailEscape(match[1].name)}</div>
<div style="font-size:14px;line-height:1.8;color:#59534a;"><strong style="color:#171715;">Wann:</strong> ${mailEscape(when)} Uhr</div>
<div style="font-size:14px;line-height:1.8;color:#59534a;"><strong style="color:#171715;">Dauer:</strong> ${mailEscape(match[1].minutes)} Minuten</div>
${price}
<div style="font-size:14px;line-height:1.8;color:#59534a;"><strong style="color:#171715;">Ort:</strong> Schmiedgasse 94, 6438 Ibach</div>
</td></tr></table>
${safeLink}
${hasCalendar ? '<p style="font-size:13px;line-height:1.8;color:#59534a;margin:20px 0 0;">Eine Kalenderdatei liegt bei. Beim Importieren oder bei Änderungen bitte den bestehenden Kalendereintrag kontrollieren; der Kalender wird nicht automatisch synchronisiert.</p>' : ''}
<p style="font-size:13px;line-height:1.8;color:#59534a;margin:28px 0 0;">${securityHint}</p>
<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin-top:33px;border-collapse:collapse;"><tr><td style="height:1px;background:#ddd4c4;"></td></tr></table>
<p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#59534a;">NoLimits Barbershop · Schmiedgasse 94, 6438 Ibach · Bezahlung vor Ort.</p>
</td></tr>
<tr><td class="email-padding" style="background:#171715;padding:27px 45px 29px;">
<div style="font-size:12px;color:#d9b672;font-weight:bold;letter-spacing:.7px;">NoLimits Barbershop</div>
<div style="font-size:11px;color:#a8a093;margin-top:8px;line-height:1.8;">Schmiedgasse 94, 6438 Ibach, Schweiz</div>
<div style="font-size:11px;margin-top:10px;"><a href="${mailEscape(publicSiteBase(env))}" style="color:#d9b672;text-decoration:underline;">Website</a> &nbsp;&nbsp; <a href="${mailEscape(publicSiteBase(env)+'/impressum/')}" style="color:#d9b672;text-decoration:underline;">Impressum &amp; Datenschutz</a></div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
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
  let customer = (p.attendees || []).find(a=>isEmail(String(a.email||'')));
  // Some cancellation/reschedule webhooks omit attendees; resolve via Cal.com if possible.
  if (!customer) {
    try {
      const lookup = await readCalBooking(uid, env);
      customer = (lookup.booking?.attendees || []).find(a=>isEmail(String(a.email||'')));
    } catch { /* no verified attendee: fail safely below */ }
  }
  if (!customer) return json({ok:true,ignored:true},200,req,env);
  let destinationEmail;
  try {
    destinationEmail = await resolveAttendeeEmail(env, customer.email);
  } catch {
    // Do not fall back to sending the branded email to an alias.
    // A non-2xx response also permits upstream retries where supported.
    return fail('alias_lookup_failed','Die E-Mail-Zuordnung konnte nicht geprüft werden.',503,req,env);
  }
  const tok = typ==='BOOKING_CANCELLED'?null:await managementToken(uid,p.startTime,env);
  const link = customerManageLink(uid, tok, env);
  const subject = typ==='BOOKING_CANCELLED'?'Dein Termin wurde storniert – NoLimits Barbershop':typ==='BOOKING_RESCHEDULED'?'Dein neuer Termin – NoLimits Barbershop':'Dein Termin ist bestätigt – NoLimits Barbershop';
  const calendar = calendarAttachment(typ, p, match, customer.email, env);
  const mail = {from:'NoLimits Barbershop <noreply@nolimits-barber.ch>',to:[destinationEmail],subject,
    html:mailHtml(typ,p,match,link,!!calendar,env)};
  if (calendar) mail.attachments = [calendar];
  const key = 'nolimits/'+typ+'/'+uid;
  const resp=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify(mail),redirect:'manual'
  });
  if (!resp.ok) return fail('delivery_failed','E-Mail nicht zugestellt.',502,req,env);
  return json({ok:true,sent:true},200,req,env);
}


// Google Code Model popup: exchange the one-time code on the server.
// No Google refresh tokens/access tokens or OAuth client secrets are returned to the browser.
const GOOGLE_WEB_CLIENT_ID = '341617264129-o9h3p41bg2d4tftrnu8vmupf02aht5f2.apps.googleusercontent.com';
async function exchangeGoogleCode(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin || !origins(env).includes(origin)) {
    return fail('forbidden_origin', 'Origin nicht erlaubt.', 403, req, env);
  }
  // A non-simple header forces a browser CORS preflight. Combined with
  // Origin validation, this implements Google's recommended popup CSRF guard.
  if (req.headers.get('X-Requested-With') !== 'NoLimitsGoogleOAuth') {
    return fail('invalid_request', 'Ungültige Anfrage.', 403, req, env);
  }
  if (!(req.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return fail('invalid_content_type', 'JSON erwartet.', 415, req, env);
  }
  if (await limited(env, 'RL_BOOK', 'oauth:' + clientIp(req), 10, 60_000)) {
    return fail('rate_limited', 'Zu viele Anmeldeversuche.', 429, req, env);
  }
  if (!env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return fail('not_configured', 'Google-Anmeldung nicht eingerichtet.', 503, req, env);
  }
  let data;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return fail('request_too_large', 'Ungültige Anfrage.', 413, req, env);
    data = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 'Ungültige Anfrage.', 400, req, env);
  }
  const code = data && typeof data.code === 'string' ? data.code : '';
  if (code.length < 8 || code.length > 2048 || /[\x00-\x1f]/.test(code)) {
    return fail('invalid_code', 'Ungültiger Anmeldecode.', 400, req, env);
  }
  // Google's popup Code Model requires the ORIGIN of the initiating page,
  // not the Worker URL, as redirect_uri for this server-side token exchange.
  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_WEB_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: origin,
    grant_type: 'authorization_code'
  });
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    return fail('google_unavailable', 'Google ist momentan nicht erreichbar.', 502, req, env);
  }
  if (!response.ok) {
    // Do not expose Google's error body, access tokens, refresh tokens, or secrets.
    return fail('google_exchange_failed', 'Die Google-Anmeldung konnte nicht abgeschlossen werden.', 502, req, env);
  }
  let tokens;
  try { tokens = await response.json(); } catch {
    return fail('google_invalid_response', 'Ungültige Google-Antwort.', 502, req, env);
  }
  const idToken = tokens && typeof tokens.id_token === 'string' ? tokens.id_token : '';
  if (idToken.length < 100 || idToken.length > 16000 || idToken.split('.').length !== 3) {
    return fail('google_missing_id_token', 'Google hat kein Anmeldetoken gesendet.', 502, req, env);
  }
  // Sanity-check issuer/audience/time before returning the ID token.
  // Supabase subsequently verifies its cryptographic signature for sign-in.
  try {
    const claims = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.aud !== GOOGLE_WEB_CLIENT_ID ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
        !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
      return fail('google_invalid_claims', 'Ungültiges Google-Anmeldetoken.', 502, req, env);
    }
  } catch {
    return fail('google_invalid_claims', 'Ungültiges Google-Anmeldetoken.', 502, req, env);
  }
  return json({ ok: true, idToken }, 200, req, env, {
    'Referrer-Policy': 'no-referrer',
    'Pragma': 'no-cache'
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    const origin = req.headers.get('Origin');
    if (origin && !origins(env).includes(origin)) return fail('forbidden_origin', 'Origin nicht erlaubt.', 403, req, env);
    try {
      if (req.method === 'POST' && url.pathname === '/api/auth/google/exchange') return await exchangeGoogleCode(req, env);
      if (req.method === 'POST' && url.pathname === '/api/webhooks/cal') return await onCalWebhook(req, env);
      if ((req.method === 'GET' || req.method === 'POST') && (url.pathname === '/api/manage' || url.pathname.startsWith('/api/manage/'))) return await routeManage(req, env, url);
      if (url.pathname.startsWith('/api/admin/')) {
        const access = await requireStaff(req, env);
        if (!access.ok) return fail(access.code, access.message, access.status, req, env);
        if (req.method === 'GET' && url.pathname === '/api/admin/services') {
          const available = Object.entries(SERVICES).concat(
            env.NL_ALIAS_STAGING_ONLY === 'true' ? [] : Object.entries(ADMIN_SERVICES));
          const list = available.map(([key,s]) =>
            ({ key, name:s.name, minutes:s.minutes, price:s.price ?? null, internal:!!ADMIN_SERVICES[key] }));
          return json({ ok:true, services:list }, 200, req, env);
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/contacts') return await getContacts(req, env);
        if (req.method === 'GET' && url.pathname === '/api/admin/slots') {
          const key = url.searchParams.get('service');
          const service = SERVICES[key] ||
            (env.NL_ALIAS_STAGING_ONLY === 'true' ? null : ADMIN_SERVICES[key]);
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

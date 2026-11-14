/**
 * NoLimits Systemtest – 2026-11-15
 * Ohne Zugangsdaten, ohne echte Kundendaten, ohne Terminbuchungen.
 * Aufruf: node tests/NoLimits_Systemtest_20261115.mjs
 */
import assert from 'node:assert/strict';
const page = 'https://localboostzs.github.io/nolimits';
const worker = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const supabase = 'https://jcctdjjunxmxaphjkrsz.supabase.co';
const publishableKey = 'sb_publishable_HcTcEU_hx4qhURf1nHYqrQ_HAqK8sxx';
const origin = { Origin: 'https://localboostzs.github.io' };
let passed = 0;
async function request(url, options = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), ...options });
  return { response: r, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text() };
}
function ok(condition, description) {
  assert.ok(condition, description);
  console.log('PASS', description);
  passed++;
}
const health = await request(worker + '/api/health', { headers: origin });
ok(health.response.status === 200 && health.data.ok, 'Buchungsdienst erreichbar');
const publicServices = await request(worker + '/api/services', { headers: origin });
ok(publicServices.response.status === 200 && publicServices.data.services.length === 9, 'Genau neun öffentliche Dienstleistungen');
ok(!publicServices.data.services.some(s => s.key === 'gentleman-rasur'), 'Interne Gentleman-Rasur nicht öffentlich');
const noAdmin = await request(worker + '/api/admin/services', { headers: origin });
ok(noAdmin.response.status === 401, 'Interne API ohne Login gesperrt');
const noContacts = await request(worker + '/api/admin/contacts', { headers: origin });
ok(noContacts.response.status === 401, 'Kundenliste ohne Login gesperrt');
const forged = await request(worker + '/api/admin/services', {
  headers: { ...origin, Authorization: 'Bearer invalid-for-test' }
});
ok(forged.response.status === 401, 'Ungültiger Token wird abgewiesen');
const hidden = await request(worker + '/api/slots?service=gentleman-rasur&start=2026-11-17&end=2026-11-17', { headers: origin });
ok(hidden.response.status === 400, 'Gentleman-Rasur nicht öffentlich anfragbar');
const unknown = await request(worker + '/api/slots?service=not-a-service&start=2026-11-17&end=2026-11-17', { headers: origin });
ok(unknown.response.status === 400, 'Unbekannter Service abgewiesen');
const blocked = await request(worker + '/api/services', { headers: { Origin: 'https://example.invalid' } });
ok(blocked.response.status === 403, 'Fremde Website-Origin gesperrt');
const preflight = await fetch(worker + '/api/admin/services', {
  method: 'OPTIONS', headers: {
    Origin: origin.Origin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type'
  }
});
ok(preflight.status === 204 && (preflight.headers.get('Access-Control-Allow-Headers') || '').includes('Authorization'), 'CORS für autorisierte Anfragen');
const today = new Date();
const daysUntilTuesday = (2 - today.getUTCDay() + 7) % 7 || 7;
today.setUTCDate(today.getUTCDate() + daysUntilTuesday);
const day = today.toISOString().slice(0, 10);
const slots = await request(worker + '/api/slots?service=haarschnitt&start=' + day + '&end=' + day, { headers: origin });
ok(slots.response.status === 200 && slots.data.ok && slots.data.days, 'Live-Cal.com-Verfügbarkeit abrufbar');
for (const path of ['/booking-test/', '/konto/', '/verwaltung/']) {
  const r = await request(page + path);
  ok(r.response.status === 200 && r.data.includes('NoLimits'), 'Seite ' + path + ' erreichbar');
}
const cfg = await request(page + '/assets/js/account-config.js?v=20261115-2');
ok(cfg.response.status === 200 && cfg.data.includes('jcctdjjunxmxaphjkrsz') && cfg.data.includes('publicSignupReady: false'),
   'Isolierte Supabase-Konfiguration und Signup-Gate aktiv');
for (const template of ['NoLimits_Email_Anmeldung_20261115.html','NoLimits_Email_Registrierung_20261115.html']) {
  const r = await request(page + '/emails/' + template);
  ok(r.response.status === 200 && r.data.includes('{{ .ConfirmationURL }}') && r.data.includes('NoLimits'),
    'Branded Template ' + template + ' vorhanden');
}
const guest = await request(supabase + '/rest/v1/nl_customer_profiles?select=user_id&limit=1', {
  headers: { apikey: publishableKey }
});
ok(guest.response.status === 401, 'Gast darf Kundenprofile nicht auslesen');
const guestStaff = await request(supabase + '/rest/v1/nl_staff?select=role&limit=1', {
  headers: { apikey: publishableKey }
});
ok(guestStaff.response.status === 401, 'Gast darf keine Mitarbeiterrollen auslesen');
console.log('FERTIG: ' + passed + ' von ' + passed + ' Prüfungen bestanden');

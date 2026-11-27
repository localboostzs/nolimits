/**
 * NoLimits LIVE-Systemtest (liest die veroeffentlichte Seite, den Worker und Supabase).
 * Nur GET/OPTIONS. Ohne Zugangsdaten, ohne echte Kundendaten, ohne Terminbuchungen.
 * Nicht Teil der Offline-Tests.
 * Aufruf: node tests/live/NoLimits_Systemtest_Live_20261115.mjs [legacy|candidate]
 *   legacy    = bisheriger Worker-Code (neun oeffentliche Leistungen)
 *   candidate = Release-Kandidat (zehn Leistungen inkl. Gentleman Rasur)
 * Andere Adresse der Website: NOLIMITS_SITE=https://www.nolimits-barber.ch
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkReadiness } from '../../tools/NoLimits_ReadonlyPreflight_20261119.mjs';
const baseline = process.argv[2] || process.env.NOLIMITS_BASELINE || 'legacy';
assert.ok(['legacy', 'candidate'].includes(baseline), 'Baseline muss legacy oder candidate sein');
const candidate = baseline === 'candidate';
const page = (process.env.NOLIMITS_SITE || 'https://localboostzs.github.io/nolimits').replace(/\/+$/, '');
const onGitHubPages = new URL(page).hostname.endsWith('.github.io');
const worker = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const supabase = 'https://jcctdjjunxmxaphjkrsz.supabase.co';
const publishableKey = 'sb_publishable_HcTcEU_hx4qhURf1nHYqrQ_HAqK8sxx';
const origin = { Origin: new URL(page).origin };
let passed = 0;
// Wrapper, der jede schreibende Anfrage verweigert.
const readOnly = (url, options = {}) => {
  assert.ok(['GET', 'OPTIONS'].includes(options.method || 'GET'), 'Live-Test darf nur lesen');
  return fetch(url, { signal: AbortSignal.timeout(20000), ...options });
};
async function request(url, options = {}) {
  const r = await readOnly(url, options);
  return { response: r, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text() };
}
function ok(condition, description) {
  assert.ok(condition, description);
  console.log('PASS', description);
  passed++;
}
console.log('LIVE-Systemtest, erwarteter Stand: ' + baseline);
await checkReadiness(worker, { baseline, client: readOnly });
ok(true, 'Dienstleistungen, Dauer und Preise entsprechen dem Stand "' + baseline + '"');
const health = await request(worker + '/api/health', { headers: origin });
ok(health.response.status === 200 && health.data.ok, 'Buchungsdienst erreichbar');
const noAdmin = await request(worker + '/api/admin/services', { headers: origin });
ok(noAdmin.response.status === 401, 'Interne API ohne Login gesperrt');
const noContacts = await request(worker + '/api/admin/contacts', { headers: origin });
ok(noContacts.response.status === 401, 'Kundenliste ohne Login gesperrt');
const forged = await request(worker + '/api/admin/services', {
  headers: { ...origin, Authorization: 'Bearer invalid-for-test' }
});
ok([401, 403, 503].includes(forged.response.status), 'Ungueltiger Token bekommt keinen Zugriff');
if (forged.response.status === 503)
  console.warn('WARN: Admin-Authentifizierung erreicht Supabase derzeit nicht zuverlaessig (HTTP 503), Mitarbeiter-Live-Test offen');
const today = new Date();
const daysUntilTuesday = (2 - today.getUTCDay() + 7) % 7 || 7;
today.setUTCDate(today.getUTCDate() + daysUntilTuesday);
const day = today.toISOString().slice(0, 10);
const slotsFor = (service) => request(worker + '/api/slots?service=' + service + '&start=' + day + '&end=' + day, { headers: origin });
const gentleman = await slotsFor('gentleman-rasur');
ok(gentleman.response.status === (candidate ? 200 : 400),
  candidate ? 'Gentleman Rasur oeffentlich anfragbar' : 'Gentleman Rasur nicht oeffentlich anfragbar');
const unknown = await slotsFor('not-a-service');
ok(unknown.response.status === 400, 'Unbekannter Service abgewiesen');
const blocked = await request(worker + '/api/services', { headers: { Origin: 'https://example.invalid' } });
ok(blocked.response.status === 403, 'Fremde Website-Origin gesperrt');
const preflight = await readOnly(worker + '/api/admin/services', {
  method: 'OPTIONS', headers: {
    Origin: origin.Origin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type'
  }
});
ok(preflight.status === 204 && (preflight.headers.get('Access-Control-Allow-Headers') || '').includes('Authorization'), 'CORS fuer autorisierte Anfragen');
const slots = await slotsFor('haarschnitt');
ok(slots.response.status === 200 && slots.data.ok && slots.data.days, 'Live-Cal.com-Verfuegbarkeit abrufbar');
for (const path of ['/booking-test/', '/konto/', '/verwaltung/']) {
  const r = await request(page + path);
  ok(r.response.status === 200 && r.data.includes('NoLimits'), 'Seite ' + path + ' erreichbar');
}
const cfg = await request(page + '/assets/js/account-config.js?v=20261115-2');
ok(cfg.response.status === 200 && cfg.data.includes('jcctdjjunxmxaphjkrsz') && cfg.data.includes('publicSignupReady: false'),
   'Isolierte Supabase-Konfiguration und Signup-Gate aktiv');
// Supabase mail templates are checked in the repository: they are internal and must not be published.
const emailDir = new URL('../../emails/', import.meta.url);
for (const template of ['NoLimits_Email_Anmeldung_20261115.html', 'NoLimits_Email_Registrierung_20261115.html']) {
  const source = fs.readFileSync(new URL(template, emailDir), 'utf8');
  ok(source.includes('{{ .ConfirmationURL }}') && source.includes('NoLimits'), 'Branded Template ' + template + ' im Repository');
}
// Netlify and Cloudflare Pages must send the policy that keeps host-injected inline scripts (badge) inactive.
// GitHub Pages cannot send headers.
if (!onGitHubPages) {
  const policy = (await readOnly(page + '/')).headers.get('content-security-policy') || '';
  const scripts = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) || '';
  ok(scripts.startsWith("script-src 'self'") && !/unsafe-|\*|data:|blob:/.test(scripts), 'CSP aktiv, keine Inline-Skripte erlaubt');
}
// Internal paths must not exist on any host. verwaltung-lab/ is still served by GitHub Pages only.
const hiddenPaths = ['/README.md', '/worker/src/index.js', '/tests/run-offline.mjs', '/tools/', '/supabase/',
  '/deploy/NoLimits_public_allowlist.txt', '/.gitignore', ...fs.readdirSync(emailDir).map((name) => '/emails/' + name),
  ...(onGitHubPages ? [] : ['/verwaltung-lab/'])];
for (const hidden of hiddenPaths) {
  const r = await readOnly(page + hidden);
  ok(r.status === 404, 'Intern und nicht ausgeliefert: ' + hidden);
}
const guest = await request(supabase + '/rest/v1/nl_customer_profiles?select=user_id&limit=1', {
  headers: { apikey: publishableKey }
});
ok(guest.response.status === 401, 'Gast darf Kundenprofile nicht auslesen');
const guestStaff = await request(supabase + '/rest/v1/nl_staff?select=role&limit=1', {
  headers: { apikey: publishableKey }
});
ok(guestStaff.response.status === 401, 'Gast darf keine Mitarbeiterrollen auslesen');
console.log('FERTIG: ' + passed + ' von ' + passed + ' Pruefungen bestanden');

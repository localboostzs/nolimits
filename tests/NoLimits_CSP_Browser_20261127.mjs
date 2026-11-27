// Offline browser test of the Content Security Policy sent by Netlify and Cloudflare Pages.
// The built website is served with exactly the headers of its _headers file. Every page and every
// important flow runs; the browser must report no violation. A host-injected inline script (the
// mechanism of the "Powered by Netlify" badge) must stay blocked and invisible.
// Real page files, real Supabase client library and real Worker code; Cal.com, Supabase, Google
// and WhatsApp are simulated. No network access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createMock, secrets, tomlVars, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
import worker from '../worker/src/index.js';

// The production domain after the switch (the Worker only writes this or the github.io address into links).
const SITE = 'https://www.nolimits-barber.ch';
const API = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const AUTH = 'https://jcctdjjunxmxaphjkrsz.supabase.co';
const WA = 'https://wa.me/41768019340';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };

/* 1. Build for both hosts and check the policy itself */
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-csp-'));
const build = (host) => {
  const out = path.join(work, host);
  execFileSync(process.execPath, ['deploy/NoLimits_build_pages.mjs', '--host', host, '--out', out], { stdio: 'pipe' });
  return out;
};
const dist = build('netlify'), pagesDist = build('cloudflare');
function headerRules(folder) {
  const rules = [];
  for (const line of fs.readFileSync(path.join(folder, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ match: line.trim(), headers: {} }); continue; }
    const m = line.trim().match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) rules.at(-1).headers[m[1]] = m[2];
  }
  return rules;
}
const rules = headerRules(dist);
const everywhere = (list) => list.find((r) => r.match === '/*').headers;
const CSP = everywhere(rules)['Content-Security-Policy'];
assert.ok(CSP, 'Netlify build sends a policy');
assert.equal(everywhere(headerRules(pagesDist))['Content-Security-Policy'], CSP, 'same policy on Cloudflare Pages');
for (const f of [dist, pagesDist]) for (const line of fs.readFileSync(path.join(f, '_headers'), 'utf8').split(/\r?\n/)) assert.ok(line.length <= 2000, 'Pages line limit');
const policy = Object.fromEntries(CSP.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
assert.deepEqual(policy['script-src'], ["'self'", 'https://accounts.google.com/gsi/client'], 'scripts: own files and Google sign-in only');
for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'https:', 'data:', 'blob:']) {
  for (const d of ['default-src', 'script-src', 'connect-src', 'frame-src']) assert.ok(!(policy[d] || []).includes(bad), d + ' must not allow ' + bad);
}
assert.deepEqual(policy['default-src'], ["'self'"]);
assert.deepEqual(policy['object-src'], ["'none'"]);
assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
assert.deepEqual(policy['base-uri'], ["'self'"]);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) assert.ok(/\ssrc=|type="application\/ld\+json"/.test(m[1]), 'no executable inline script: ' + file);
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i, 'no inline event handler: ' + file);
  assert.doesNotMatch(html, /(href|src|action)="\s*javascript:/i, 'no javascript: address: ' + file);
}

/* 2. Browser: the built website with its real headers */
const env = { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml'), NL_SUPABASE_URL: SUPABASE,
  ALLOWED_ORIGINS: SITE, NL_PUBLIC_SITE_BASE: SITE };
const options = { headless: true, args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch(options);
const staffUser = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'staff@example.test' };
const session = () => ({ access_token: 'mock', refresh_token: 'mock', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: staffUser });
// Stand-in for Google's library: uses the sources Google documents (script, style, frame, connect).
const GSI = `window.google={accounts:{oauth2:{initCodeClient:function(c){
  var l=document.createElement('link');l.rel='stylesheet';l.href='https://accounts.google.com/gsi/style';document.head.appendChild(l);
  var f=document.createElement('iframe');f.src='https://accounts.google.com/gsi/frame';f.hidden=true;document.body.appendChild(f);
  fetch('https://accounts.google.com/gsi/status').catch(function(){});
  return {requestCode:function(){c.callback({code:'mock-code'});}};}}}};`;
// Own copy of the badge mechanism: same-origin script, frame clipped to nothing until an INLINE script inside it asks to be shown.
const HUD = `(function(){var f=document.createElement('iframe');f.id='nl-badge-frame';
  f.style.cssText='position:fixed;bottom:0;right:0;border:0;width:216px;height:92px;z-index:2147483645;clip-path:path("M0 0Z")';
  f.srcdoc='<!doctype html><body style="margin:0;background:#000;color:#fff">Powered by Netlify<script>parent.postMessage({nlShow:1},"*")<\\/script></body>';
  addEventListener('message',function(e){if(e.source===f.contentWindow&&e.data&&e.data.nlShow)f.style.clipPath='none';});
  document.body.appendChild(f);})();`;
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
let ip = 0;

async function open({ width = 390, withPolicy = true, inject = '', staff = false } = {}) {
  const mock = createMock();
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
  const violations = [], errors = [], seen = [], address = '10.9.0.' + (++ip);
  await context.exposeBinding('__nlViolation', (_source, v) => violations.push(v));
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => window.__nlViolation({ directive: e.violatedDirective, blocked: e.blockedURI, page: location.href, sample: e.sample || '' }));
  });
  if (staff) {
    await context.addInitScript((value) => {
      if (location.origin === 'https://www.nolimits-barber.ch') sessionStorage.setItem('sb-jcctdjjunxmxaphjkrsz-auth-token', value);
    }, JSON.stringify(session()));
  }
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    seen.push(method + ' ' + url.origin + url.pathname);
    if (url.origin === SITE) {
      if (url.pathname === '/.netlify/scripts/hud') return route.fulfill({ contentType: types['.js'], body: HUD });
      let rel = decodeURIComponent(url.pathname.slice(1));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      let file = path.join(dist, rel), status = 200;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { file = path.join(dist, '404.html'); status = 404; }
      const headers = {};
      for (const r of rules) if (r.match === '/*' || (r.match.startsWith('/') && url.pathname.startsWith(r.match.replace(/\*$/, '')))) Object.assign(headers, r.headers);
      if (!withPolicy) delete headers['Content-Security-Policy'];
      let body = fs.readFileSync(file);
      if (inject && file.endsWith('.html')) body = body.toString('utf8').replace('</body>', inject + '</body>');
      return route.fulfill({ status, contentType: types[path.extname(file)] || 'application/octet-stream', headers, body });
    }
    if (url.origin === API) {
      if (url.pathname === '/api/auth/google/exchange') {
        return route.fulfill({ status: method === 'OPTIONS' ? 204 : 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ ok: true, idToken: 'mock.id.token' }) });
      }
      const headers = { ...(await req.allHeaders()), origin: SITE, 'cf-connecting-ip': address };
      for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
      const real = globalThis.fetch; globalThis.fetch = mock.fetch;
      try {
        const res = await worker.fetch(new Request(req.url(), { method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : req.postData() }), env);
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
      } finally { globalThis.fetch = real; }
    }
    if (url.origin === AUTH) {
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const reply = url.pathname === '/auth/v1/user' ? staffUser
        : url.pathname === '/auth/v1/token' ? session()
        : url.pathname === '/auth/v1/settings' ? { external: { google: true } }
        : url.pathname === '/rest/v1/nl_staff' ? [{ role: 'staff', active: true }]
        : url.pathname.startsWith('/rest/') ? [] : {};
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(reply) });
    }
    if (url.origin === 'https://accounts.google.com') {
      if (url.pathname === '/gsi/client') return route.fulfill({ contentType: types['.js'], body: GSI });
      if (url.pathname === '/gsi/style') return route.fulfill({ contentType: types['.css'], body: '.nl-gsi-mock{color:#000}' });
      return route.fulfill({ headers: cors, contentType: 'text/html', body: '<!doctype html><title>g</title>' });
    }
    if (url.origin === 'https://www.google.com' || url.origin === 'https://wa.me') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>external</title>ok' });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const go = async (p) => { await page.goto(p.startsWith('http') ? p : SITE + p, { waitUntil: 'load' }); };
  const reject = async () => { const b = page.locator('.nl-privacy-reject'); if (await b.isVisible().catch(() => false)) await b.click(); };
  const until = async (what, test) => { for (let i = 0; i < 150; i++) { if (await test()) return; await page.waitForTimeout(100); } assert.fail('timeout: ' + what); };
  const clean = (what) => assert.deepEqual(violations, [], 'policy violations: ' + what);
  const close = async (what) => { await page.waitForTimeout(300); clean(what); assert.deepEqual(errors, [], 'script errors: ' + what); await context.close(); };
  return { mock, context, page, violations, errors, seen, go, reject, until, clean, close };
}
async function pick(page, root, nth) {
  await page.locator(root + ' .bk-grid').first().waitFor({ timeout: 15000 });
  for (let i = 0; i < 3 && (await page.locator(root + ' button.bk-day.is-free').count()) <= nth; i++) {
    await page.locator(root + ' .bk-nav').last().click();
    await page.locator(root + ' .bk-grid').first().waitFor({ timeout: 15000 });
  }
  await page.locator(root + ' button.bk-day.is-free').nth(nth).click();
  await page.locator(root + ' .bk-slot').first().click();
}

try {
  /* 2a. Every page, phone and desktop: styles, fonts, images and scripts load */
  for (const width of [390, 1366]) {
    const t = await open({ width }), { page } = t;
    for (const p of ['/', '/leistungen/', '/kontakt/', '/ueber-mich/', '/impressum/', '/konto/', '/booking-test/', '/termin-verwalten/', '/verwaltung/', '/gibt-es-nicht']) {
      await t.go(p);
      await page.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
        await document.fonts.ready;
      });
      await page.waitForLoadState('networkidle').catch(() => {});
      const state = await page.evaluate(() => ({
        broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src),
        styled: getComputedStyle(document.body).fontFamily,
        fontError: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
        main: window.NOLIMITS_CONFIG ? window.NOLIMITS_CONFIG.BOOKING_URL : '',
      }));
      assert.deepEqual(state.broken, [], width + ' images on ' + p);
      assert.deepEqual(state.fontError, [], width + ' fonts on ' + p);
      if (p !== '/gibt-es-nicht') assert.match(state.styled, /Inter|sans/i, width + ' stylesheet on ' + p);
      t.clean(width + ' ' + p);
    }
    await t.close('all pages ' + width);
  }
  console.log('PASS Seiten: 10 Adressen, Handy und PC, ohne Verstoss');

  /* 2b. Price notice, cookie banner (reject, reopen, accept), Google Maps, WhatsApp */
  {
    const t = await open(), { page } = t;
    await t.go('/');
    await page.locator('#nl-price-notice[open]').waitFor();
    await page.locator('#nl-price-notice .nl-notice-ok').click();
    assert.equal(await page.locator('#nl-price-notice[open]').count(), 0);
    await page.locator('.nl-privacy-reject').click();
    assert.equal(t.seen.some((s) => s.includes('www.google.com/maps')), false, 'no map without consent');
    await page.locator('.nl-privacy-reopen').click();
    await page.locator('.nl-privacy-accept').click();
    await t.until('map request', () => t.seen.some((s) => s.includes('www.google.com/maps')));
    await t.go('/kontakt/');
    await t.until('map frame', () => page.frames().some((f) => f.url().startsWith('https://www.google.com/maps')));
    const [popup] = await Promise.all([t.context.waitForEvent('page'), page.locator('.page-hero a.nl-wa').click()]);
    await popup.waitForURL(/wa\.me/);
    assert.ok(popup.url().startsWith(WA), 'WhatsApp opens');
    await popup.close();
    await t.close('home, cookies, map, WhatsApp');
  }
  console.log('PASS Preishinweis, Cookie-Banner, Karte, WhatsApp');

  /* 2c. Services page script and the whole customer flow: book, manage, reschedule, cancel */
  {
    const t = await open(), { page, mock } = t;
    await t.go('/leistungen/');
    await t.reject();
    await t.until('Gentleman button', async () => (await page.locator('#nl-gentleman-book').textContent()).trim() === 'Buchen');
    await t.go('/booking-test/');
    await page.locator('#services button.bk-service', { hasText: 'Haarschnitt mit Waschen' }).click();
    // A free day more than 24 hours ahead, so that rescheduling and cancelling are allowed.
    await page.locator('#cal button.bk-day.is-free').first().waitFor();
    if (await page.locator('#cal button.bk-day.is-free').count() < 3) {
      await page.locator('#cal-next').click(); await page.locator('#cal button.bk-day.is-free').first().waitFor();
    }
    await page.locator('#cal button.bk-day.is-free').nth(2).click();
    await page.locator('#slots button.bk-slot').first().click();
    await page.locator('#f-name').waitFor({ state: 'visible' });
    await page.locator('#f-name').fill('Testkunde');
    await page.locator('#f-email').fill('kunde@example.test');
    await page.locator('#f-phone').fill('+41 79 000 00 00');
    await page.locator('#f-address').fill('Testweg 1, 6438 Ibach');
    await page.locator('#f-terms').check();
    await page.waitForTimeout(3300); // the Worker refuses forms sent within 3 s
    await page.locator('#bk-submit').click();
    await page.locator('#bk-manage-link').waitFor({ state: 'visible' });
    assert.equal(mock.calPosts.length, 1, 'exactly one booking');
    await t.go(await page.locator('#bk-manage-link').getAttribute('href'));
    await page.locator('#nl-manage-details').waitFor({ state: 'visible' });
    await page.locator('#nl-manage-show-reschedule').click();
    await page.locator('#nl-manage-calendar button.nl-manage-day:not([disabled])').last().click();
    await page.locator('#nl-manage-slots button').last().click();
    await page.locator('#nl-manage-confirm-reschedule').check();
    await page.locator('#nl-manage-reschedule-submit').click();
    await page.locator('#nl-manage-result').waitFor({ state: 'visible' });
    const moved = [...mock.bookings.values()].at(-1);
    const exp = Math.floor(Date.parse(moved.start) / 1000) + 7 * 86400;
    const token = exp + '.' + crypto.createHmac('sha256', env.NL_MANAGE_SECRET).update(moved.uid + ':' + exp).digest('base64url');
    await t.go('/termin-verwalten/?uid=' + moved.uid + '&token=' + token);
    await page.locator('#nl-manage-show-cancel').click();
    await page.locator('#nl-manage-confirm-cancel').check();
    await page.locator('#nl-manage-cancel [type=submit]').click();
    await page.locator('#nl-manage-result').waitFor({ state: 'visible' });
    assert.equal(mock.bookings.get(moved.uid).status, 'cancelled');
    await t.close('customer flow');
  }
  console.log('PASS Buchen, Verwalten, Umbuchen, Absagen');

  /* 2d. Sign-in: e-mail link (Supabase) and Google (library, style, frame, Worker, Supabase) */
  for (const route of ['/konto/', '/booking-test/']) {
    const t = await open(), { page } = t;
    await t.go(route);
    await t.reject();
    if (route === '/konto/') {
      await page.locator('#nl-email-form [name=email]').fill('kunde@example.test');
      await page.locator('#nl-email-form [type=submit]').click();
      await t.until('e-mail link request', () => t.seen.includes('POST ' + AUTH + '/auth/v1/otp'));
    }
    if (route === '/booking-test/') {
      // The sign-in box belongs to the details step: choose a service, a day and a time first.
      await page.locator('#services button.bk-service', { hasText: 'Haarschnitt mit Waschen' }).click();
      await page.locator('#cal button.bk-day.is-free').first().click();
      await page.locator('#slots button.bk-slot').first().click();
    }
    await t.until('Google library', () => t.seen.includes('GET https://accounts.google.com/gsi/client'));
    const button = page.locator('#nl-google-login');
    await t.until('Google button ready', () => button.isEnabled());
    await button.click();
    await t.until('code exchange', () => t.seen.includes('POST ' + API + '/api/auth/google/exchange'));
    await t.until('Supabase sign-in', () => t.seen.includes('POST ' + AUTH + '/auth/v1/token'));
    for (const source of ['/gsi/style', '/gsi/frame', '/gsi/status']) await t.until(source, () => t.seen.includes('GET https://accounts.google.com' + source));
    await t.close('sign-in ' + route);
  }
  console.log('PASS Anmeldung per E-Mail-Link und Google, Konto und Buchungsseite');

  /* 2e. Staff portal with a real Supabase session: contacts, booking, series confirmation */
  for (const width of [390, 1366]) {
    const t = await open({ width, staff: true }), { page, mock } = t;
    mock.addBooking({ eventTypeId: 7888953, start: new Date(Date.now() + 5 * 86400000).toISOString(), email: 'anna@example.test', name: 'Anna Beispiel' });
    await t.go('/verwaltung/');
    await t.reject();
    await page.locator('#nl-admin-service option').nth(10).waitFor({ state: 'attached', timeout: 20000 });
    await page.locator('#nl-contacts .nl-contact', { hasText: 'Anna Beispiel' }).click();
    await page.locator('#nl-new-customer').click();
    await page.locator('#nl-admin-service').selectOption('haarschnitt');
    await pick(page, '#nl-admin-calendar', 2);
    await page.locator('#nl-cname').fill('Testkunde');
    await page.locator('#nl-cemail').fill('neu@example.test');
    await page.locator('#nl-cphone').fill('+41 79 000 00 02');
    await page.locator('#nl-admin-book-form input[name=accepted]').check();
    await page.locator('#nl-admin-book-form [type=submit]').click();
    await t.until('staff booking', async () => /Termin erfolgreich gebucht/.test(await page.locator('#nl-admin-notice').textContent()));
    assert.equal(mock.calPosts.length, 1);
    await t.close('staff portal ' + width);
  }
  console.log('PASS Mitarbeiterportal mit Anmeldung, Handy und PC');

  /* 3. Host-injected script and inline code */
  const INJECT = '<script async src="/.netlify/scripts/hud?variant=public"></script>';
  const badge = (page) => page.evaluate(() => {
    const f = document.getElementById('nl-badge-frame');
    return f ? { clip: f.style.clipPath, hit: document.elementFromPoint(innerWidth - 20, innerHeight - 20) === f } : null;
  });
  {
    const control = await open({ withPolicy: false, inject: INJECT });
    await control.go('/kontakt/');
    await control.until('badge visible without policy', async () => (await badge(control.page))?.clip === 'none');
    assert.equal((await badge(control.page)).hit, true, 'control: badge covers the corner');
    await control.context.close();
    for (const width of [320, 390, 1366]) {
      const t = await open({ width, inject: INJECT }), { page } = t;
      for (const p of ['/', '/kontakt/', '/booking-test/', '/verwaltung/']) {
        await t.go(p);
        await page.evaluate(() => document.getElementById('nl-price-notice')?.close());
        await t.reject();
        await page.waitForTimeout(700);
        const state = await badge(page);
        assert.ok(state, 'the host script itself runs (own origin)');
        assert.match(state.clip, /path\(/, width + ' ' + p + ': badge stays clipped to nothing');
        assert.equal(state.hit, false, width + ' ' + p + ': nothing covers the bottom right corner');
      }
      assert.ok(t.violations.length >= 4, 'the inline script was blocked');
      assert.ok(t.violations.every((v) => /^script-src/.test(v.directive) && v.blocked === 'inline'), 'only the injected inline script is blocked: ' + JSON.stringify(t.violations.slice(0, 3)));
      assert.deepEqual(t.errors, []);
      await t.context.close();
    }
    const t = await open({ inject: '<script>window.__nlInline=1</script><img src="x-missing.png" onerror="window.__nlHandler=1">' });
    await t.go('/impressum/');
    await t.page.waitForTimeout(700);
    assert.deepEqual(await t.page.evaluate(() => [window.__nlInline || 0, window.__nlHandler || 0]), [0, 0], 'inline script and handler never run');
    await t.context.close();
  }
  console.log('PASS eingeschleustes Skript bleibt wirkungslos, Badge unsichtbar (320, 390, 1366 px)');
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log('PASS: Content Security Policy – Seiten, Abläufe, Anmeldung, Portal und eingeschleuste Skripte');

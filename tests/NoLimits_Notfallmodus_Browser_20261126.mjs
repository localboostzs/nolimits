// Offline outage simulations: booking API dead, hanging, answering with error pages, or losing
// the answer after it has acted. Customer booking, appointment management and staff portal,
// real page files and Worker code, simulated Cal.com/Supabase only. No network access.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createMock, secrets, tomlVars, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
import { SERVICES } from '../worker/src/services.js';
import worker from '../worker/src/index.js';

const SITE = 'https://www.nolimits-barber.ch';
const API = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
const baseEnv = { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml'), NL_SUPABASE_URL: SUPABASE, ALLOWED_ORIGINS: SITE };
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const SHOTS = process.env.NOLIMITS_SHOTS || '';
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const visible = (page, selector) => page.locator(selector).isVisible();
let ip = 0, passed = 0;
const ok = (name) => { passed++; console.log('ok ' + name); };

// fault(method, path) returns undefined (normal), 'down' (connection refused), 'hang' (no answer),
// 'lost' (the server acts, the answer never arrives) or { status, body, type }.
async function open(route, { width = 390, env = {}, fault, storage = true } = {}) {
  const mock = createMock();
  const t = { mock, fault, calls: [], external: new Set(), errors: [], dialogs: [] };
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
  const address = '10.4.0.' + (++ip);
  await context.route('**/*', async (r) => {
    const req = r.request(), url = new URL(req.url());
    if (url.origin === API) {
      const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      if (req.method() !== 'OPTIONS') t.calls.push(req.method() + ' ' + url.pathname);
      const f = req.method() === 'OPTIONS' ? undefined : t.fault?.(req.method(), url.pathname);
      if (f === 'down') return r.abort('connectionrefused');
      if (f === 'hang') return;
      if (f && f !== 'lost') return r.fulfill({ status: f.status, headers: { ...cors, 'Content-Type': f.type || 'application/json' },
        body: typeof f.body === 'string' ? f.body : JSON.stringify(f.body) });
      const headers = { ...(await req.allHeaders()), origin: SITE, 'cf-connecting-ip': address };
      for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
      const real = globalThis.fetch; globalThis.fetch = t.mock.fetch;
      try {
        const res = await worker.fetch(new Request(req.url(), { method: req.method(), headers,
          body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), { ...baseEnv, ...env });
        const body = await res.text();
        if (f === 'lost') return r.abort('connectionreset');
        return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body });
      } finally { globalThis.fetch = real; }
    }
    if (url.origin === SITE) {
      let rel = decodeURIComponent(url.pathname.slice(1));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (rel === 'assets/js/auth-client.js') {
        const staff = route.startsWith('/verwaltung/');
        return r.fulfill({ contentType: types['.js'], body: staff
          ? "window.NOLIMITS_ACCOUNT={enabled:true,user:async()=>({id:'x',email:'staff@example.test'}),staff:async()=>({role:'staff',active:true}),bearer:async()=>'mock',profile:async()=>null,saveProfile:async()=>{}};"
          : 'window.NOLIMITS_ACCOUNT={enabled:false};' });
      }
      const file = path.resolve(rel);
      if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: 'missing' });
      return r.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    t.external.add(url.hostname);
    return r.abort();
  });
  if (!storage) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  const page = await context.newPage();
  page.on('pageerror', (e) => t.errors.push(e.message));
  page.on('dialog', (d) => { t.dialogs.push(d.message()); d.accept(); });
  await page.clock.install();
  await page.goto(SITE + route, { waitUntil: 'load' });
  await page.evaluate(() => document.getElementById('nl-price-notice')?.close()); // price notice on the home page
  const reject = page.locator('.nl-privacy-reject');
  if (await reject.isVisible().catch(() => false)) await reject.click();
  t.page = page;
  t.posts = () => t.calls.filter((c) => c.startsWith('POST ')).length;
  t.shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
  t.close = async () => { assert.deepEqual(t.errors, [], 'script errors on ' + route); await context.close(); };
  return t;
}
// Isen is reachable only via WhatsApp (message or WhatsApp call): WhatsApp link, number shown, no tel: link.
async function phoneOffered(locator) {
  assert.equal(await locator.locator('a[href="https://wa.me/41768019340"]').count() >= 1, true, 'WhatsApp link');
  assert.equal(await locator.locator('a[href^="tel:"]').count(), 0, 'no phone call link');
  assert.match(await text(locator), /076 801 93 40/);
  assert.doesNotMatch(await text(locator), /anrufen|telefonisch/i);
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scrolling');
}
async function toForm(t) {
  const { page } = t;
  await page.locator('.bk-service').first().click();
  const free = page.locator('#cal .bk-day.is-free');
  await page.locator('#cal .bk-grid').waitFor();
  if (!(await free.count())) { await page.locator('#cal-next').click(); await free.first().waitFor(); }
  await free.first().click();
  await page.locator('#slots .bk-slot').first().click();
  await page.clock.runFor(600);
  await page.locator('#f-name').fill('Testkunde');
  await page.locator('#f-email').fill('kunde@example.test');
  await page.locator('#f-phone').fill('+41 79 000 00 00');
  await page.locator('#f-address').fill('Testweg 1, 6438 Ibach');
  await page.locator('#f-terms').check();
  await page.clock.fastForward(5000); // Worker refuses forms sent within three seconds
}
const send = (t) => t.page.locator('#bk-submit').click();
const success = (t) => visible(t.page, '#bk-ok.is-active');
async function expectUnclear(t, name) {
  const card = t.page.locator('#bk-unclear');
  await card.waitFor({ timeout: 15000 });
  const content = await text(card);
  assert.match(content, /Status deiner Buchung unklar.*Bitte buche nicht erneut/, name);
  assert.doesNotMatch(content, /Erneut versuchen|bestätigt\b|nichts gebucht/i, name);
  await phoneOffered(card);
  assert.equal(await success(t), false, name + ': no confirmation');
  assert.equal(await visible(t.page, '#bk-submit'), false, name + ': form gone');
}

try {
  /* ---------- A. Whole API unreachable (what a large Cloudflare outage looks like) ---------- */
  for (const width of [320, 390, 1366]) {
    let down = true;
    const t = await open('/booking-test/', { width, fault: () => (down ? 'down' : undefined) });
    const panel = t.page.locator('#services .nl-notfall');
    await t.page.clock.runFor(5000);
    await panel.waitFor({ timeout: 15000 });
    assert.match(await text(panel), /Online-Buchung gerade nicht möglich.*Es wurde nichts gebucht.*Öffnungszeiten: Di/);
    await phoneOffered(panel);
    assert.equal(await panel.locator('a[href="https://wa.me/41768019340"]').count(), 1);
    assert.equal(await success(t), false);
    assert.equal(t.posts(), 0);
    await noOverflow(t.page);
    await t.shot('notfall-' + width);
    down = false;
    await panel.getByRole('button', { name: 'Erneut versuchen' }).click();
    await t.page.locator('.bk-service').first().waitFor();
    assert.equal(await t.page.locator('.nl-notfall').count(), 0, 'recovers without reload');
    await t.close();
    ok('API unreachable, ' + width + ' px: emergency panel, phone, recovery');
  }
  {
    const t = await open('/booking-test/', { fault: () => 'hang' });
    await t.page.clock.runFor(6000);
    await t.page.locator('#services', { hasText: 'Das dauert länger als üblich' }).waitFor();
    await t.page.clock.runFor(9000); await t.page.clock.runFor(10000); await t.page.clock.runFor(12000);
    await t.page.locator('#services .nl-notfall').waitFor({ timeout: 15000 });
    await t.close();
    ok('hanging API: phone hint after 5 s, emergency panel after the time limits');
  }
  {
    const page522 = { status: 522, type: 'text/html', body: '<html>error code: 522</html>' };
    const t = await open('/booking-test/', { fault: () => page522 });
    await t.page.clock.runFor(5000);
    await t.page.locator('#services .nl-notfall').waitFor({ timeout: 15000 });
    assert.doesNotMatch(await text(t.page.locator('#services')), /522|html/);
    await t.close();
    ok('error page instead of data: emergency panel, no raw error');
  }
  {
    let broken = true;
    const t = await open('/booking-test/', { fault: (m, p) => (broken && p === '/api/slots'
      ? { status: 502, body: { ok: false, error: { code: 'upstream_error', message: 'Termine konnten nicht geladen werden.' } } } : undefined) });
    await t.page.locator('.bk-service').first().click();
    const panel = t.page.locator('#cal .nl-notfall');
    await panel.waitFor();
    await phoneOffered(panel);
    broken = false;
    await panel.getByRole('button', { name: 'Erneut versuchen' }).click();
    await t.page.locator('#cal .bk-grid').waitFor();
    await t.close();
    ok('calendar unavailable (Cal.com down): emergency panel and recovery');
  }

  /* ---------- B. Normal booking and API failing right before sending ---------- */
  {
    const t = await open('/booking-test/');
    await toForm(t); await send(t);
    await t.page.locator('#bk-ok.is-active').waitFor({ timeout: 15000 });
    assert.match(await text(t.page.locator('#bk-ok')), /Dein Termin ist bestätigt.*Kommt innert 15 Minuten nichts an.*WhatsApp.*076 801 93 40/i);
    assert.equal(t.mock.bookings.size, 1);
    assert.equal(await t.page.evaluate(() => localStorage.getItem('nl-booking-unklar')), null, 'nothing left open');
    await t.close();
    ok('normal booking: confirmation, no open record');
  }
  {
    let down = false;
    const t = await open('/booking-test/', { width: 320, fault: () => (down ? 'down' : undefined) });
    await toForm(t); down = true; await send(t);
    const box = t.page.locator('#bk-outage');
    await box.waitFor({ timeout: 15000 });
    assert.match(await text(box), /nicht gesendet, es ist nichts gebucht/);
    await phoneOffered(box);
    assert.equal(t.posts(), 0, 'nothing sent');
    assert.equal(await success(t), false);
    await noOverflow(t.page);
    down = false; await send(t);
    await t.page.locator('#bk-ok.is-active').waitFor({ timeout: 15000 });
    assert.equal(t.mock.bookings.size, 1);
    await t.close();
    ok('API gone before sending: nothing sent, clear statement, later retry books once');
  }

  /* ---------- C. Unknown outcome: never confirm, never invite a retry ---------- */
  const answer = (status, code, message) => ({ status, body: { ok: false, error: { code, message } } });
  const unclear = {
    'connection reset': 'down',
    '522 error page': { status: 522, type: 'text/html', body: '<html>522</html>' },
    'upstream_unreachable': answer(502, 'upstream_unreachable', 'Die Buchung konnte nicht gesendet werden. Bitte erneut versuchen.'),
    'upstream_error': answer(502, 'upstream_error', 'Die Buchung konnte nicht abgeschlossen werden.'),
    'not_confirmed': answer(502, 'not_confirmed', 'Die Buchung wurde nicht bestätigt. Bitte erneut versuchen.'),
    'internal': answer(500, 'internal', 'Interner Fehler.'),
    'success without booking': { status: 201, body: { ok: true } },
    'pending booking': { status: 201, body: { ok: true, booking: { uid: 'x', status: 'pending', start: new Date(Date.now() + 864e5).toISOString() } } },
    'booking without id': { status: 201, body: { ok: true, booking: { status: 'accepted', start: new Date(Date.now() + 864e5).toISOString() } } },
    'empty answer': { status: 200, type: 'text/plain', body: '' },
  };
  for (const [name, fault] of Object.entries(unclear)) {
    const t = await open('/booking-test/', { fault: (m, p) => (p === '/api/book' ? fault : undefined) });
    await toForm(t); await send(t);
    await expectUnclear(t, name);
    assert.equal(t.posts(), 1);
    await t.close();
    ok('unclear: ' + name);
  }
  {
    const t = await open('/booking-test/', { width: 320, fault: (m, p) => (p === '/api/book' ? 'hang' : undefined) });
    await toForm(t); await send(t);
    for (let i = 0; i < 100 && !t.posts(); i++) await new Promise((r) => setTimeout(r, 50));
    await t.page.clock.runFor(31000);
    await expectUnclear(t, 'time limit');
    await noOverflow(t.page);
    await t.shot('unklar-320');
    await t.page.reload();
    await expectUnclear(t, 'after reload');
    assert.equal(await visible(t.page, '#bk-main'), false);
    await t.page.getByRole('button', { name: /Ich habe nachgefragt/ }).click();
    await t.page.locator('.bk-service').first().waitFor();
    assert.equal(await t.page.locator('#bk-unclear').count(), 0);
    await t.close();
    ok('unclear after 30 s: stays after reload until the customer confirms having asked');
  }
  {
    const t = await open('/booking-test/', { fault: (m, p) => (p === '/api/book' ? 'hang' : undefined) });
    await toForm(t);
    await t.page.locator('#bk-form').evaluate((f) => { f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
    for (let i = 0; i < 100 && !t.posts(); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(t.posts(), 1, 'one request only');
    await t.page.reload();
    await expectUnclear(t, 'closed while sending');
    await t.close();
    ok('triple submit sends once; reload while sending shows the unclear state');
  }
  {
    const t = await open('/booking-test/', { fault: (m, p) => (p === '/api/book' ? 'lost' : undefined) });
    await toForm(t); await send(t);
    await expectUnclear(t, 'answer lost');
    assert.equal(t.mock.bookings.size, 1, 'the booking exists although the browser never heard of it');
    await t.page.reload();
    await expectUnclear(t, 'answer lost, reload');
    assert.equal(t.posts(), 1);
    assert.equal(t.mock.bookings.size, 1, 'no second booking');
    await t.close();
    ok('real Worker books, answer lost: no confirmation, no double booking');
  }
  {
    const t = await open('/booking-test/');
    const base = t.mock.fetch;
    t.mock.fetch = async (input, opts = {}) => {
      const res = await base(input, opts);
      if (new URL(String(input)).pathname === '/v2/bookings' && opts.method === 'POST') throw new TypeError('timeout');
      return res;
    };
    await toForm(t); await send(t);
    await expectUnclear(t, 'Cal.com accepted, Worker timed out');
    assert.equal(t.mock.bookings.size, 1);
    await t.close();
    ok('Cal.com accepts but the Worker gets no answer: unclear instead of «bitte erneut versuchen»');
  }
  {
    const t = await open('/booking-test/', { storage: false, fault: (m, p) => (p === '/api/book' ? 'down' : undefined) });
    await toForm(t); await send(t);
    await expectUnclear(t, 'storage blocked');
    await t.close();
    ok('blocked browser storage: unclear state still shown');
  }

  /* ---------- D. Definite refusals stay normal messages ---------- */
  for (const [code, status, message] of [['rate_limited', 429, 'Zu viele Buchungsversuche. Bitte später erneut versuchen.'],
    ['alias_unavailable', 503, 'Die Buchung ist momentan nicht verfügbar. Bitte später erneut versuchen.']]) {
    const t = await open('/booking-test/', { fault: (m, p) => (p === '/api/book' ? answer(status, code, message) : undefined) });
    await toForm(t); await send(t);
    if (status >= 500) { // a part of the system is down: say that nothing was booked and offer the phone
      await t.page.locator('#bk-outage').waitFor();
      assert.match(await text(t.page.locator('#bk-outage')), /nicht eingetragen/);
      await phoneOffered(t.page.locator('#bk-outage'));
    } else {
      await t.page.locator('#bk-formmsg:not([hidden])').waitFor();
      assert.equal(await text(t.page.locator('#bk-formmsg')), message);
    }
    assert.equal(await t.page.locator('#bk-unclear').count(), 0);
    assert.equal(await t.page.locator('#bk-submit').isEnabled(), true);
    assert.equal(await t.page.evaluate(() => localStorage.getItem('nl-booking-unklar')), null);
    await t.close();
    ok('definite refusal: ' + code);
  }
  {
    const t = await open('/booking-test/', { fault: (m, p) => (p === '/api/book' ? answer(409, 'slot_unavailable', 'Dieser Termin ist leider nicht mehr verfügbar. Bitte einen anderen wählen.') : undefined) });
    await toForm(t); await send(t);
    await t.page.locator('#cal-note', { hasText: 'nicht mehr verfügbar' }).waitFor();
    assert.equal(await t.page.locator('#bk-unclear').count(), 0);
    await t.close();
    ok('taken slot: back to the calendar');
  }

  /* ---------- E. Appointment management ---------- */
  const link = (mock, days = 6) => {
    const start = new Date(Date.now() + days * 86400000).toISOString();
    const b = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start, email: 'kunde@example.test' });
    const expiry = Math.floor(Date.parse(start) / 1000) + 7 * 86400;
    const token = expiry + '.' + crypto.createHmac('sha256', secrets.NL_MANAGE_SECRET).update(b.uid + ':' + expiry).digest('base64url');
    return { b, query: '?uid=' + b.uid + '&token=' + token };
  };
  async function manage(fault) {
    const t = await open('/termin-verwalten/', { width: 320 });
    const made = link(t.mock);
    await t.page.goto(SITE + '/termin-verwalten/' + made.query);
    await t.page.locator('#nl-manage-details').waitFor();
    t.fault = fault; t.booking = made.b; t.query = made.query;
    return t;
  }
  {
    const t = await open('/termin-verwalten/', { width: 320, fault: () => 'down' });
    await t.page.goto(SITE + '/termin-verwalten/?uid=' + 'a'.repeat(20) + '&token=1.x');
    await t.page.locator('#nl-manage-unavailable').waitFor();
    await phoneOffered(t.page.locator('#nl-manage-unavailable'));
    await noOverflow(t.page);
    await t.close();
    ok('management page while the API is down: phone');
  }
  const cancel = async (t) => {
    await t.page.locator('#nl-manage-show-cancel').click();
    await t.page.locator('#nl-manage-confirm-cancel').check();
    await t.page.locator('#nl-manage-cancel [type=submit]').click();
  };
  {
    const t = await manage();
    t.fault = () => 'down';
    await cancel(t);
    await t.page.locator('#nl-manage-msg', { hasText: 'Es wurde nichts geändert' }).waitFor();
    await phoneOffered(t.page.locator('#nl-manage-msg'));
    assert.equal(t.posts(), 0); assert.equal(t.booking.status, 'accepted');
    await t.close();
    ok('cancel while down: nothing sent');
  }
  {
    const t = await manage((m, p) => (p === '/api/manage/cancel' ? 'lost' : undefined));
    await cancel(t);
    await t.page.locator('#nl-manage-unclear').waitFor();
    assert.match(await text(t.page.locator('#nl-manage-result')), /Status unklar.*nicht erneut/);
    assert.doesNotMatch(await text(t.page.locator('#nl-manage-details')), /wurde storniert/);
    assert.equal(await visible(t.page, '#nl-manage-actions'), false);
    assert.equal(await visible(t.page, '#nl-manage-result > a'), false);
    await phoneOffered(t.page.locator('#nl-manage-unclear'));
    await noOverflow(t.page);
    t.fault = undefined;
    await t.page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await t.page.locator('#nl-manage-result-title', { hasText: 'storniert' }).waitFor();
    assert.equal(t.posts(), 1);
    await t.close();
    ok('cancel with lost answer: unclear, reload shows the real state');
  }
  {
    const t = await manage((m, p) => (p === '/api/manage/cancel' ? answer(409, 'cancellation_deadline', 'Online-Stornierungen sind nur bis 24 Stunden vor dem Termin möglich. Bitte kontaktiere NoLimits.') : undefined));
    await cancel(t);
    await t.page.locator('#nl-manage-msg', { hasText: '24 Stunden' }).waitFor();
    assert.equal(await t.page.locator('#nl-manage-unclear').count(), 0);
    await t.close();
    ok('cancel refused: normal message');
  }
  {
    const t = await manage((m, p) => (p === '/api/manage/reschedule' ? 'lost' : undefined));
    await t.page.locator('#nl-manage-show-reschedule').click();
    const free = t.page.locator('#nl-manage-calendar button.is-free');
    await t.page.locator('#nl-manage-calendar button').first().waitFor();
    if (!(await free.count())) { await t.page.locator('#nl-manage-next').click(); await free.first().waitFor(); }
    await free.last().click();
    await t.page.locator('#nl-manage-slots button').first().click();
    await t.page.locator('#nl-manage-confirm-reschedule').check();
    await t.page.locator('#nl-manage-reschedule-submit').click();
    await t.page.locator('#nl-manage-unclear').waitFor();
    assert.match(await text(t.page.locator('#nl-manage-result')), /Status unklar.*nicht erneut/);
    assert.equal(await t.page.locator('#nl-manage-unclear button').count(), 0, 'no retry for a move');
    assert.equal(t.posts(), 1);
    await t.close();
    ok('reschedule with lost answer: unclear, no retry');
  }

  /* ---------- F. Staff portal ---------- */
  const staffBooking = async (t, { repeat = false } = {}) => {
    const { page } = t;
    await page.locator('#nl-admin-service option').nth(5).waitFor({ state: 'attached' });
    await page.locator('#nl-admin-service').selectOption('haarschnitt');
    const free = page.locator('#nl-admin-calendar button.bk-day.is-free');
    await page.locator('#nl-admin-calendar .bk-grid').first().waitFor();
    if (!(await free.count())) { await page.locator('#nl-admin-calendar .bk-nav').last().click(); await free.first().waitFor(); }
    await free.first().click();
    await page.locator('#nl-admin-calendar .bk-slot').first().click();
    await page.locator('#nl-cname').fill('Testkunde');
    await page.locator('#nl-cemail').fill('kunde@example.test');
    await page.locator('#nl-cphone').fill('+41 79 000 00 00');
    if (repeat) await page.locator('#nl-admin-repeat').check();
    await page.locator('input[name=accepted]').check();
  };
  const staffSubmit = (t) => t.page.locator('#nl-admin-book-form [type=submit]');
  const notice = (t, pattern) => t.page.locator('#nl-admin-notice', { hasText: pattern }).waitFor({ timeout: 15000 });
  {
    const t = await open('/verwaltung/', { width: 390, fault: () => 'down' });
    await notice(t, 'Google-Kalender');
    assert.match(await text(t.page.locator('#nl-admin-notice')), /nicht erreichbar.*Termine, die per WhatsApp eingehen/);
    await t.close();
    ok('portal while down: calendar fallback instruction');
  }
  {
    const t = await open('/verwaltung/', { width: 1366 });
    await staffBooking(t);
    t.fault = (m, p) => (p === '/api/health' ? 'down' : undefined);
    await staffSubmit(t).click();
    await notice(t, 'Es wurde nichts gesendet');
    assert.equal(t.posts(), 0);
    assert.equal(await staffSubmit(t).isEnabled(), true);
    t.fault = (m, p) => (p === '/api/admin/book' ? 'lost' : undefined);
    await staffSubmit(t).click();
    await notice(t, /Status unklar.*Nicht erneut buchen/);
    assert.equal(await staffSubmit(t).isDisabled(), true);
    await t.page.locator('#nl-admin-book-form').evaluate((f) => f.requestSubmit());
    assert.equal(t.posts(), 1, 'locked');
    assert.equal(t.mock.bookings.size, 1);
    t.fault = () => 'down';
    await t.page.locator('#nl-refresh').click();
    await notice(t, 'nicht erreichbar');
    assert.equal(await staffSubmit(t).isDisabled(), true, 'stays locked while the state cannot be read');
    t.fault = undefined;
    await t.page.locator('#nl-refresh').click();
    await notice(t, 'Stand neu geladen');
    assert.equal(await staffSubmit(t).isEnabled(), true);
    await t.close();
    ok('portal booking: nothing sent when down, locked after a lost answer until reloaded');
  }
  {
    const partial = answer(502, 'series_partial', 'Nur 2 von 4 Terminen sicher bestätigt. Bitte Cal.com kontrollieren, bevor du die Serie erneut startest.');
    const t = await open('/verwaltung/', { width: 1366 });
    await staffBooking(t, { repeat: true });
    t.fault = (m, p) => (p === '/api/admin/book-series' ? partial : undefined);
    await staffSubmit(t).click();
    await notice(t, /Nur 2 von 4.*Nicht erneut buchen/);
    assert.equal(await staffSubmit(t).isDisabled(), true);
    await t.close();
    ok('partial series: exact count, locked');
  }
  {
    const t = await open('/verwaltung/', { width: 1366 });
    t.mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: new Date(Date.now() + 5 * 864e5).toISOString(), email: 'anna@example.test', name: 'Anna Beispiel' });
    await t.page.locator('#nl-refresh').click();
    await t.page.locator('#nl-contacts .nl-contact', { hasText: 'Anna Beispiel' }).click();
    t.fault = (m, p) => (p === '/api/admin/cancel' ? 'lost' : undefined);
    await t.page.locator('.nl-appt-cancel').first().click();
    await notice(t, /Status unklar.*Prüfe den Termin/);
    assert.doesNotMatch(await text(t.page.locator('#nl-admin-notice')), /erfolgreich/);
    assert.equal(t.posts(), 1);
    await t.close();
    ok('portal cancel with lost answer: unclear');
  }

  /* ---------- G. Every public page works while all other services are gone ---------- */
  {
    const pages = fs.readFileSync('deploy/NoLimits_public_allowlist.txt', 'utf8').split(/\r?\n/)
      .filter((l) => l.endsWith('index.html')).map((l) => '/' + l.slice(0, -'index.html'.length));
    const hosts = {};
    for (const p of pages) {
      const t = await open(p, { fault: () => 'down' });
      await t.page.clock.runFor(30000);
      assert.ok((await t.page.locator('h1, h2').count()) > 0, 'content on ' + p);
      assert.equal(await t.page.locator('img').evaluateAll((imgs) => imgs.filter((i) => i.complete && !i.naturalWidth && i.src.startsWith(location.origin)).length), 0, 'images on ' + p);
      hosts[p] = [...t.external].sort().join(', ') || 'keine';
      await t.close();
    }
    console.log(JSON.stringify(hosts));
    ok('all public pages render with API and third parties unreachable');
  }
} finally { await browser.close(); }
console.log('PASS: outage simulations, ' + passed + ' scenarios (mocked backends, no real bookings).');

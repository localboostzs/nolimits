// Offline browser test of the 2027 price change on every surface: real frontend files,
// real Worker code, mocked Cal.com/Supabase/Resend, simulated clock. No network access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { createMock, secrets, tomlVars, sendWebhook, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
import { SERVICES } from '../worker/src/services.js';
import worker from '../worker/src/index.js';

const SITE = 'https://localboostzs.github.io/nolimits';
const API = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const env = { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml'), NL_SUPABASE_URL: SUPABASE };
const options = { headless: true, args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch(options);
const realNow = Date.now;
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
let ip = 0;

// One simulated moment for the Worker (Node) and the browser.
async function open(now, { popup = false } = {}) {
  const mock = createMock();
  mock.requiredTerms = new Set(Object.values(SERVICES).map((s) => s.eventTypeId));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
  await context.clock.install({ time: new Date(now) });
  // Shift Node only AFTER installing the browser clock, and call no further clock methods:
  // Playwright stamps them with Node's time and replays them against the browser's.
  const offset = Date.parse(now) - realNow();
  Date.now = () => realNow() + offset;
  const errors = [], dialogs = [], address = '10.2.0.' + (++ip);
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === API) {
      const headers = { ...(await req.allHeaders()), origin: 'https://localboostzs.github.io', 'cf-connecting-ip': address };
      for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
      const res = await worker.fetch(new Request(req.url(), { method: req.method(), headers,
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    }
    if (url.href.startsWith(SITE + '/')) {
      let rel = decodeURIComponent(url.pathname.slice('/nolimits/'.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (rel === 'assets/js/auth-client.js') return route.fulfill({ contentType: types['.js'], body:
        "window.NOLIMITS_ACCOUNT={enabled:true,user:async()=>location.pathname.includes('/verwaltung')?{id:'x',email:'staff@example.test'}:null," +
        "staff:async()=>({role:'staff',active:true}),bearer:async()=>'mock',profile:async()=>null,saveProfile:async()=>{}};" });
      const file = path.resolve(rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
      let body = fs.readFileSync(file);
      if (popup && rel === 'index.html') {
        const html = body.toString('utf8');
        assert.equal(html.split('var priceNoticeEnabled=false;').length, 2, 'exactly one go-live switch');
        body = html.replace('var priceNoticeEnabled=false;', 'var priceNoticeEnabled=true;');
      }
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  const go = async (p) => {
    await page.goto(p.startsWith('http') ? p : SITE + p, { waitUntil: 'load' });
    const reject = page.locator('.nl-privacy-reject');
    if (await reject.isVisible().catch(() => false) && !(await page.locator('#nl-price-notice[open]').count())) await reject.click();
  };
  const close = async () => { assert.deepEqual(errors, []); await context.close(); Date.now = realNow; };
  return { mock, page, dialogs, go, close };
}
const waitFor = async (locator, pattern) => {
  for (let i = 0; i < 100; i++) {
    if (pattern.test(await text(locator).catch(() => ''))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.match(await text(locator), pattern);
};

/* 1. Static pages, JSON-LD and popup */
const staticPrices = Object.values(SERVICES).map((s) => s.price).sort((a, b) => a - b);
for (const [now, after] of [['2026-12-31T22:00:00Z', false], ['2026-12-31T23:00:05Z', true]]) {
  const t = await open(now), { page } = t;
  await t.go('/leistungen/');
  const rows = await page.locator('.price[data-nl-price]').all();
  assert.equal(rows.length, 10);
  const bases = [];
  for (const row of rows) {
    const base = Number(await row.getAttribute('data-nl-price'));
    bases.push(base);
    const shown = (await text(row)).replace('30 Min · ', '');
    assert.equal(shown, after ? 'CHF ' + (base + 5) : 'CHF ' + base + ' ab 01.01.2027: CHF ' + (base + 5), now);
    const name = await text(row.locator('xpath=..').locator('.price-name'));
    assert.equal(base, Object.values(SERVICES).find((s) => s.name === name).price, name);
  }
  assert.deepEqual(bases.sort((a, b) => a - b), staticPrices);
  assert.equal(await page.locator('[data-nl-price-note]').isVisible(), !after, 'services note ' + now);
  await t.go('/');
  assert.equal(await page.locator('[data-nl-price-note]').isVisible(), !after, 'home note ' + now);
  assert.equal(await page.locator('#nl-price-notice[open]').count(), 0, 'popup stays off until go-live');
  await t.go('/?preisvorschau=1');
  await page.locator('#nl-price-notice[open]').waitFor();
  assert.match(await text(page.locator('#nl-price-notice')), /01\.01\.2027.*CHF 5\.–.*Datum des Termins/);
  await page.locator('#nl-price-notice .nl-notice-ok').click();
  assert.equal(await page.locator('#nl-price-notice[open]').count(), 0);
  await t.close();

  const live = await open(now, { popup: true });
  await live.go('/');
  assert.equal(await live.page.locator('#nl-price-notice[open]').count(), after ? 0 : 1, 'enabled popup ' + now);
  if (!after) {
    await live.page.locator('#nl-price-notice .nl-notice-close').click();
    // The dialog's close event (which remembers the visit) fires just after the click.
    await live.page.waitForFunction(() => sessionStorage.getItem('nolimits-price-notice-2027') === 'seen');
    await live.go('/');
    assert.equal(await live.page.locator('#nl-price-notice[open]').count(), 0, 'once per session');
  }
  await live.close();
}
for (const file of ['index.html', 'kontakt/index.html']) {
  assert.ok(fs.readFileSync(file, 'utf8').includes('"priceRange": "CHF ' + staticPrices[0] + ' - CHF ' + (staticPrices.at(-1) + 5) + '"'), file);
}

/* 2. Public booking and management across the turn of the year */
{
  const t = await open('2026-12-27T09:00:00Z'), { page, mock } = t;
  await t.go('/booking-test/');
  const card = page.locator('#services button.bk-service', { hasText: 'Haarschnitt mit Waschen' });
  await card.waitFor();
  assert.match(await text(card), /CHF 50 \(ab 01\.01\.2027: CHF 55\)/);
  await card.click();
  const summary = page.locator('#bk-summary');
  const day = (n) => page.locator('#cal button.bk-day.is-free', { hasText: new RegExp('^' + n + '$') });
  await day(30).click();
  await waitFor(summary, /CHF 50(?! \()/);
  await page.locator('#cal-next').click();
  await day(5).click();
  await waitFor(summary, /CHF 55/);
  await page.locator('#slots button.bk-slot').first().click();
  await page.locator('#f-name').waitFor({ state: 'visible' });
  await page.locator('#f-name').fill('Testkunde');
  await page.locator('#f-email').fill('kunde@example.test');
  await page.locator('#f-phone').fill('+41 79 000 00 00');
  await page.locator('#f-address').fill('Testweg 1, 6438 Ibach');
  await page.locator('#f-terms').check();
  await new Promise((r) => setTimeout(r, 3300)); // the Worker refuses forms sent within 3 s
  await page.locator('#bk-submit').click();
  await page.locator('#bk-manage-link').waitFor({ state: 'visible' });
  assert.match(await text(page.locator('#ok-list')), /CHF 55/);
  const [created] = [...mock.bookings.values()];
  assert.equal((await sendWebhook(worker, env, 'BOOKING_CREATED', { uid: created.uid })).status, 200);
  assert.match(mock.mails.at(-1).html, /Preis:<\/strong> CHF 55 ·/, 'booked in 2026, appointment 2027');

  // Manage: 2027 appointment moved into 2026 and back again.
  await t.go(await page.locator('#bk-manage-link').getAttribute('href'));
  const price = page.locator('#nl-manage-price'), hint = page.locator('#nl-manage-new-price');
  await page.locator('#nl-manage-details').waitFor({ state: 'visible' });
  assert.equal(await text(price), 'CHF 55 · vor Ort');
  const move = async (dayNumber, monthSteps, expected) => {
    await page.locator('#nl-manage-show-reschedule').click();
    for (let i = 0; i < monthSteps; i++) await page.locator('#nl-manage-next').click();
    const cell = page.locator('#nl-manage-calendar button.nl-manage-day:not([disabled])', { hasText: new RegExp('^' + dayNumber + '$') });
    await cell.click();
    assert.equal(await hint.isVisible(), false, 'no price before a time is chosen');
    await page.locator('#nl-manage-slots button').first().click();
    await waitFor(hint, expected);
    await page.locator('#nl-manage-confirm-reschedule').check();
    await page.locator('#nl-manage-reschedule-submit').click();
    await page.locator('#nl-manage-result').waitFor({ state: 'visible' });
  };
  await move(29, 0, /^Preis am neuen Termin: CHF 50 \(bisher CHF 55\), Zahlung vor Ort\.$/);
  assert.match(await text(page.locator('#nl-manage-result-message')), /CHF 50/);
  assert.equal(await text(price), 'CHF 50 · vor Ort');
  const moved = [...mock.bookings.values()].at(-1);
  assert.equal((await sendWebhook(worker, env, 'BOOKING_RESCHEDULED', { uid: moved.uid })).status, 200);
  assert.match(mock.mails.at(-1).html, /Preis:<\/strong> CHF 50 ·/);
  const link = new URL(mock.mails.at(-1).html.match(/href="([^"]*termin-verwalten[^"]*)"/)[1].replace(/&amp;/g, '&'));
  await t.go(link.href);
  await page.locator('#nl-manage-details').waitFor({ state: 'visible' });
  assert.match(await text(price), /^CHF 50 · vor Ort \(bei Termin ab 01\.01\.2027: CHF 55\)$/);
  await move(6, 1, /^Preis am neuen Termin: CHF 55 \(bisher CHF 50\), Zahlung vor Ort\.$/);
  assert.equal(await text(price), 'CHF 55 · vor Ort');
  const back = [...mock.bookings.values()].at(-1);
  assert.equal((await sendWebhook(worker, env, 'BOOKING_RESCHEDULED', { uid: back.uid })).status, 200);
  assert.match(mock.mails.at(-1).html, /Preis:<\/strong> CHF 55 ·/);
  await t.close();
}

/* 3. Staff dashboard: booking, weekly series and rescheduling across the year */
{
  const t = await open('2026-12-14T09:00:00Z'), { page, mock } = t;
  const exp = (start) => Math.floor(Date.parse(start) / 1000) + 7 * 86400;
  const existing = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: '2026-12-22T12:00:00.000Z', email: 'bestand@example.test', name: 'Bestandskunde' });
  assert.ok(exp(existing.start) && crypto);
  await t.go('/verwaltung/');
  await page.locator('#nl-contacts button.nl-contact', { hasText: 'Bestandskunde' }).click();
  await page.locator('#nl-info .nl-appt-reschedule').first().click();
  await page.locator('#nl-info .nl-appt-move input[type=date]').fill('2027-01-05');
  const times = page.locator('#nl-info .nl-appt-move select');
  await times.locator('option').nth(1).waitFor({ state: 'attached' });
  await times.selectOption({ index: 1 });
  await page.locator('#nl-info .nl-appt-save').click();
  await waitFor(page.locator('#nl-admin-notice'), /verschoben/);
  assert.match(t.dialogs.at(-1), /Preis am neuen Termin: CHF 35 \(bisher CHF 30\)\./);

  const box = page.locator('#nl-admin-price');
  await page.locator('#nl-admin-service').selectOption('haarschnitt');
  await page.locator('#nl-admin-date').fill('2027-01-02');
  await waitFor(box, /^Preis am gewählten Datum: CHF 35 \(Zahlung vor Ort\)\.$/);
  await page.locator('#nl-admin-date').fill('2026-12-19');
  await waitFor(box, /^Preis am gewählten Datum: CHF 30 /);
  await page.locator('#nl-admin-repeat').check();
  await waitFor(box, /^Preise nach Termindatum: 2 × CHF 30, 2 × CHF 35 \(Zahlung vor Ort\)\.$/);
  await page.locator('#nl-admin-slot option').nth(1).waitFor({ state: 'attached' });
  await page.locator('#nl-admin-slot').selectOption({ index: 1 });
  await page.locator('#nl-cname').fill('Serienkunde');
  await page.locator('#nl-cemail').fill('serie@example.test');
  await page.locator('#nl-cphone').fill('+41 79 000 00 01');
  await page.locator('#nl-admin-book-form input[name=accepted]').check();
  await page.locator('#nl-admin-book-form [type=submit]').click();
  await waitFor(page.locator('#nl-admin-notice'), /Serientermin erfolgreich: 4 Termine.*CHF 30, CHF 30, CHF 35, CHF 35\./);
  assert.match(t.dialogs.at(-1), /4 wöchentliche Termine.*2 × CHF 30, 2 × CHF 35/s);
  await t.close();
}

await browser.close();
console.log('PASS: 2027 prices on home, services, popup, booking, management (both directions) and staff dashboard');

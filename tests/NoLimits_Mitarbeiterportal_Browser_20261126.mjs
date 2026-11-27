// Offline browser test of the staff portal (verwaltung/): CRM list and details, booking calendar
// shared with the customer booking design, pre-submit check, series, short-notice staff actions.
// Real page files and Worker code, simulated Cal.com/Supabase data only. No network access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createMock, secrets, tomlVars, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
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
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const zurich = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const at = (days, hour) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
let ip = 0;

async function open(width) {
  const mock = createMock();
  const blockedDays = new Set(), slowServices = new Map();
  const base = mock.fetch;
  mock.fetch = async (input, opts = {}) => {
    const u = new URL(String(input));
    if (u.origin === SUPABASE && u.pathname === '/rest/v1/nl_customer_profiles')
      return Response.json([{ email: 'anna@example.test', full_name: 'Anna Beispiel', phone: '+41 79 000 00 11', last_service_key: 'haarschnitt' }]);
    if (u.pathname === '/v2/slots') {
      const delay = slowServices.get(Number(u.searchParams.get('eventTypeId')));
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const res = await base(input, opts), body = await res.json();
      for (const d of blockedDays) delete body.data[d];
      return Response.json(body);
    }
    return base(input, opts);
  };
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
  const errors = [], dialogs = [], calls = [], address = '10.3.0.' + (++ip);
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === API) {
      const headers = { ...(await req.allHeaders()), origin: 'https://localboostzs.github.io', 'cf-connecting-ip': address };
      for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
      const real = globalThis.fetch; globalThis.fetch = mock.fetch;
      try {
        const res = await worker.fetch(new Request(req.url(), { method: req.method(), headers,
          body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env);
        calls.push(req.method() + ' ' + url.pathname + url.search);
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
      } finally { globalThis.fetch = real; }
    }
    if (url.href.startsWith(SITE + '/')) {
      let rel = decodeURIComponent(url.pathname.slice('/nolimits/'.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (rel === 'assets/js/auth-client.js') return route.fulfill({ contentType: types['.js'], body:
        "window.NOLIMITS_ACCOUNT={enabled:true,user:async()=>({id:'x',email:'staff@example.test'})," +
        "staff:async()=>({role:'staff',active:true}),bearer:async()=>'mock',profile:async()=>null,saveProfile:async()=>{}};" });
      const file = path.resolve(rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(SITE + '/verwaltung/', { waitUntil: 'load' });
  const reject = page.locator('.nl-privacy-reject');
  if (await reject.isVisible().catch(() => false)) await reject.click();
  const close = async () => { assert.deepEqual(errors, []); await context.close(); };
  return { mock, page, dialogs, calls, blockedDays, slowServices, close };
}
async function pick(page, root, day) {
  const grid = page.locator(root + ' .bk-grid');
  await grid.first().waitFor({ timeout: 15000 });
  const button = page.locator(root + ' button.bk-day[data-day="' + day + '"]');
  for (let i = 0; i < 14 && !(await button.count()); i++) {
    await page.locator(root + ' .bk-nav').last().click();
    await grid.first().waitFor({ timeout: 15000 });
  }
  await button.click();
  await page.locator(root + ' .bk-slot').first().click();
}

/* 1. CRM: list, search, details, appointment cards */
{
  const t = await open(1366), { page, mock } = t;
  const upcoming = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: at(5, 13), email: 'anna@example.test', name: 'Anna Beispiel' });
  mock.addBooking({ eventTypeId: SERVICES['haarschnitt-waschen'].eventTypeId, start: at(-10, 13), email: 'anna@example.test', name: 'Anna Beispiel' });
  mock.addBooking({ eventTypeId: SERVICES.bartschnitt.eventTypeId, start: at(7, 12), email: 'ben@example.test', name: 'Ben Muster' });
  await page.locator('#nl-refresh').click();
  await page.locator('#nl-contacts .nl-contact', { hasText: 'Anna Beispiel' }).waitFor();
  assert.equal(await text(page.locator('#nl-contact-count')), '2');
  assert.match(await text(page.locator('#nl-info')), /Kunde auswählen/);
  const anna = page.locator('#nl-contacts .nl-contact', { hasText: 'Anna Beispiel' });
  assert.equal(await text(anna.locator('.nl-avatar')), 'AB');
  assert.equal(await anna.getAttribute('aria-pressed'), 'false');
  await page.locator('#nl-search').fill('ben');
  assert.equal(await text(page.locator('#nl-contact-count')), '1 von 2');
  await page.locator('#nl-search').fill('niemand');
  assert.match(await text(page.locator('#nl-contacts')), /Keine Kontakte zu «niemand» gefunden/);
  await page.locator('#nl-search').fill('');
  await anna.click();
  assert.equal(await page.locator('#nl-contacts .nl-contact[aria-pressed="true"]').count(), 1);
  const head = await text(page.locator('#nl-info .nl-crm-head'));
  assert.match(head, /Anna Beispiel.*anna@example\.test.*\+41 79 000 00 11.*NoLimits-Kundenkonto/);
  assert.equal(await page.locator('#nl-info a[href="mailto:anna@example.test"]').count(), 1);
  assert.equal(await page.locator('#nl-info a[href="tel:+41790000011"]').count(), 1);
  const card = await text(page.locator('#nl-info .nl-crm-section').first().locator('.nl-appt'));
  const day = new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' }).format(new Date(upcoming.start));
  // Labels are shown in capitals by CSS; innerText returns them that way.
  assert.match(card, new RegExp('^Haarschnitt Bestätigt Datum ' + day.replace('.', '\\.') + ' Uhrzeit \\d\\d:00 Uhr Dauer 30 Min Preis CHF 3[05] Verschieben Absagen$', 'i'));
  assert.match(await text(page.locator('#nl-info .nl-crm-section').nth(1)), /Vergangene Termine 1 .*Haarschnitt mit Waschen/);
  assert.equal(await page.locator('#nl-info .nl-crm-section').nth(1).locator('.nl-appt-actions').count(), 0, 'no actions on past appointments');
  // Booking form is prefilled for the selected customer; "new customer" clears it.
  assert.equal(await page.locator('#nl-cemail').inputValue(), 'anna@example.test');
  assert.match(await text(page.locator('#nl-book-heading')), /Termin für Anna Beispiel buchen/);
  await page.locator('#nl-new-customer').click();
  assert.equal(await page.locator('#nl-cemail').inputValue(), '');
  assert.match(await text(page.locator('#nl-book-heading')), /neuen Kunden/);
  assert.equal(await page.locator('#nl-contacts .nl-contact[aria-pressed="true"]').count(), 0);
  await t.close();
}

/* 2. Booking calendar: states, disabled days, stale answers, pre-submit check, booking, series */
{
  const t = await open(1366), { page, mock } = t;
  const cal = '#nl-admin-calendar';
  await page.locator('#nl-admin-service option').nth(10).waitFor({ state: 'attached' });
  assert.match(await text(page.locator(cal)), /Bitte zuerst eine Leistung wählen/);
  assert.equal(await page.locator(cal + ' .bk-nav').first().isDisabled(), true);
  const target = zurich(at(9, 12));
  t.blockedDays.add(zurich(at(10, 12)));
  // Slow answer for the first service must not overwrite the second one.
  t.slowServices.set(SERVICES.bartschnitt.eventTypeId, 1500);
  await page.locator('#nl-admin-service').selectOption('bartschnitt');
  await page.locator('#nl-admin-service').selectOption('haarschnitt');
  await page.waitForTimeout(1800);
  assert.equal(await page.locator(cal + ' .bk-nav').first().isDisabled(), true, 'no month before the current one');
  const today = zurich(Date.now());
  assert.equal(await page.locator(cal + ' button.bk-day[data-day="' + today + '"]').count(), 1);
  const past = await page.locator(cal + ' button.bk-day').evaluateAll((b, d) => b.filter((x) => x.dataset.day < d).every((x) => x.disabled), today);
  assert.ok(past, 'past days are disabled');
  await pick(page, cal, target);
  assert.equal(await page.locator('#nl-admin-slot').inputValue() !== '', true);
  const blocked = page.locator(cal + ' button.bk-day[data-day="' + zurich(at(10, 12)) + '"]');
  if (await blocked.count()) assert.equal(await blocked.isDisabled(), true, 'day without free times is disabled');
  assert.match(await text(page.locator('#nl-admin-price')), /Preis am gewählten Datum: CHF 3[05]/);
  // Changing the service discards the chosen time.
  await page.locator('#nl-admin-service').selectOption('bartschnitt');
  await page.locator(cal + ' .bk-grid').waitFor();
  assert.equal(await page.locator('#nl-admin-slot').inputValue(), '');
  assert.equal(await page.locator(cal + ' .bk-slots-wrap').isHidden(), true);
  await page.locator('#nl-admin-service').selectOption('haarschnitt');
  await pick(page, cal, target);
  await page.locator('#nl-cname').fill('Neukunde Test');
  await page.locator('#nl-cemail').fill('neu@example.test');
  await page.locator('#nl-cphone').fill('+41 79 000 00 02');
  await page.locator('#nl-admin-book-form input[name=accepted]').check();
  // The chosen time is taken meanwhile: nothing is sent to Cal.com.
  t.blockedDays.add(target);
  await page.locator('#nl-admin-book-form [type=submit]').click();
  await page.waitForFunction(() => /nicht mehr frei/.test(document.getElementById('nl-admin-notice').textContent));
  assert.equal(mock.calPosts.length, 0);
  // The calendar was reloaded at once: the taken day is no longer offered.
  await page.locator(cal + ' .bk-grid').waitFor();
  assert.equal(await page.locator(cal + ' button.bk-day[data-day="' + target + '"]').isDisabled(), true);
  assert.equal(await page.locator('#nl-admin-slot').inputValue(), '');
  t.blockedDays.delete(target);
  await page.locator('#nl-admin-service').selectOption('bartschnitt');
  await page.locator('#nl-admin-service').selectOption('haarschnitt');
  await pick(page, cal, target);
  await page.locator('#nl-admin-book-form [type=submit]').click();
  await page.waitForFunction(() => /Termin erfolgreich gebucht/.test(document.getElementById('nl-admin-notice').textContent));
  assert.equal(mock.calPosts.length, 1);
  const [post] = mock.calPosts;
  assert.equal(post.metadata.nlTermsSource, 'staff_attestation');
  assert.equal(post.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
  assert.match(t.dialogs.at(-1), /verbindlich eintragen\? Preis am gewählten Datum: CHF 3[05]/);
  // Weekly series from the calendar.
  await page.locator('#nl-new-customer').click();
  await pick(page, cal, zurich(at(12, 12)));
  await page.locator('#nl-admin-repeat').check();
  assert.match(await text(page.locator('#nl-admin-price')), /^Preise nach Termindatum: .*× CHF 3[05]/);
  await page.locator('#nl-cname').fill('Serie Test');
  await page.locator('#nl-cemail').fill('serie@example.test');
  await page.locator('#nl-cphone').fill('+41 79 000 00 03');
  await page.locator('#nl-admin-book-form input[name=accepted]').check();
  await page.locator('#nl-admin-book-form [type=submit]').click();
  await page.waitForFunction(() => /Serientermin erfolgreich: 4 Termine/.test(document.getElementById('nl-admin-notice').textContent));
  assert.equal(mock.calPosts.length, 5);
  await t.close();
}

/* 2b. Series: chosen start day, month change, 7-day steps, price change at the turn of the year,
   and a confirmation that lists every date and price before anything is sent. */
{
  const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const label = (day) => new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' }).format(new Date(day + 'T12:00:00Z'));
  const cases = [];
  // Over the turn of the year (only while 22.12.2026 is still ahead), and always one month change.
  if (Date.parse('2026-12-22T00:00:00Z') > Date.now() + 2 * 86400000) cases.push({ start: '2026-12-22', count: 4 });
  let start = zurich(at(3, 12));
  while (start.slice(5, 7) === addDays(start, 21).slice(5, 7)) start = addDays(start, 1);
  cases.push({ start, count: 4 });
  for (const c of cases) {
    const t = await open(390), { page, mock } = t;
    const cal = '#nl-admin-calendar';
    await page.locator('#nl-admin-service option').nth(10).waitFor({ state: 'attached' });
    await page.locator('#nl-admin-service').selectOption('haarschnitt');
    // A chosen day is discarded when the month is changed: nothing from the old month is booked.
    await pick(page, cal, c.start);
    assert.notEqual(await page.locator('#nl-admin-slot').inputValue(), '');
    await page.locator(cal + ' .bk-nav').last().click();
    await page.locator(cal + ' .bk-grid').waitFor();
    assert.equal(await page.locator('#nl-admin-slot').inputValue(), '', 'month change clears the choice');
    await page.locator(cal + ' .bk-nav').first().click();
    await pick(page, cal, c.start);
    const chosen = await page.locator('#nl-admin-slot').inputValue();
    const hm = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(chosen));
    await page.locator('#nl-admin-repeat').check();
    await page.locator('#nl-admin-repeat-weeks').selectOption(String(c.count));
    await page.locator('#nl-cname').fill('Serie Jahreswechsel');
    await page.locator('#nl-cemail').fill('serie2@example.test');
    await page.locator('#nl-cphone').fill('+41 79 000 00 04');
    await page.locator('#nl-admin-book-form input[name=accepted]').check();
    const days = Array.from({ length: c.count }, (_, i) => addDays(c.start, 7 * i));
    const prices = days.map((d) => (d >= '2027-01-01' ? 35 : 30));
    await page.locator('#nl-admin-book-form [type=submit]').click();
    await page.waitForFunction(() => /Serientermin erfolgreich/.test(document.getElementById('nl-admin-notice').textContent));
    const question = t.dialogs.find((d) => d.startsWith('Serie verbindlich buchen?'));
    assert.ok(question, 'series confirmation shown');
    const lines = question.split('\n').filter((l) => /^\d+\. /.test(l));
    assert.deepEqual(lines, days.map((d, i) => (i + 1) + '. ' + label(d) + ', ' + hm + ' Uhr – CHF ' + prices[i]), question);
    assert.match(question, new RegExp('Total CHF ' + prices.reduce((a, b) => a + b, 0) + ' '));
    // The Worker booked exactly the dates shown, at the same Zurich time.
    const booked = mock.calPosts.map((p) => p.start).sort();
    assert.deepEqual(booked.map(zurich), days);
    assert.ok(booked.every((s) => new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(s)) === hm));
    assert.match(await text(page.locator('#nl-admin-notice')), new RegExp('Preis je Termin nach Datum: ' + prices.map((p) => 'CHF ' + p).join(', ')));
    console.log('Serie', days.join(' '), prices.join('/'));
    await t.close();
  }
}

/* 3. Short notice: staff exception within 24 hours, confirmed and server-side */
{
  const t = await open(1366), { page, mock } = t;
  const near = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: new Date(Date.now() + 3 * 3600000).toISOString(), email: 'kurz@example.test', name: 'Kurzfristig' });
  await page.locator('#nl-refresh').click();
  await page.locator('#nl-contacts .nl-contact', { hasText: 'Kurzfristig' }).click();
  assert.match(await text(page.locator('#nl-info .nl-appt-note')), /weniger als 24 Stunden/);
  await page.locator('#nl-info .nl-appt-reschedule').click();
  await pick(page, '#nl-info .nl-appt-move', zurich(at(3, 12)));
  await page.locator('#nl-info .nl-appt-save').click();
  await page.waitForFunction(() => /verschoben/.test(document.getElementById('nl-admin-notice').textContent));
  assert.match(t.dialogs.at(-1), /Mitarbeiterausnahme/);
  assert.equal(near.status, 'cancelled'); assert.ok(near.rescheduledToUid);
  await page.locator('#nl-info .nl-appt-cancel').first().click();
  await page.waitForFunction(() => /abgesagt/.test(document.getElementById('nl-admin-notice').textContent));
  assert.equal(mock.bookings.get(near.rescheduledToUid).status, 'cancelled');
  await t.close();
}

/* 4. No horizontal overflow from 320 px to 1920 px */
for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
  const t = await open(width), { page, mock } = t;
  mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: at(4, 13), email: 'anna@example.test', name: 'Anna Beispiel' });
  await page.locator('#nl-refresh').click();
  await page.locator('#nl-contacts .nl-contact', { hasText: 'Anna Beispiel' }).click();
  await page.locator('#nl-admin-service').selectOption('haarschnitt');
  await pick(page, '#nl-admin-calendar', zurich(at(6, 12)));
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(scroll <= inner, width + ' px: page wider than screen (' + scroll + ')');
  // The rescheduling calendar sits inside the appointment card: the narrowest place.
  await page.locator('#nl-info .nl-appt-reschedule').click();
  await pick(page, '#nl-info .nl-appt-move', zurich(at(8, 12)));
  const moved = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    document.querySelector('#nl-info .nl-appt-move .nl-picker-box').getBoundingClientRect().right,
    Math.max(...[...document.querySelectorAll('#nl-info .nl-appt-move .nl-picker-box *')].map((n) => n.getBoundingClientRect().right))]);
  assert.ok(moved[0] <= moved[1], width + ' px: rescheduling calendar wider than screen (' + moved[0] + ')');
  assert.ok(moved[3] <= moved[2] + 0.5, width + ' px: calendar content sticks out of its box (' + moved[3] + ' > ' + moved[2] + ')');
  await t.close();
}
await browser.close();
console.log('PASS: staff portal CRM, shared booking calendar, pre-submit check, series, staff exception, 320–1920 px');

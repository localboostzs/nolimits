// Browser matrix: real frontend files + real Worker code, mocked Cal.com/Supabase/Resend.
// {main, feature frontend} x {live Worker (= main source), release candidate, alias fallback}.
// NOLIMITS_MAIN_DIR must point to an extracted checkout of main. No network access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createMock, secrets, tomlVars } from './NoLimits_MockBackend_20261125.mjs';

const mainDir = process.env.NOLIMITS_MAIN_DIR;
assert.ok(mainDir, 'Set NOLIMITS_MAIN_DIR to a checkout of main');
const load = async (file) => (await import(pathToFileURL(path.resolve(file)))).default;
const frontends = { main: path.resolve(mainDir), feature: path.resolve('.') };
const candidate = await load('worker/src/index.js');
const workers = {
  live: { worker: await load(path.join(mainDir, 'worker/src/index.js')), vars: {} },
  candidate: { worker: candidate, vars: tomlVars('worker/wrangler.production-candidate.toml') },
  fallback: { worker: candidate, vars: tomlVars('worker/wrangler.alias-fallback.toml') },
};
const SITE = 'https://localboostzs.github.io/nolimits';
const API = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const options = { headless: true, args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch(options);
const results = [];
let ip = 0;

// Staff portal calendar (assets/js/kalender.js): go to the month of `day`, click it and the first free time.
async function pickInCalendar(page, root, day) {
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

async function open(fe, wk, viewport) {
  const mock = createMock();
  const env = { ...secrets, ...workers[wk].vars };
  const context = await browser.newContext({ viewport, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
  const calls = [], errors = [], address = '10.1.0.' + (++ip);
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === API) {
      const headers = { ...(await req.allHeaders()), origin: 'https://localboostzs.github.io', 'cf-connecting-ip': address };
      for (const h of Object.keys(headers)) if (h.startsWith(':')) delete headers[h];
      const res = await workers[wk].worker.fetch(new Request(req.url(), { method: req.method(), headers,
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), env);
      const body = await res.text();
      calls.push({ method: req.method(), path: url.pathname, status: res.status, body: req.postData(), reply: body });
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://localboostzs.github.io');
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body });
    }
    if (url.href.startsWith(SITE + '/')) {
      let rel = decodeURIComponent(url.pathname.slice('/nolimits/'.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      // Staff login is replaced by a stub; every other file is the real one.
      if (rel === 'assets/js/auth-client.js') return route.fulfill({ contentType: types['.js'], body:
        "window.NOLIMITS_ACCOUNT={enabled:true,user:async()=>location.pathname.includes('/verwaltung')?{id:'x',email:'staff@example.test'}:null," +
        "staff:async()=>({role:'staff',active:true}),bearer:async()=>'mock',profile:async()=>null,saveProfile:async()=>{}};" });
      const file = path.join(frontends[fe], rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const go = async (p) => {
    await page.goto(p.startsWith('http') ? p : SITE + p, { waitUntil: 'load' });
    const reject = page.locator('.nl-privacy-reject');
    if (await reject.isVisible().catch(() => false)) await reject.click();
  };
  return { mock, env, context, page, calls, errors, go, last: (p) => calls.filter((c) => c.path === p).at(-1) };
}

async function customerFlow(fe, wk, viewport) {
  const t = await open(fe, wk, viewport), { page, mock } = t;
  const newWorker = wk !== 'live';
  await t.go('/leistungen/');
  const link = page.locator('#nl-gentleman-book');
  await page.waitForTimeout(500);
  assert.equal((await link.getAttribute('aria-disabled')) === 'true', !newWorker, 'Gentleman button state');

  await t.go('/booking-test/');
  await page.locator('#services button.bk-service').first().waitFor();
  assert.equal(await page.locator('#services button.bk-service').count(), newWorker ? 10 : 9);
  const service = newWorker ? 'Gentleman Rasur' : 'Haarschnitt mit Waschen';
  await page.locator('#services button.bk-service', { hasText: service }).click();
  // Book the latest free day (more than 24h ahead) so that cancelling is allowed.
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
  await page.waitForTimeout(3300);
  await page.locator('#bk-submit').click();
  await page.waitForTimeout(300);
  assert.equal(mock.calPosts.length, 0, 'no booking without ticking the terms');
  await page.locator('#f-terms').check();
  await page.locator('#bk-submit').click();
  await page.locator('#bk-manage-link').waitFor({ state: 'visible' });
  const [post] = mock.calPosts;
  assert.strictEqual(post.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
  if (newWorker) {
    assert.equal(post.metadata.nlTermsSource, 'customer_checkbox');
    assert.equal(post.metadata.nlTermsVersion, fe === 'feature' ? '2026-11-25-online-24h-storno-umbuchung' : 'nicht_uebermittelt');
  } else assert.equal(post.metadata, undefined);
  const manage = await page.locator('#bk-manage-link').getAttribute('href');

  await t.go(manage);
  await page.locator('#nl-manage-details').waitFor({ state: 'visible' });
  await page.locator('#nl-manage-show-reschedule').click();
  const uid = new URL(manage).searchParams.get('uid');
  const old = mock.bookings.get(uid);
  if (fe === 'main') {
    const target = new Date(Date.parse(old.start) + 86400000).toISOString().slice(0, 10);
    await page.locator('#nl-manage-date').fill(target);
    await page.locator('#nl-manage-date').dispatchEvent('change');
  } else {
    await page.locator('#nl-manage-calendar button.nl-manage-day:not([disabled])').last().click();
  }
  await page.locator('#nl-manage-slots button').last().click();
  await page.locator('#nl-manage-confirm-reschedule').check();
  await page.locator('#nl-manage-reschedule-submit').click();
  await page.locator('#nl-manage-result').waitFor({ state: 'visible' });
  assert.equal(t.last('/api/manage/reschedule').status, 200);
  const fresh = new URL(JSON.parse(t.last('/api/manage/reschedule').reply).booking.manageUrl);
  assert.notEqual(fresh.searchParams.get('uid'), uid);

  await t.go(fresh.href);
  await page.locator('#nl-manage-show-cancel').click();
  await page.locator('#nl-manage-confirm-cancel').check();
  await page.locator('#nl-manage-cancel [type=submit]').click();
  await page.locator('#nl-manage-result').waitFor({ state: 'visible' });
  assert.equal(mock.bookings.get(fresh.searchParams.get('uid')).status, 'cancelled');

  // Appointment in 3 hours: what does the page offer, what does the server allow?
  const soon = mock.addBooking({ eventTypeId: 7888953, start: new Date(Date.now() + 3 * 3600000).toISOString(), email: 'kunde@example.test' });
  const exp = Math.floor(Date.parse(soon.start) / 1000) + 7 * 86400;
  const token = exp + '.' + crypto.createHmac('sha256', t.env.NL_MANAGE_SECRET).update(soon.uid + ':' + exp).digest('base64url');
  await t.go('/termin-verwalten/?uid=' + soon.uid + '&token=' + token);
  await page.locator('#nl-manage-details').waitFor({ state: 'visible' });
  const cancelShown = await page.locator('#nl-manage-show-cancel').isVisible();
  const moveShown = await page.locator('#nl-manage-show-reschedule').isVisible();
  assert.deepEqual([cancelShown, moveShown], newWorker ? [false, false] : [true, true], 'buttons within 24h');
  let late = 'Stornieren und Umbuchen ausgeblendet';
  if (newWorker) {
    assert.match(await page.locator('#nl-manage-msg').innerText(), /nicht mehr online/);
  } else {
    await page.locator('#nl-manage-show-cancel').click();
    await page.locator('#nl-manage-confirm-cancel').check();
    await page.locator('#nl-manage-cancel [type=submit]').click();
    await page.waitForTimeout(500);
    assert.equal(soon.status, 'cancelled'); late = 'Storno wird ausgefuehrt (live ohne 24h-Sperre)';
  }
  assert.deepEqual(t.errors, []);
  results.push({ fe, wk, late });
  await t.context.close();
}

async function staffFlow(fe, wk) {
  const t = await open(fe, wk, { width: 1366, height: 768 }), { page, mock } = t;
  const series = fe === 'feature';
  await t.go('/verwaltung/');
  await page.locator('#nl-admin-service option').nth(10).waitFor({ state: 'attached' });
  const date = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  async function fill(repeat) {
    await page.locator('#nl-admin-service').selectOption('gentleman-rasur');
    if (fe === 'feature') await pickInCalendar(page, '#nl-admin-calendar', date);
    else {
      await page.locator('#nl-admin-date').fill(date);
      await page.locator('#nl-admin-date').dispatchEvent('change');
      await page.locator('#nl-admin-slot option').nth(1).waitFor({ state: 'attached' });
      await page.locator('#nl-admin-slot').selectOption({ index: 1 });
    }
    await page.locator('#nl-cname').fill('Testkunde');
    await page.locator('#nl-cemail').fill('kunde@example.test');
    await page.locator('#nl-cphone').fill('+41 79 000 00 00');
    if (repeat) await page.locator('#nl-admin-repeat').check();
    await page.locator('input[name=accepted]').check();
    const path = repeat ? '/api/admin/book-series' : '/api/admin/book';
    const before = t.calls.filter((c) => c.path === '/api/admin/contacts').length;
    await page.locator('#nl-admin-book-form [type=submit]').click();
    for (let i = 0; i < 100 && !t.last(path); i++) await page.waitForTimeout(100);
    await page.waitForFunction(() => !document.querySelector('#nl-admin-book-form [type=submit]').disabled);
    const reply = t.last(path);
    const notice = await page.locator('#nl-admin-notice').textContent();
    if (reply.status === 201) {
      assert.ok(t.calls.filter((c) => c.path === '/api/admin/contacts').length > before, 'CRM reloaded');
      // main clears its own success message while reloading (fixed in the feature frontend).
      if (fe === 'feature') assert.match(notice, /erfolgreich/); else assert.equal(notice, '');
    }
  }
  await fill(false);
  const single = t.last('/api/admin/book').status;
  if (wk === 'live') assert.notEqual(single, 201, 'required Cal.com field blocks the old staff path');
  else assert.equal(single, 201);
  const [post] = mock.calPosts;
  if (wk === 'live') {
    // The live Worker treats Gentleman Rasur as internal and omits the now required field.
    assert.equal(post.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, undefined);
  } else {
    assert.strictEqual(post.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
    assert.equal(post.metadata.nlTermsSource, 'staff_attestation');
    assert.equal(post.metadata.nlTermsVersion, fe === 'feature' ? 'staff-2026-11-25-informiert' : 'nicht_uebermittelt');
  }
  // Short-notice appointment in the CRM: staff may move and cancel it (feature frontend, new Worker).
  mock.bookings.clear();
  const near = mock.addBooking({ eventTypeId: 7888953, start: new Date(Date.now() + 3 * 3600000).toISOString(), email: 'nah@example.test', name: 'Kurzfristig' });
  const openContact = async () => { await page.locator('#nl-contacts button', { hasText: 'Kurzfristig' }).click(); };
  await t.go('/verwaltung/');
  await openContact();
  const actions = fe === 'feature' && wk !== 'live';
  assert.equal(await page.locator('.nl-appt-cancel').count(), actions ? 1 : 0, 'staff actions');
  if (actions) {
    await page.locator('.nl-appt-reschedule').click();
    const target = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await pickInCalendar(page, '.nl-appt-move', target);
    await page.locator('.nl-appt-save').click();
    await page.waitForFunction(() => /verschoben/.test(document.getElementById('nl-admin-notice').textContent));
    assert.equal(near.status, 'cancelled'); assert.ok(near.rescheduledToUid);
    await page.locator('.nl-appt-cancel').first().click();
    await page.waitForFunction(() => /abgesagt/.test(document.getElementById('nl-admin-notice').textContent));
    assert.equal(mock.bookings.get(near.rescheduledToUid).status, 'cancelled');
  }
  if (series) {
    mock.calPosts.length = 0;
    await t.go('/verwaltung/');
    await page.locator('#nl-admin-service option').nth(10).waitFor({ state: 'attached' });
    await fill(true);
    const reply = t.last('/api/admin/book-series');
    if (wk === 'live') {
      assert.equal(reply.status, 404); assert.equal(mock.calPosts.length, 0, 'old Worker books nothing for a series');
    } else {
      assert.equal(reply.status, 201); assert.equal(mock.calPosts.length, 4);
      assert.ok(mock.calPosts.every((p) => p.metadata.nlTermsSource === 'staff_attestation'));
    }
  }
  assert.deepEqual(t.errors, []);
  await t.context.close();
}

try {
  for (const fe of Object.keys(frontends)) for (const wk of Object.keys(workers)) {
    for (const [name, viewport] of [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
      await customerFlow(fe, wk, viewport);
      console.log('PASS customer', name, 'frontend=' + fe, 'worker=' + wk);
    }
    await staffFlow(fe, wk);
    console.log('PASS staff   frontend=' + fe, 'worker=' + wk);
  }
  for (const r of results.filter((_, i) => i % 2 === 0)) console.log('<24h frontend=' + r.fe + ' worker=' + r.wk + ': ' + r.late);
  console.log('PASS: frontend/Worker compatibility matrix (mocked backends, no real bookings)');
} finally { await browser.close(); }

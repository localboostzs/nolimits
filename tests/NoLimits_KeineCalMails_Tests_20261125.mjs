// Offline: with the release candidate's own settings Cal.com never learns a customer's
// address, so its standard mails (with Cal.com's own cancel/reschedule links) cannot
// reach the customer. Every booking path, every change path, every customer mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMock, secrets, tomlVars, call, sendWebhook, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const vars = tomlVars('worker/wrangler.production-candidate.toml');
assert.equal(vars.NL_ALIAS_MODE, 'enabled');
const env = { ...secrets, ...vars };
const ALIAS = /^info\+[0-9a-f]{32}@localboost-zs\.ch$/;
const SITE = vars.NL_PUBLIC_SITE_BASE + '/termin-verwalten/?';
const CAL_LINK = /(?:\/\/|\.)cal\.(?:com|eu)(?![a-z])/i;
const staff = { Authorization: 'Bearer mock' };

const mock = createMock();
const toCal = [];
let aliasDown = false;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('https://api.cal.com/')) toCal.push({ method: o.method || 'GET', url: decodeURIComponent(url), body: o.body || '' });
  if (aliasDown && url.startsWith(SUPABASE + '/rest/v1/nl_booking_email_aliases')) return Response.json({}, { status: 500 });
  return mock.fetch(u, o);
};
const free = (days, hour = 12) => { const t = new Date(Date.now() + days * 86400000); t.setUTCHours(hour, 0, 0, 0); return t.toISOString(); };
const form = (email, start, extra = {}) => ({ service: 'haarschnitt', name: 'Testkunde', email, phone: '+41 79 000 00 00',
  accepted: true, elapsedMs: 5000, start, ...extra });
const answers = [];
const api = async (path, body, headers) => { const r = await call(worker, env, path, body, headers); answers.push(r); return r; };
// Customer mails come from the webhook only; returns what was sent for one event.
async function notify(type, uid) {
  mock.mails.length = 0;
  assert.equal((await sendWebhook(worker, env, type, { uid })).status, 200, type);
  assert.equal(mock.mails.length, 1, type);
  return mock.mails[0];
}
function checkMail(mail, to, withLink) {
  assert.deepEqual(mail.to, [to]);
  assert.doesNotMatch(mail.html, CAL_LINK);
  assert.ok(!mail.html.includes('info+') && !mail.attachments);
  const links = [...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.equal(links.some((l) => l.startsWith(SITE)), withLink, 'NoLimits management link');
  assert.ok(links.every((l) => !CAL_LINK.test(l)));
  return links.find((l) => l.startsWith(SITE));
}

// Public booking -> customer reschedules -> customer cancels, each through the NoLimits link.
const booked = await api('/api/book', form('Kunde.Eins@example.test', free(5)));
assert.equal(booked.status, 201);
assert.ok(booked.data.booking.manageUrl.startsWith(SITE));
let uid = booked.data.booking.uid;
assert.match(mock.bookings.get(uid).attendees[0].email, ALIAS);
let link = new URL(checkMail(await notify('BOOKING_CREATED', uid), 'kunde.eins@example.test', true));
const moved = await api('/api/manage/reschedule', { uid, token: link.searchParams.get('token'), confirm: true, start: free(6) });
assert.equal(moved.status, 200);
uid = new URL(moved.data.booking.manageUrl).searchParams.get('uid');
assert.match(mock.bookings.get(uid).attendees[0].email, ALIAS);
link = new URL(checkMail(await notify('BOOKING_RESCHEDULED', uid), 'kunde.eins@example.test', true));
assert.equal((await api('/api/manage/cancel', { uid, token: link.searchParams.get('token'), confirm: true })).status, 200);
checkMail(await notify('BOOKING_CANCELLED', uid), 'kunde.eins@example.test', false);

// Staff booking, staff reschedule and cancel, staff series.
const own = await api('/api/admin/book', form('kunde.zwei@example.test', free(7)), staff);
assert.equal(own.status, 201);
checkMail(await notify('BOOKING_CREATED', own.data.booking.uid), 'kunde.zwei@example.test', true);
assert.equal((await api('/api/admin/reschedule', { uid: own.data.booking.uid, confirm: true, start: free(8) }, staff)).status, 200);
const next = [...mock.bookings.values()].find((b) => b.rescheduledFromUid === own.data.booking.uid);
assert.match(next.attendees[0].email, ALIAS);
checkMail(await notify('BOOKING_RESCHEDULED', next.uid), 'kunde.zwei@example.test', true);
assert.equal((await api('/api/admin/cancel', { uid: next.uid, confirm: true }, staff)).status, 200);
checkMail(await notify('BOOKING_CANCELLED', next.uid), 'kunde.zwei@example.test', false);
const series = await api('/api/admin/book-series', form('kunde.drei@example.test', free(9, 13), { count: 3 }), staff);
assert.equal(series.status, 201, JSON.stringify(series.data));
const used = mock.calPosts.slice(-3).map((p) => p.attendee.email);
assert.ok(used.every((e) => ALIAS.test(e)) && new Set(used).size === 3, 'one alias per appointment');

// Nothing sent to Cal.com contains a customer address; no answer points to Cal.com.
assert.equal(mock.calPosts.length, 5);
assert.ok(mock.calPosts.every((p) => ALIAS.test(p.attendee.email)));
assert.ok(toCal.length > 10);
for (const r of toCal) assert.doesNotMatch(r.url + ' ' + r.body, /example\.test/i, r.method + ' ' + r.url.split('?')[0]);
for (const r of answers) assert.doesNotMatch(JSON.stringify(r.data), /(?:\/\/|\.)cal\.(?:com|eu)(?![a-z])|info\+[0-9a-f]{32}/i);
// The CRM still shows the real customers.
const crm = JSON.stringify((await call(worker, env, '/api/admin/contacts', null, staff)).data);
for (const who of ['kunde.eins', 'kunde.zwei', 'kunde.drei']) assert.ok(crm.includes(who + '@example.test'), who);
assert.doesNotMatch(crm, /info\+[0-9a-f]{32}/);

// Fails closed: without a working alias nothing reaches Cal.com.
for (const broken of [{ NL_SUPABASE_SECRET_KEY: undefined }, { NL_ALIAS_DOMAIN: '' }, { NL_SUPABASE_URL: '' }, null]) {
  aliasDown = broken === null;
  const before = mock.calPosts.length, e = { ...env, ...broken };
  const r = await call(worker, e, '/api/book', form('kunde.vier@example.test', free(15)));
  assert.deepEqual([r.status, mock.calPosts.length], [503, before], JSON.stringify(broken));
  const s = await call(worker, e, '/api/admin/book-series', form('kunde.vier@example.test', free(15), { count: 2 }), staff);
  assert.ok(s.status >= 400 && mock.calPosts.length === before, 'series ' + JSON.stringify(broken));
}
aliasDown = false;
// A missing key never makes the page send customers to a Cal.com link.
const noKey = await call(worker, { ...env, CAL_API_KEY: '' }, '/api/manage?uid=' + uid + '&token=x', null);
assert.equal(noKey.status, 503);
assert.doesNotMatch(JSON.stringify(noKey.data), /Cal\.com/i);

// Documented limit: the rollback configuration books with the real address again, so
// Cal.com mails reach customers while it is active.
const fallback = { ...secrets, ...tomlVars('worker/wrangler.alias-fallback.toml') };
assert.equal((await call(worker, fallback, '/api/book', form('kunde.fuenf@example.test', free(16)))).status, 201);
assert.equal(mock.calPosts.at(-1).attendee.email, 'kunde.fuenf@example.test');

// No customer page, script or mail template links to Cal.com.
const files = ['index.html', 'booking-test', 'termin-verwalten', 'konto', 'leistungen', 'kontakt', 'ueber-mich', 'impressum', 'assets/js', 'emails']
  .filter((p) => fs.existsSync(p))
  .flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p, { recursive: true }).map((f) => p + '/' + f) : [p]))
  .filter((f) => /\.(html|js)$/.test(f));
assert.ok(files.length >= 8);
for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /https?:\/\/(?:[a-z]+\.)?cal\.(?:com|eu)(?![a-z])/i, f);
console.log('PASS: no customer address reaches Cal.com, no Cal.com links, fails closed, rollback limit documented');

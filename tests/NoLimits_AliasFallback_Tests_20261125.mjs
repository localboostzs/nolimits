// Offline: bookings created while aliases were ENABLED must keep working after
// switching to worker/wrangler.alias-fallback.toml (resolve, mail, reschedule, cancel, CRM).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMock, secrets, tomlVars, call, sendWebhook, zurichDay } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const toml = fs.readFileSync('worker/wrangler.alias-fallback.toml', 'utf8');
assert.match(toml, /^name = "nolimits-booking-test"/m);
assert.match(toml, /namespace_id = "1001"[\s\S]*namespace_id = "1002"/);
assert.doesNotMatch(toml, /^\s*(CAL_API_KEY|CAL_WEBHOOK_SECRET|RESEND_API_KEY|NL_MANAGE_SECRET|NL_SUPABASE_SECRET_KEY)\s*=/m);
const fallback = { ...secrets, ...tomlVars('worker/wrangler.alias-fallback.toml') };
assert.equal(fallback.NL_ALIAS_MODE, 'disabled');
assert.equal(fallback.NL_ICS_ENABLED, 'false');
const activated = { ...fallback, NL_ALIAS_MODE: 'enabled' };

const mock = createMock();
const inDays = (d, h = 12) => { const t = new Date(Date.now() + d * 86400000); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
const customer = (start, email) => ({ service: 'haarschnitt', start, name: 'Testkunde', email, phone: '+41 79 000 00 00', accepted: true, elapsedMs: 5000 });
const tokenOf = (url) => new URL(url).searchParams;
const alias = /^info\+[0-9a-f]{32}@localboost-zs\.ch$/;

// 1) Two bookings made while aliases are active.
const first = await call(worker, activated, '/api/book', customer(inDays(10), 'anna@example.test'));
const second = await call(worker, activated, '/api/book', customer(inDays(11), 'beat@example.test'));
assert.equal(first.status, 201); assert.equal(second.status, 201);
for (const p of mock.calPosts) assert.match(p.attendee.email, alias);
assert.equal(mock.aliases.size, 2);

const hook = async (type, uid, extra = {}) => {
  const b = mock.bookings.get(uid); mock.mails.length = 0;
  const res = await sendWebhook(worker, fallback, type, { uid, eventTypeId: b.eventTypeId, startTime: b.start, attendees: b.attendees, ...extra });
  return { status: res.status, to: mock.mails.flatMap((m) => m.to), html: mock.mails[0]?.html || '' };
};

// 2) Switch to fallback: confirmation for an existing booking reaches the customer.
const a = tokenOf(first.data.booking.manageUrl);
let r = await hook('BOOKING_CREATED', a.get('uid'));
assert.deepEqual([r.status, r.to], [200, ['anna@example.test']]);

// 3) Manage link from before the switch: view, slots, reschedule.
const q = 'uid=' + a.get('uid') + '&token=' + encodeURIComponent(a.get('token'));
assert.equal((await call(worker, fallback, '/api/manage?' + q)).status, 200);
const target = inDays(14, 13), day = zurichDay(target);
const free = await call(worker, fallback, '/api/manage/slots?' + q + '&service=haarschnitt&start=' + day + '&end=' + day);
assert.ok(free.data.days[day].includes(target));
const moved = await call(worker, fallback, '/api/manage/reschedule',
  { uid: a.get('uid'), token: a.get('token'), confirm: true, start: target });
assert.equal(moved.status, 200);
const n = tokenOf(moved.data.booking.manageUrl);
assert.notEqual(n.get('uid'), a.get('uid'));
assert.match(mock.bookings.get(n.get('uid')).attendees[0].email, alias);
r = await hook('BOOKING_RESCHEDULED', n.get('uid'));
assert.deepEqual([r.status, r.to], [200, ['anna@example.test']]);
assert.ok(r.html.includes(n.get('uid')), 'mail carries the NEW management link');
// The cancellation Cal.com emits for the replaced booking stays silent.
r = await hook('BOOKING_CANCELLED', a.get('uid'), { rescheduledToUid: n.get('uid') });
assert.deepEqual([r.status, r.to], [200, []]);

// 4) Cancel the rescheduled booking through its new link; mail reaches the customer.
const cancel = await call(worker, fallback, '/api/manage/cancel', { uid: n.get('uid'), token: n.get('token'), confirm: true });
assert.equal(cancel.status, 200);
assert.equal(mock.bookings.get(n.get('uid')).status, 'cancelled');
r = await hook('BOOKING_CANCELLED', n.get('uid'));
assert.deepEqual([r.status, r.to], [200, ['anna@example.test']]);
// Cancellation webhook without attendees and event type: resolved through Cal.com.
mock.mails.length = 0;
const res = await sendWebhook(worker, fallback, 'BOOKING_CANCELLED', { uid: n.get('uid'), startTime: target });
assert.equal(res.status, 200); assert.deepEqual(mock.mails.flatMap((m) => m.to), ['anna@example.test']);

// 5) Staff CRM shows real addresses, never the alias.
const crm = await call(worker, fallback, '/api/admin/contacts', null, { Authorization: 'Bearer mock' });
assert.equal(crm.status, 200);
const emails = crm.data.contacts.map((c) => c.email);
assert.ok(emails.includes('anna@example.test') && emails.includes('beat@example.test'));
assert.ok(!emails.some((e) => alias.test(e)));

// 6) New bookings under the fallback use the real address and create no mapping.
const fresh = await call(worker, fallback, '/api/book', customer(inDays(12), 'carla@example.test'));
assert.equal(fresh.status, 201);
assert.equal(mock.calPosts.at(-1).attendee.email, 'carla@example.test');
assert.equal(mock.aliases.size, 2);
r = await hook('BOOKING_CREATED', tokenOf(fresh.data.booking.manageUrl).get('uid'));
assert.deepEqual(r.to, ['carla@example.test']);

// 7) Failure modes: fail closed, and the documented danger of dropping the domain.
const bUid = tokenOf(second.data.booking.manageUrl).get('uid');
const post = async (env) => { const b = mock.bookings.get(bUid); mock.mails.length = 0;
  const x = await sendWebhook(worker, env, 'BOOKING_CREATED', { uid: bUid, eventTypeId: b.eventTypeId, startTime: b.start, attendees: b.attendees });
  return [x.status, mock.mails.flatMap((m) => m.to)]; };
assert.deepEqual(await post({ ...fallback, NL_SUPABASE_SECRET_KEY: '' }), [503, []]);
const { NL_ALIAS_DOMAIN, ...noDomain } = fallback;
const [, leaked] = await post(noDomain);
assert.match(leaked[0], alias, 'without the domain the mail goes to the alias: never deploy such a version after activation');

console.log('PASS: alias bookings stay resolvable under the fallback (mail, reschedule, cancel, CRM, fail-closed)');

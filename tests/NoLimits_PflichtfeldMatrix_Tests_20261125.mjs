// Offline: what happens if all ten regular Cal.com services require the boolean terms
// field, for the live Worker (= main source), the release candidate and the alias
// fallback. Rejection of a missing value is ASSUMED from the Cal.com setting.
// Also: the account webhook receives LAB events and must ignore them.
// NOLIMITS_MAIN_DIR must point to an extracted checkout of main.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMock, secrets, tomlVars, call, sendWebhook } from './NoLimits_MockBackend_20261125.mjs';
import { SERVICES } from '../worker/src/services.js';

const mainDir = process.env.NOLIMITS_MAIN_DIR;
assert.ok(mainDir, 'Set NOLIMITS_MAIN_DIR to a checkout of main');
const { default: candidate } = await import('../worker/src/index.js');
const { default: live } = await import(pathToFileURL(path.resolve(mainDir, 'worker/src/index.js')).href);
const versions = {
  live: [live, { ...secrets }],
  candidate: [candidate, { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml') }],
  fallback: [candidate, { ...secrets, ...tomlVars('worker/wrangler.alias-fallback.toml') }],
};
const ids = Object.values(SERVICES).map((s) => s.eventTypeId);
assert.equal(ids.length, 10);
const mock = createMock();
mock.requiredTerms = new Set(ids);
const start = () => { const t = new Date(Date.now() + 9 * 86400000); t.setUTCHours(12, 0, 0, 0); return t.toISOString(); };
const failures = [];
for (const [name, [worker, env]] of Object.entries(versions)) {
  for (const [key] of Object.entries(SERVICES)) {
    for (const [route, headers, extra] of [['/api/book', {}, {}], ['/api/admin/book', { Authorization: 'Bearer mock' }, {}],
      ['/api/admin/book-series', { Authorization: 'Bearer mock' }, { count: 4 }]]) {
      if (name === 'live' && route.endsWith('series')) continue; // route does not exist
      const r = await call(worker, env, route, { service: key, start: start(), name: 'Testkunde', email: 'k@example.test',
        phone: '+41 79 000 00 00', accepted: true, elapsedMs: 5000, ...extra }, headers);
      if (r.status !== 201) failures.push([name, route, key, r.data.error?.code].join(' '));
    }
  }
}
// Live: Gentleman Rasur is staff-only there (public request refused anyway) and omits the field for staff.
assert.deepEqual(failures.sort(), [
  'live /api/admin/book gentleman-rasur upstream_error',
  'live /api/book gentleman-rasur invalid_service',
]);

// LAB event (7982460) on the regular account webhook: no mail from any regular version.
for (const [name, [worker, env]] of Object.entries(versions)) {
  const lab = mock.addBooking({ eventTypeId: 7982460, start: start(), email: 'info+lab@localboost-zs.ch' });
  for (const payload of [{ eventTypeId: 7982460, attendees: lab.attendees }, {}]) {
    for (const type of ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']) {
      mock.mails.length = 0;
      const res = await sendWebhook(worker, env, type, { uid: lab.uid, startTime: lab.start, ...payload });
      assert.equal(res.status, 200, name); assert.equal(mock.mails.length, 0, name + ' ignores LAB ' + type);
    }
  }
}
console.log('PASS: ten required terms fields - only the live staff booking for Gentleman Rasur fails; LAB events ignored');

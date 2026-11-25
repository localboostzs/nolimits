// Offline: server validation and evidence for the cancellation terms, plus a
// record of CURRENT behaviour around the 24h limit (no new business rule).
import assert from 'node:assert/strict';
import { createMock, secrets, tomlVars, call } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');
const env = { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml') };
const mock = createMock();
const staff = { Authorization: 'Bearer mock' };
const inDays = (d) => { const t = new Date(Date.now() + d * 86400000); t.setUTCHours(12, 0, 0, 0); return t.toISOString(); };
const base = { service: 'gentleman-rasur', start: inDays(9), name: 'Testkunde', email: 'k@example.test', phone: '+41 79 000 00 00', elapsedMs: 5000 };

// Only the boolean true is accepted, on all three booking routes.
for (const [path, headers, extra] of [['/api/book', {}, {}], ['/api/admin/book', staff, {}], ['/api/admin/book-series', staff, { count: 4 }]]) {
  for (const accepted of [undefined, false, 'true', 1, 'on', {}, null]) {
    const r = await call(worker, env, path, { ...base, ...extra, accepted }, headers);
    assert.equal(r.status, 400, path + ' accepted=' + JSON.stringify(accepted));
  }
}
assert.equal(mock.calPosts.length, 0, 'nothing reached Cal.com');

const book = async (path, headers, extra) => {
  mock.calPosts.length = 0;
  const r = await call(worker, env, path, { ...base, accepted: true, ...extra }, headers);
  assert.equal(r.status, 201, path);
  return mock.calPosts;
};
// Customer: boolean field plus evidence; the text version is only logged if known.
for (const [sent, stored] of [['2026-11-23-online-24h', '2026-11-23-online-24h'], [undefined, 'nicht_uebermittelt'], ['erfunden', 'nicht_uebermittelt']]) {
  const [p] = await book('/api/book', {}, { termsVersion: sent });
  assert.strictEqual(p.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
  assert.equal(p.metadata.nlTermsSource, 'customer_checkbox');
  assert.equal(p.metadata.nlTermsVersion, stored);
  assert.ok(Math.abs(Date.parse(p.metadata.nlTermsRecordedAt) - Date.now()) < 5000);
}
// The client cannot choose the source or the timestamp.
const [forged] = await book('/api/book', {}, { metadata: { nlTermsSource: 'x' }, nlTermsRecordedAt: '2000-01-01' });
assert.equal(forged.metadata.nlTermsSource, 'customer_checkbox');
assert.deepEqual(Object.keys(forged.metadata).sort(), ['nlTermsRecordedAt', 'nlTermsSource', 'nlTermsVersion']);
for (const [k, v] of Object.entries(forged.metadata)) assert.ok(k.length <= 40 && typeof v === 'string' && v.length <= 500, 'Cal.com metadata limits');
// Staff bookings, single and series, are marked as staff attestation even if a version is sent.
const [single] = await book('/api/admin/book', staff, { termsVersion: '2026-11-23-online-24h' });
assert.equal(single.metadata.nlTermsSource, 'staff_attestation');
assert.equal(single.metadata.nlTermsVersion, 'nicht_uebermittelt');
assert.strictEqual(single.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
const series = await book('/api/admin/book-series', staff, { count: 4 });
assert.equal(series.length, 4);
for (const p of series) {
  assert.equal(p.metadata.nlTermsSource, 'staff_attestation');
  assert.strictEqual(p.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
}

// BEFUND (current behaviour): the 24h limit blocks cancel, but not reschedule.
const soon = mock.addBooking({ eventTypeId: 7888953, start: new Date(Date.now() + 3 * 3600000).toISOString(), email: 'k@example.test' });
const exp = Math.floor(Date.parse(soon.start) / 1000) + 7 * 86400;
const { createHmac } = await import('node:crypto');
const token = exp + '.' + createHmac('sha256', env.NL_MANAGE_SECRET).update(soon.uid + ':' + exp).digest('base64url');
const direct = await call(worker, env, '/api/manage/cancel', { uid: soon.uid, token, confirm: true });
assert.equal(direct.data.error.code, 'cancellation_deadline');
const later = inDays(5);
const moved = await call(worker, env, '/api/manage/reschedule', { uid: soon.uid, token, confirm: true, start: later });
assert.equal(moved.status, 200);
const link = new URL(moved.data.booking.manageUrl).searchParams;
const after = await call(worker, env, '/api/manage/cancel', { uid: link.get('uid'), token: link.get('token'), confirm: true });
assert.equal(after.status, 200);
console.log('BEFUND bestaetigt: 3h vor Termin ist Storno gesperrt, nach Umbuchung auf spaeter jedoch moeglich (keine Regel geaendert)');
console.log('PASS: strict terms validation, evidence metadata for customer, staff and series bookings');

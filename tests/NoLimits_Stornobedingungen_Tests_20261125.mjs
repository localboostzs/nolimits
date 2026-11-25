// Offline: server validation and evidence for the booking terms.
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
// Staff bookings, single and series: staff attestation with the server-side staff id.
const STAFF = '11111111-1111-4111-8111-111111111111';
for (const [sent, stored] of [['staff-2026-11-25-informiert', 'staff-2026-11-25-informiert'], [undefined, 'nicht_uebermittelt'], ['2026-11-23-online-24h', 'nicht_uebermittelt']]) {
  const [single] = await book('/api/admin/book', staff, { termsVersion: sent, nlTermsStaffId: 'forged', metadata: { nlTermsSource: 'x' } });
  assert.equal(single.metadata.nlTermsSource, 'staff_attestation');
  assert.equal(single.metadata.nlTermsVersion, stored);
  assert.equal(single.metadata.nlTermsStaffId, STAFF);
  assert.strictEqual(single.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
}
const series = await book('/api/admin/book-series', staff, { count: 4, termsVersion: 'staff-2026-11-25-informiert' });
assert.equal(series.length, 4);
for (const p of series) {
  assert.equal(p.metadata.nlTermsSource, 'staff_attestation');
  assert.equal(p.metadata.nlTermsVersion, 'staff-2026-11-25-informiert');
  assert.equal(p.metadata.nlTermsStaffId, STAFF);
  assert.strictEqual(p.bookingFieldsResponses.stornierungsbedingungen_akzeptiert, true);
}
console.log('PASS: strict terms validation, evidence metadata for customer, staff and series bookings');

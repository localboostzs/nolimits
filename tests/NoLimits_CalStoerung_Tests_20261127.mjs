// Offline: how the Worker classifies Cal.com answers when a booking is sent.
// Only a definite rejection (400/409/422) may say «nothing booked»; every disturbance must stay
// «upstream_error», so the website shows «Status unklar» instead of inviting a second booking.
import assert from 'node:assert/strict';
import { createMock, secrets, tomlVars, call } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const free = (days) => { const t = new Date(Date.now() + days * 86400000); t.setUTCHours(12, 0, 0, 0); return t.toISOString(); };
const form = (start) => ({ service: 'haarschnitt', start, name: 'Testkunde', email: 'kunde@example.test', phone: '+41 79 000 00 00',
  accepted: true, termsVersion: '2026-11-25-online-24h-storno-umbuchung', website: '', elapsedMs: 9000 });
let checked = 0;

for (const config of ['production-candidate', 'alias-fallback']) {
  const env = { ...secrets, ...tomlVars('worker/wrangler.' + config + '.toml') };
  const mock = createMock();
  const base = mock.fetch;
  let answer = null, created = false;
  globalThis.fetch = mock.fetch = async (input, opts = {}) => {
    const u = new URL(String(input));
    if (answer && u.pathname === '/v2/bookings' && opts.method === 'POST') {
      if (answer.creates) { created = true; await base(input, opts); }
      if (answer.throws) throw new TypeError('network');
      return Response.json(answer.body, { status: answer.status });
    }
    return base(input, opts);
  };
  const cases = [
    // [label, Cal.com answer, expected status, expected code]
    ['503 Service unavailable', { status: 503, body: { message: 'Service Unavailable' } }, 502, 'upstream_error'],
    ['503 unavailable and booked by then', { status: 503, body: { message: 'Service temporarily unavailable' }, creates: true }, 502, 'upstream_error'],
    ['500 mail service failed', { status: 500, body: { message: 'Email service failed' }, creates: true }, 502, 'upstream_error'],
    ['500 phone lookup', { status: 500, body: { message: 'phone validation service down' } }, 502, 'upstream_error'],
    ['502 html', { status: 502, body: 'Bad gateway' }, 502, 'upstream_error'],
    ['429 slots busy', { status: 429, body: { message: 'Too many requests, server busy' } }, 502, 'upstream_error'],
    ['401 auth', { status: 401, body: { message: 'Unauthorized' } }, 502, 'upstream_error'],
    ['network error', { throws: true }, 502, 'upstream_unreachable'],
    ['409 taken', { status: 409, body: { message: 'x' } }, 409, 'slot_unavailable'],
    ['400 no available users', { status: 400, body: { error: { message: 'no_available_users_found_error' } } }, 409, 'slot_unavailable'],
    ['400 already booked', { status: 400, body: { message: 'Attendee already has a booking at this time' } }, 409, 'slot_unavailable'],
    ['400 email invalid', { status: 400, body: { message: 'Invalid email' } }, 400, 'invalid_email'],
    ['422 phone invalid', { status: 422, body: { message: 'Invalid phone number' } }, 400, 'invalid_phone'],
    ['400 other field', { status: 400, body: { message: 'required booking field missing' } }, 400, 'booking_rejected'],
    ['400 user unavailable', { status: 400, body: { message: 'User unavailable' } }, 400, 'booking_rejected'],
  ];
  let day = 3;
  for (const [label, given, status, code] of cases) {
    answer = given; created = false;
    const r = await call(worker, env, '/api/book', form(free(day++)));
    assert.equal(r.data.ok, false, config + ' ' + label);
    assert.deepEqual([r.status, r.data.error.code], [status, code], config + ' ' + label);
    if (code === 'upstream_error' || code === 'upstream_unreachable') {
      assert.doesNotMatch(r.data.error.message, /nicht mehr verfügbar|E-Mail-Adresse|Telefonnummer/, label + ': no false «nothing booked»');
    }
    if (created) assert.equal(code, 'upstream_error', label + ': a booking that exists is never reported as rejected');
    checked++;
  }
  // The normal path is unchanged.
  answer = null;
  const ok = await call(worker, env, '/api/book', form(free(day++)));
  assert.equal(ok.status, 201);
  assert.equal(ok.data.booking.status, 'accepted');
  checked++;
}
console.log('PASS: Cal.com disturbances never turn into «Termin vergeben» (' + checked + ' cases).');

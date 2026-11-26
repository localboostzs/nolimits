// Offline: +CHF 5 for appointments from 01.01.2027 00:00 Europe/Zurich, in the services
// lists, the booking mail and the management page. The appointment start decides.
import assert from 'node:assert/strict';
import { createMock, secrets, tomlVars, sendWebhook, SUPABASE } from './NoLimits_MockBackend_20261125.mjs';
import { SERVICES } from '../worker/src/services.js';
import worker from '../worker/src/index.js';

const env = { ...secrets, ...tomlVars('worker/wrangler.production-candidate.toml'), NL_SUPABASE_URL: SUPABASE };
const staff = { Authorization: 'Bearer mock' };
const get = async (path, headers = {}) => {
  const response = await worker.fetch(new Request('https://worker.test' + path,
    { headers: { Origin: env.ALLOWED_ORIGINS.split(',')[0], ...headers } }), env);
  assert.equal(response.status, 200, path);
  return response.json();
};
const realNow = Date.now;
const at = (iso) => { Date.now = () => Date.parse(iso); };
const LAST_OLD = '2026-12-31T22:59:00.000Z';  // 31.12.2026 23:59 in Zurich
const FIRST_NEW = '2026-12-31T23:00:00.000Z'; // 01.01.2027 00:00 in Zurich

try {
  at('2026-12-01T10:00:00Z');
  createMock();
  for (const [path, headers] of [['/api/services', {}], ['/api/admin/services', staff]]) {
    const { services } = await get(path, headers);
    for (const [key, base] of Object.entries(SERVICES)) {
      const s = services.find((x) => x.key === key);
      assert.equal(s.price, base.price, key + ' before 2027');
      assert.deepEqual(s.priceChange, { from: '2027-01-01', price: base.price + 5 }, key);
    }
    for (const s of services.filter((x) => !SERVICES[x.key] && !(x.price > 0))) assert.equal(s.priceChange, undefined, s.key);
  }

  for (const [start, price, hint] of [[LAST_OLD, 30, true], [FIRST_NEW, 35, false]]) {
    const mock = createMock();
    const alias = 'info+' + 'e'.repeat(32) + '@localboost-zs.ch';
    mock.aliases.set(alias, { alias_email: alias, customer_email: 'kunde@example.test' });
    // Booked in December, before the change: the appointment date still decides.
    const booking = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start, email: alias });
    assert.equal((await sendWebhook(worker, env, 'BOOKING_CREATED', { uid: booking.uid })).status, 200);
    assert.equal(mock.mails.length, 1);
    assert.match(mock.mails[0].html, new RegExp('Preis:</strong> CHF ' + price + ' ·'), start);
    const link = new URL(mock.mails[0].html.match(/href="([^"]*termin-verwalten[^"]*)"/)[1].replace(/&amp;/g, '&'));
    const detail = (await get('/api/manage' + link.search)).booking;
    assert.equal(detail.price, price, 'manage ' + start);
    // Both prices while a move across the turn of the year is still possible.
    assert.deepEqual(detail.pricePlan, { from: '2027-01-01', before: 30, after: 35 }, 'manage plan ' + start);
    assert.equal(hint, detail.price === detail.pricePlan.before);
  }

  // Booking, weekly series and rescheduling in both directions: the appointment date decides.
  at('2026-12-14T09:00:00Z');
  {
    const mock = createMock();
    const post = async (path, body, headers = {}, status = 200) => {
      const response = await worker.fetch(new Request('https://worker.test' + path, { method: 'POST',
        headers: { Origin: env.ALLOWED_ORIGINS.split(',')[0], 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body) }), env);
      const data = await response.json();
      assert.equal(response.status, status, path + ' ' + JSON.stringify(data));
      return data;
    };
    const person = { service: 'haarschnitt', name: 'Testkunde', email: 'kunde@example.test', phone: '+41 79 000 00 00', accepted: true, elapsedMs: 5000 };
    const early = await post('/api/book', { ...person, start: '2026-12-22T12:00:00.000Z' }, {}, 201);
    const late = await post('/api/book', { ...person, start: '2027-01-05T12:00:00.000Z' }, {}, 201);
    assert.deepEqual([early.booking.price, late.booking.price], [30, 35]);
    const series = await post('/api/admin/book-series', { ...person, start: '2026-12-19T12:00:00.000Z', count: 4 }, staff, 201);
    assert.deepEqual(series.prices, [30, 30, 35, 35]);

    const link = new URL(early.booking.manageUrl);
    const forward = await post('/api/manage/reschedule', { uid: link.searchParams.get('uid'), token: link.searchParams.get('token'),
      confirm: true, start: '2027-01-12T12:00:00.000Z' });
    assert.equal(forward.booking.price, 35, 'moved into 2027');
    const next = new URL(forward.booking.manageUrl);
    assert.equal((await get('/api/manage' + next.search)).booking.price, 35);
    const backward = await post('/api/manage/reschedule', { uid: next.searchParams.get('uid'), token: next.searchParams.get('token'),
      confirm: true, start: '2026-12-29T12:00:00.000Z' });
    assert.equal(backward.booking.price, 30, 'moved back into 2026');
    const byStaff = await post('/api/admin/reschedule', { uid: [...mock.bookings.values()].at(-1).uid, confirm: true,
      start: '2027-01-02T12:00:00.000Z' }, staff);
    assert.equal(byStaff.booking.price, 35, 'staff move into 2027');
  }

  at('2026-12-31T23:00:00Z');
  createMock();
  const { services } = await get('/api/services');
  for (const s of services) {
    assert.equal(s.price, SERVICES[s.key].price + 5, s.key + ' from 2027');
    assert.equal(s.priceChange, undefined);
  }
  {
    const mock = createMock();
    const alias = 'info+' + 'f'.repeat(32) + '@localboost-zs.ch';
    mock.aliases.set(alias, { alias_email: alias, customer_email: 'kunde@example.test' });
    const booking = mock.addBooking({ eventTypeId: SERVICES.haarschnitt.eventTypeId, start: '2027-01-09T12:00:00.000Z', email: alias });
    assert.equal((await sendWebhook(worker, env, 'BOOKING_CREATED', { uid: booking.uid })).status, 200);
    const link = new URL(mock.mails[0].html.match(/href="([^"]*termin-verwalten[^"]*)"/)[1].replace(/&amp;/g, '&'));
    const detail = (await get('/api/manage' + link.search)).booking;
    assert.equal(detail.price, 35);
    assert.equal(detail.pricePlan, undefined, 'no earlier price can apply any more');
  }
} finally {
  Date.now = realNow;
}
console.log('PASS: prices by appointment date from 01.01.2027 (services, booking, series, mail, management, rescheduling)');

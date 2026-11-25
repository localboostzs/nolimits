// Offline: exact 24h boundary, staff exemption, server-side webhook verification and
// duplicate delivery - for the release candidate and the alias fallback.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMock, secrets, tomlVars, call } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const HOUR = 3600000;
const staff = { Authorization: 'Bearer mock' };
for (const config of ['production-candidate', 'alias-fallback']) {
  const env = { ...secrets, ...tomlVars('worker/wrangler.' + config + '.toml') };
  const mock = createMock();
  const alias = 'info+' + 'b'.repeat(32) + '@localboost-zs.ch';
  mock.aliases.set(alias, { alias_email: alias, customer_email: 'alias-kunde@example.test' });
  const add = (offset, email = 'kunde@example.test', eventTypeId = 7888953) =>
    mock.addBooking({ eventTypeId, start: new Date(Date.now() + offset).toISOString(), email });
  const token = (b) => { const exp = Math.floor(Date.parse(b.start) / 1000) + 7 * 86400;
    return exp + '.' + crypto.createHmac('sha256', env.NL_MANAGE_SECRET).update(b.uid + ':' + exp).digest('base64url'); };
  const free = (days) => { const t = new Date(Date.now() + days * 86400000); t.setUTCHours(12, 0, 0, 0); return t.toISOString(); };
  const view = (b) => call(worker, env, '/api/manage?uid=' + b.uid + '&token=' + token(b));
  const slots = (b) => { const day = free(5).slice(0, 10);
    return call(worker, env, '/api/manage/slots?uid=' + b.uid + '&token=' + token(b) + '&service=haarschnitt&start=' + day + '&end=' + day); };
  const cancel = (b) => call(worker, env, '/api/manage/cancel', { uid: b.uid, token: token(b), confirm: true });
  const move = (b, start = free(5)) => call(worker, env, '/api/manage/reschedule', { uid: b.uid, token: token(b), confirm: true, start });

  // ---------- Exact boundary, with a frozen clock ----------
  const realNow = Date.now, frozen = Math.floor(realNow() / 1000) * 1000;
  Date.now = () => frozen;
  try {
    for (const [offset, allowed] of [[24 * HOUR + 1, true], [24 * HOUR, true], [24 * HOUR - 1, false], [HOUR, false]]) {
      const label = config + ' offset ' + offset;
      const flags = (await view(add(offset))).data.booking;
      assert.deepEqual([flags.canManage, flags.canCancel, flags.canReschedule], [allowed, allowed, allowed], label);
      const a = add(offset), b = add(offset);
      const s = await slots(a), m = await move(a), c = await cancel(b);
      if (allowed) {
        assert.deepEqual([s.status, m.status, c.status], [200, 200, 200], label);
      } else {
        assert.deepEqual([s.data.error.code, m.data.error.code, c.data.error.code], ['reschedule_deadline', 'reschedule_deadline', 'cancellation_deadline'], label);
        assert.deepEqual([a.status, b.status], ['accepted', 'accepted'], 'nothing changed');
      }
    }
    // The former bypass: move first, cancel afterwards.
    const soon = add(3 * HOUR);
    assert.equal((await move(soon)).status, 409);
    assert.equal((await cancel(soon)).status, 409);
  } finally { Date.now = realNow; }

  // ---------- Staff exemption ----------
  const admin = (path, body, headers = staff) => call(worker, env, path, body, headers);
  const near = add(2 * HOUR);
  for (const [headers, status] of [[{}, 401], [{ Authorization: 'Basic x' }, 401]]) {
    assert.equal((await admin('/api/admin/cancel', { uid: near.uid, confirm: true }, headers)).status, status);
  }
  // A customer's management token is no staff login.
  assert.equal((await admin('/api/admin/cancel', { uid: near.uid, token: token(near), confirm: true }, {})).status, 401);
  for (const rows of [[], [{ role: 'staff', active: false }], [{ role: 'customer', active: true }]]) {
    mock.staffRows = rows;
    for (const path of ['/api/admin/cancel', '/api/admin/reschedule']) assert.equal((await admin(path, { uid: near.uid, confirm: true, start: free(3) })).status, 403);
  }
  mock.staffRows = [{ role: 'owner', active: true }];
  assert.equal(near.status, 'accepted');
  assert.equal((await admin('/api/admin/cancel', { uid: near.uid })).status, 400, 'confirmation required');
  assert.equal((await admin('/api/admin/cancel', { uid: 'UnknownBookingUid999', confirm: true })).status, 404);
  assert.equal((await admin('/api/admin/cancel', { uid: add(2 * HOUR, 'x@example.test', 7982460).uid, confirm: true })).status, 404, 'foreign event type');
  assert.equal((await admin('/api/admin/cancel', { uid: add(-HOUR).uid, confirm: true })).data.error.code, 'not_active', 'already started');
  assert.equal((await admin('/api/admin/reschedule', { uid: near.uid, confirm: true, start: new Date(Date.now() + 40 * 86400000 + 5000).toISOString() })).data.error.code, 'slot_unavailable');
  assert.equal((await admin('/api/admin/reschedule', { uid: near.uid, confirm: true, start: new Date(Date.now() + HOUR / 2).toISOString() })).data.error.code, 'too_soon', 'general one hour notice unchanged');
  const moved = await admin('/api/admin/reschedule', { uid: near.uid, confirm: true, start: free(3) });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.booking.manageUrl, undefined, 'staff receive no customer token');
  const short = add(2 * HOUR);
  assert.equal((await admin('/api/admin/cancel', { uid: short.uid, confirm: true })).status, 200);
  assert.equal(short.status, 'cancelled');
  assert.equal((await admin('/api/admin/cancel', { uid: short.uid, confirm: true })).status, 409, 'only once');
  const crm = await call(worker, env, '/api/admin/contacts', null, staff);
  assert.ok(crm.data.contacts.flatMap((c) => c.upcoming).some((x) => x.serviceKey === 'haarschnitt'));

  // ---------- Webhooks: validly signed, but the payload is not trusted ----------
  const sent = []; const delivered = new Map(); const base = mock.fetch; let calDown = null, lag = 0;
  globalThis.fetch = async (u, o) => {
    const url = String(u);
    if (url === 'https://api.resend.com/emails') {
      const key = o.headers['Idempotency-Key']; sent.push({ key, body: o.body, to: JSON.parse(o.body).to });
      if (!delivered.has(key)) delivered.set(key, o.body); else assert.equal(delivered.get(key), o.body, 'same key, same body');
      return Response.json({ id: 'mock' });
    }
    if (url.startsWith('https://api.cal.com/v2/bookings/') && (o?.method || 'GET') === 'GET') {
      if (calDown === 'network') throw Error('offline');
      if (calDown) return Response.json({}, { status: calDown });
      if (lag > 0) { lag--; const real = await (await base(u, o)).json(); return Response.json({ data: { ...real.data, status: 'accepted' } }); }
    }
    return base(u, o);
  };
  const hook = async (type, payload, extra = { createdAt: new Date().toISOString() }) => {
    sent.length = 0;
    const body = JSON.stringify({ triggerEvent: type, ...extra, payload });
    const sig = crypto.createHmac('sha256', env.CAL_WEBHOOK_SECRET).update(body).digest('hex');
    const res = await worker.fetch(new Request('https://w.test/api/webhooks/cal', { method: 'POST', headers: { 'X-Cal-Signature-256': sig }, body }), env);
    return { status: res.status, to: sent.flatMap((m) => m.to), mails: [...sent] };
  };
  const silent = async (type, payload, status = 200, extra) => {
    const r = await hook(type, payload, extra);
    assert.deepEqual([r.status, r.to], [status, []], config + ' ' + type + ' ' + JSON.stringify(payload));
  };
  const real = add(6 * 86400000);
  const lie = { uid: real.uid, eventTypeId: 7888954, startTime: free(90), endTime: free(91),
    attendees: [{ name: 'x', email: 'outsider@example.test' }] };
  let r = await hook('BOOKING_CREATED', lie);
  assert.deepEqual(r.to, ['kunde@example.test'], 'recipient from Cal.com, not from the payload');
  const mail = JSON.parse(r.mails[0].body).html;
  assert.ok(mail.includes('>Haarschnitt<') && !mail.includes('Rasieren') && !mail.includes('outsider'), 'service from Cal.com');
  const link = new URL(mail.match(/href="([^"]*termin-verwalten[^"]*)"/)[1].replace(/&amp;/g, '&'));
  assert.equal(link.searchParams.get('token'), token(real), 'token derived from the real start time');
  // Payload with only the uid is enough; nothing else is needed from it.
  assert.deepEqual((await hook('BOOKING_CREATED', { uid: real.uid })).to, ['kunde@example.test']);
  await silent('BOOKING_CREATED', { ...lie, uid: 'UnknownBookingUid999' });
  await silent('BOOKING_CREATED', { uid: add(86400000 * 3, 'x@example.test', 7982460).uid });
  await silent('BOOKING_CREATED', { uid: add(-HOUR).uid });
  await silent('BOOKING_CREATED', { uid: add(86400000, 'kein-email').uid });
  await silent('BOOKING_CANCELLED', { uid: real.uid }, 409);
  await silent('BOOKING_RESCHEDULED', { uid: real.uid }, 409);
  const gone = add(86400000 * 4); gone.status = 'cancelled';
  await silent('BOOKING_CREATED', { uid: gone.uid }, 409);
  assert.deepEqual((await hook('BOOKING_CANCELLED', { uid: gone.uid })).to, ['kunde@example.test']);
  const replaced = add(86400000 * 4); replaced.status = 'cancelled'; replaced.rescheduledToUid = real.uid;
  await silent('BOOKING_CANCELLED', { uid: replaced.uid });
  const after = mock.bookings.get([...mock.bookings.values()].find((b) => b.rescheduledFromUid === near.uid).uid);
  assert.deepEqual((await hook('BOOKING_RESCHEDULED', { uid: after.uid })).to, ['kunde@example.test']);
  // Replay and clock checks.
  for (const createdAt of [new Date(Date.now() - 13 * HOUR).toISOString(), new Date(Date.now() + HOUR).toISOString(), 'nonsense', null]) {
    await silent('BOOKING_CREATED', { uid: real.uid }, 200, { createdAt });
  }
  assert.equal((await hook('BOOKING_CREATED', { uid: real.uid }, { createdAt: new Date(Date.now() - 11 * HOUR).toISOString() })).to.length, 1);
  assert.equal((await hook('BOOKING_CREATED', { uid: real.uid }, {})).to.length, 1, 'missing timestamp: server check still applies');
  // Cal.com unreachable: no mail, non-2xx.
  for (const down of ['network', 500, 429, 401]) { calDown = down; await silent('BOOKING_CREATED', { uid: real.uid }, 503); }
  calDown = 404; await silent('BOOKING_CREATED', { uid: real.uid });
  calDown = null;
  // The webhook may arrive shortly before Cal.com shows the new state.
  lag = 1; assert.deepEqual((await hook('BOOKING_CANCELLED', { uid: gone.uid })).to, ['kunde@example.test']);
  // Alias booking: resolved from the server-side attendee only.
  const hidden = add(86400000 * 5, alias);
  const resolved = (await hook('BOOKING_CREATED', { uid: hidden.uid, attendees: [{ email: 'outsider@example.test' }] })).to;
  if (config === 'alias-fallback') {
    assert.deepEqual(resolved, ['alias-kunde@example.test']);
    mock.aliases.clear(); await silent('BOOKING_CREATED', { uid: hidden.uid }, 503);
  } else {
    // Documented limit: the candidate has no alias domain and must not be used after activation.
    assert.deepEqual(resolved, [alias]);
  }

  // ---------- Duplicate delivery ----------
  delivered.clear(); sent.length = 0;
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', createdAt: new Date().toISOString(), payload: { uid: real.uid } });
  const sig = crypto.createHmac('sha256', env.CAL_WEBHOOK_SECRET).update(body).digest('hex');
  const again = () => worker.fetch(new Request('https://w.test/api/webhooks/cal', { method: 'POST', headers: { 'X-Cal-Signature-256': sig }, body }), env);
  const results = await Promise.all([again(), again(), again()]);
  assert.deepEqual(results.map((x) => x.status), [200, 200, 200]);
  assert.equal(sent.length, 3); assert.equal(delivered.size, 1, 'one idempotency key: Resend sends once');
  console.log('PASS ' + config + ': 24h boundary, staff exemption, server-verified webhooks, duplicate delivery');
}

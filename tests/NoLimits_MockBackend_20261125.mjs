// Shared offline mock of Cal.com, Supabase and Resend. Replaces globalThis.fetch;
// any unknown request throws, so no test can reach a live system.
import fs from 'node:fs';
import crypto from 'node:crypto';

export const SUPABASE = 'https://nolimitsmock.supabase.co';
export const secrets = Object.freeze({
  CAL_API_KEY: 'cal_mock', CAL_WEBHOOK_SECRET: 'mock-webhook-secret', RESEND_API_KEY: 're_mock',
  NL_MANAGE_SECRET: 'mock-management-secret-'.repeat(3), NL_EMAIL_ENABLED: 'true',
  NL_SUPABASE_URL: SUPABASE, NL_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock',
  NL_SUPABASE_SECRET_KEY: 'sb_secret_mock',
});
export function tomlVars(path) {
  const block = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n[vars]\n')[1].split('\n[[')[0];
  return Object.fromEntries([...block.matchAll(/^(\w+) = "([^"]*)"/gm)].map((m) => [m[1], m[2]]));
}
export const zurichDay = (iso) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function createMock() {
  const state = { bookings: new Map(), aliases: new Map(), mails: [], calPosts: [], seq: 0,
    requiredTerms: new Set([7912905]),
    staffRows: [{ role: 'staff', active: true }] };
  const newUid = () => 'MockBookingUid' + String(++state.seq).padStart(6, '0');
  state.addBooking = ({ eventTypeId, start, email, name = 'Testkunde' }) => {
    const uid = newUid();
    const b = { uid, status: 'accepted', eventTypeId, start,
      end: new Date(Date.parse(start) + 30 * 60000).toISOString(), attendees: [{ name, email }] };
    state.bookings.set(uid, b); return b;
  };
  // Two free times per day (12:00 and 13:00 UTC), only in the future.
  function slots(from, to) {
    const data = {};
    for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) {
      const day = new Date(t).toISOString().slice(0, 10);
      const list = [12, 13].map((h) => new Date(t + h * 3600000).toISOString())
        .filter((s) => Date.parse(s) > Date.now()).map((start) => ({ start }));
      if (list.length) data[day] = list;
    }
    return data;
  }
  state.fetch = async (input, opts = {}) => {
    const u = new URL(String(input)), method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (u.origin === 'https://api.cal.com') {
      if (u.pathname === '/v2/slots') return Response.json({ data: slots(u.searchParams.get('start'), u.searchParams.get('end')) });
      const [, , , uid, action] = u.pathname.split('/');
      if (!uid && method === 'POST') {
        state.calPosts.push(body);
        // Configured in Cal.com on 25.11.2026 for Gentleman Rasur (7912905); tests may add more ids.
        // Rejection of a missing value is assumed from that setting; it was not tried against Cal.com.
        if (state.requiredTerms.has(body.eventTypeId) && body.bookingFieldsResponses?.stornierungsbedingungen_akzeptiert !== true) {
          return Response.json({ message: 'required booking field missing' }, { status: 400 });
        }
        const b = state.addBooking({ eventTypeId: body.eventTypeId, start: body.start, email: body.attendee.email, name: body.attendee.name });
        Object.assign(b, { bookingFieldsResponses: body.bookingFieldsResponses, metadata: body.metadata });
        return Response.json({ data: b }, { status: 201 });
      }
      if (!uid) {
        const past = u.searchParams.get('status') === 'past';
        return Response.json({ data: [...state.bookings.values()].filter((b) => (Date.parse(b.start) < Date.now()) === past) });
      }
      const booking = state.bookings.get(uid);
      if (!booking) return Response.json({}, { status: 404 });
      if (!action) return Response.json({ data: booking });
      if (action === 'cancel') { booking.status = 'cancelled'; return Response.json({ data: booking }); }
      if (action === 'reschedule') {
        booking.status = 'cancelled';
        const next = state.addBooking({ eventTypeId: booking.eventTypeId, start: body.start, email: booking.attendees[0].email, name: booking.attendees[0].name });
        booking.rescheduledToUid = next.uid;
        next.rescheduledFromUid = booking.uid;
        return Response.json({ data: next });
      }
    }
    if (u.origin === SUPABASE) {
      if (u.pathname === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
      if (u.pathname === '/rest/v1/nl_staff') return Response.json(state.staffRows);
      if (['/rest/v1/nl_customer_profiles', '/rest/v1/nl_legacy_contacts'].includes(u.pathname)) return Response.json([]);
      if (u.pathname === '/rest/v1/nl_booking_email_aliases') {
        if (opts.headers.apikey !== secrets.NL_SUPABASE_SECRET_KEY) return Response.json({}, { status: 401 });
        const eq = (u.searchParams.get('alias_email') || '').replace(/^eq\./, '');
        if (method === 'POST') { state.aliases.set(body.alias_email, body); return new Response(null, { status: 201 }); }
        if (method === 'PATCH') { Object.assign(state.aliases.get(eq), body); return new Response(null, { status: 204 }); }
        if (method === 'DELETE') { state.aliases.delete(eq); return new Response(null, { status: 204 }); }
        const wanted = [...(u.searchParams.get('alias_email') || '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
        return Response.json(wanted.map((a) => state.aliases.get(a)).filter(Boolean));
      }
    }
    if (u.href === 'https://api.resend.com/emails') { state.mails.push(body); return Response.json({ id: 'mock' }); }
    throw Error('Unmocked request: ' + method + ' ' + u.origin + u.pathname);
  };
  globalThis.fetch = state.fetch;
  return state;
}

export async function sendWebhook(worker, env, triggerEvent, payload) {
  const body = JSON.stringify({ triggerEvent, payload });
  const sig = crypto.createHmac('sha256', env.CAL_WEBHOOK_SECRET).update(body).digest('hex');
  return worker.fetch(new Request('https://worker.test/api/webhooks/cal',
    { method: 'POST', headers: { 'X-Cal-Signature-256': sig }, body }), env);
}
let ip = 0;
export async function call(worker, env, path, body, headers = {}) {
  const res = await worker.fetch(new Request('https://worker.test' + path, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'CF-Connecting-IP': '10.0.' + Math.floor(++ip / 250) + '.' + (ip % 250), ...headers },
  }), env);
  return { status: res.status, data: await res.json() };
}

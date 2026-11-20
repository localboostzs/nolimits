// NoLimits alias CRM integration tests against the current feature-branch Worker source.
// No real Supabase, Cal.com, customer accounts, or live bookings are accessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const services = fs.readFileSync('worker/src/services.js', 'utf8').replace(/^export /gm, '');
const source = fs.readFileSync('worker/src/index.js', 'utf8')
  .replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';", services);
const {default:worker} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const alias = 'info+'+'a'.repeat(32)+'@localboost-zs.ch';
const original = 'real-client@example.net';
const validUserId = '11111111-1111-4111-8111-111111111111';
const start = new Date(Date.now()+14*86400000).toISOString();
const end = new Date(Date.parse(start)+30*60000).toISOString();
let mappingExists = true;
let isStaff = true;
let lookupCount = 0;
let dataSecretUsed = false;

globalThis.fetch = async (url, init={}) => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) {
    assert.equal(init.headers.Authorization, 'Bearer mock-staff-jwt');
    return Response.json({id:validUserId});
  }
  if (u.includes('/rest/v1/nl_staff?')) {
    return Response.json([{role:'staff',active:isStaff}]);
  }
  if (u.includes('/rest/v1/nl_customer_profiles?') || u.includes('/rest/v1/nl_legacy_contacts?')) {
    return Response.json([]);
  }
  if (u.includes('/v2/bookings?')) {
    if (u.includes('status=past')) return Response.json({data:[]});
    return Response.json({data:[
      {uid:'aliasCRMTestBooking123',eventTypeId:7888953,status:'accepted',start,end,
       attendees:[{name:'CRM Testkunde',phoneNumber:'+41790000000',email:alias}]},
      {uid:'unrelatedPrivateBookingX',eventTypeId:9999999,status:'accepted',start,end,
       attendees:[{name:'Fremde Person',email:'third-party@example.net'}]}
    ]});
  }
  if (u.includes('/rest/v1/nl_booking_email_aliases?')) {
    lookupCount++;
    dataSecretUsed = init.headers?.apikey==='sb_secret_mockkey';
    assert.equal(init.redirect,'manual');
    assert.ok(u.includes('alias_email='));
    return Response.json(mappingExists ? [{alias_email:alias,customer_email:original}] : []);
  }
  throw new Error('Unexpected network URL '+u);
};

const env={
  ALLOWED_ORIGINS:'https://localboostzs.github.io',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mockkey',
  NL_SUPABASE_SECRET_KEY:'sb_secret_mockkey',
  CAL_API_KEY:'cal_mock',
  NL_ALIAS_MODE:'enabled',
  NL_ALIAS_DOMAIN:'localboost-zs.ch',
  NL_ALIAS_PREFIX:'info',
  NL_ALIAS_SEPARATOR:'+'
};
async function call(token=true) {
  const h={Origin:'https://localboostzs.github.io'};
  if(token) h.Authorization='Bearer mock-staff-jwt';
  const response=await worker.fetch(new Request('https://example.workers.dev/api/admin/contacts',{headers:h}),env);
  return {status:response.status,body:await response.json()};
}
let r=await call(false);
assert.equal(r.status,401,'Unauthenticated users cannot read CRM');
isStaff=false;
r=await call();
assert.equal(r.status,403,'Non-staff users cannot read CRM');
isStaff=true;
r=await call();
assert.equal(r.status,200);
assert.equal(r.body.contacts.length,1,'Only the NoLimits service booking appears');
assert.equal(r.body.contacts[0].email,original,'CRM resolves alias to the customer address');
assert.equal(r.body.contacts[0].upcoming.length,1,'Booking belongs to the real customer');
assert.ok(dataSecretUsed,'Alias lookup uses a server-side secret');
assert.ok(!JSON.stringify(r.body).includes(alias),'Alias must not appear in visible CRM JSON');
assert.ok(!JSON.stringify(r.body).includes('third-party@example.net'),'Unrelated Cal.com attendees must not leak');
assert.ok(lookupCount>0,'CRM alias mapping was queried');

env.NL_ALIAS_MODE='off'; // Rollback must not break already-booked alias appointments
r=await call();
assert.equal(r.status,200);
assert.equal(r.body.contacts[0].email,original,'Legacy alias resolves after turning alias mode OFF');

mappingExists=false;
r=await call();
assert.equal(r.status,200);
assert.equal(r.body.contacts.length,0,'Unmapped aliases must not be shown as customer identities');
assert.equal(r.body.bookingsWarning,true,'Missing mapping produces a visible warning');
console.log('PASS: CRM authentication, staff gating, alias resolution, privacy, rollback, unmapped fail-closed');

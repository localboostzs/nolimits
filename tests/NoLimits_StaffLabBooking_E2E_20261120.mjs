// NoLimits: authenticated staff is allowed to book ONLY the Cal.com LAB event
// through the isolated staging Worker. Every external request is mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const services=fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const source=fs.readFileSync('worker/src/index.js','utf8').replace(
  "import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",services);
const app=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const userId='11111111-1111-4111-8111-111111111111';
const start=new Date(Date.now()+12*86400000).toISOString();
const end=new Date(Date.parse(start)+900000).toISOString();
const customer='info+lab-staff-test@localboost-zs.ch';
const bookingUid='NoLimitsLABStaffBooking12345';
let staffActive=true,calPosts=0,aliasInserts=0,aliasUpdates=0,stored=null;
const env={
  NL_ALIAS_STAGING_ONLY:'true',NL_ALIAS_MODE:'enabled',NL_ICS_ENABLED:'false',
  NL_ALIAS_DOMAIN:'localboost-zs.ch',NL_ALIAS_PREFIX:'info',NL_ALIAS_SEPARATOR:'+',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_lab_mock',
  NL_SUPABASE_SECRET_KEY:'sb_secret_lab_mock',
  CAL_API_KEY:'cal_lab_mock',
  ALLOWED_ORIGINS:'https://localboostzs.github.io'
};
globalThis.fetch=async(input,opts={})=>{
  const url=String(input),method=opts.method||'GET';
  if(url.endsWith('/auth/v1/user'))return Response.json({id:userId});
  if(url.includes('/rest/v1/nl_staff?'))
    return Response.json(staffActive?[{role:'staff',active:true}]:[]);
  if(url.includes('/rest/v1/nl_customer_profiles?')||
     url.includes('/rest/v1/nl_legacy_contacts?'))return Response.json([]);
  if(url.includes('/rest/v1/nl_booking_email_aliases')){
    if(method==='POST'){
      aliasInserts++;stored=JSON.parse(opts.body);
      assert.equal(stored.event_type_id,7982460);
      assert.equal(stored.customer_email,customer);
      assert.match(stored.alias_email,/^info\+[a-f0-9]{32}@localboost-zs\.ch$/);
      assert.equal(opts.headers.apikey,'sb_secret_lab_mock');
      return new Response(null,{status:201});
    }
    if(method==='PATCH'){
      aliasUpdates++;assert.equal(JSON.parse(opts.body).booking_uid,bookingUid);
      return new Response(null,{status:204});
    }
    if(method==='GET'){
      assert.ok(stored,'no alias mapping before booking');
      return Response.json([{alias_email:stored.alias_email,customer_email:stored.customer_email}]);
    }
  }
  if(url.includes('/v2/slots?')){
    assert.ok(url.includes('eventTypeId=7982460'),'private Cal.com production type MUST never be requested');
    return Response.json({data:{'2099-01-01':[{start}]}});
  }
  if(url==='https://api.cal.com/v2/bookings'&&method==='POST'){
    calPosts++;
    const data=JSON.parse(opts.body);
    assert.equal(data.eventTypeId,7982460,'only the hidden Cal LAB event can be booked');
    assert.equal(data.attendee.email,stored.alias_email);
    return Response.json({data:{uid:bookingUid,status:'accepted',start,end}});
  }
  if(url.includes('/v2/bookings?')){
    assert.equal(method,'GET');
    if(url.includes('status=past'))return Response.json({data:[]});
    return Response.json({data:calPosts>0?[{
      uid:bookingUid,status:'accepted',eventTypeId:7982460,start,end,
      attendees:[{name:'LAB Interner Kundenname',email:stored.alias_email,phoneNumber:'+41790000000'}]
    }]:[]});
  }
  throw Error('Unexpected external request '+method+' '+url);
};
const base='https://stage.example.invalid';
async function call(path,{token=true,method='GET',body=null,origin='https://localboostzs.github.io'}={}){
  const headers={Origin:origin,'CF-Connecting-IP':'203.0.113.30'};
  if(token)headers.Authorization='Bearer lab-staff-mocked-jwt';
  if(body)headers['Content-Type']='application/json';
  const req=new Request(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  const res=await app.fetch(req,env);
  return {status:res.status,data:await res.json()};
}
let r=await call('/api/admin/services',{token:false});
assert.equal(r.status,401,'anonymous staff access must be forbidden');
staffActive=false;r=await call('/api/admin/services');assert.equal(r.status,403);
staffActive=true;r=await call('/api/admin/services');
assert.equal(r.status,200);
assert.equal(r.data.services.length,1,'LAB staff sees only one test service');
assert.equal(r.data.services[0].key,'haarschnitt');
assert.equal(r.data.services[0].minutes,15);
assert.equal(r.data.services[0].price,0);
assert.ok(!JSON.stringify(r.data).includes('gentleman-rasur'));
r=await call('/api/admin/slots?service=gentleman-rasur&start=2099-01-01&end=2099-01-01');
assert.equal(r.status,400,'production-only internal slots unavailable in LAB');
r=await call('/api/admin/slots?service=haarschnitt&start=2099-01-01&end=2099-01-01');
assert.equal(r.status,200);
const baseBooking={service:'haarschnitt',name:'LAB Interner Kundenname',email:customer,
  phone:'+41790000000',start,accepted:true,elapsedMs:6500};
r=await call('/api/admin/book',{method:'POST',body:{...baseBooking,service:'gentleman-rasur'}});
assert.equal(r.status,403,'do not book real internal event from LAB');
r=await call('/api/admin/book',{method:'POST',body:{...baseBooking,email:'external-test@example.invalid'}});
assert.equal(r.status,403,'only internal test emails allowed');
assert.equal(aliasInserts,0);assert.equal(calPosts,0,'forbidden requests must not reach Cal.com');
r=await call('/api/admin/book',{method:'POST',body:baseBooking,token:false});
assert.equal(r.status,401,'staff booking requires login');
r=await call('/api/admin/book',{method:'POST',body:baseBooking,origin:'https://malicious.example'});
assert.equal(r.status,403,'untrusted origin blocked');
r=await call('/api/admin/book',{method:'POST',body:baseBooking});
assert.equal(r.status,201,JSON.stringify(r.data));
assert.equal(r.data.booking.uid,bookingUid);
assert.equal(aliasInserts,1);assert.equal(aliasUpdates,1);assert.equal(calPosts,1);
r=await call('/api/admin/contacts');
assert.equal(r.status,200);
assert.equal(r.data.contacts.length,1,'LAB booking appears in staff CRM');
assert.equal(r.data.contacts[0].email,customer,'alias resolved to original customer address');
assert.equal(r.data.contacts[0].upcoming.length,1);
assert.equal(r.data.contacts[0].upcoming[0].uid,bookingUid);
assert.ok(!JSON.stringify(r.data).includes(stored.alias_email),'opaque alias not exposed to staff UI');
console.log('PASS: staff auth + single hidden LAB service + private slots + safe staff booking + CRM alias mapping + isolation; no external writes');

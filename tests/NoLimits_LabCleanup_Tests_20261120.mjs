// Strict QA-only alias cleanup: full synthetic staff/Cal/Supabase mocks.
// Never touches real bookings or customer emails.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const stageServices=fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const script=fs.readFileSync('worker/src/index.js','utf8').replace(
 "import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",stageServices);
const app=(await import('data:text/javascript;base64,'+Buffer.from(script).toString('base64'))).default;
const uid='LabCleanupBooking12345';
let staffAllowed=true,bookingStatus='cancelled',eventId=7982460,deleteAllowed=true,deletes=0;
const env={
 NL_ALIAS_STAGING_ONLY:'true',
 NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
 NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_lab_mock',
 NL_SUPABASE_SECRET_KEY:'sb_secret_lab_mock',
 CAL_API_KEY:'cal_mock',
 ALLOWED_ORIGINS:'https://localboostzs.github.io'
};
globalThis.fetch=async(url,opts={})=>{
 const dest=String(url);
 if(dest.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
 if(dest.includes('/rest/v1/nl_staff?'))return Response.json(staffAllowed?[{role:'staff',active:true}]:[]);
 if(dest=== 'https://api.cal.com/v2/bookings/'+uid)
   return Response.json({data:{uid,eventTypeId:eventId,status:bookingStatus,start:new Date(Date.now()+86400000).toISOString()}});
 if(dest.includes('/rest/v1/nl_booking_email_aliases?')){
   assert.equal(opts.method,'DELETE');
   const p=new URL(dest).searchParams;
   assert.equal(p.get('booking_uid'),'eq.'+uid);
   assert.equal(p.get('event_type_id'),'eq.7982460');
   assert.equal(opts.headers.apikey,'sb_secret_lab_mock');
   deletes++;
   return new Response(null,{status:deleteAllowed?204:503});
 }
 throw Error('Unexpected network access: '+dest);
};
async function call({token=true,requestUid=uid,origin='https://localboostzs.github.io'}={}){
 const h={Origin:origin,'Content-Type':'application/json'};
 if(token)h.Authorization='Bearer mocked-staff-token';
 const r=await app.fetch(new Request('https://lab.example.invalid/api/lab/cleanup',{
   method:'POST',headers:h,body:JSON.stringify({uid:requestUid})
 }),env);
 return {status:r.status,body:await r.json()};
}
let r=await call({token:false});
assert.equal(r.status,401);assert.equal(deletes,0);
staffAllowed=false;r=await call();assert.equal(r.status,403);assert.equal(deletes,0);
staffAllowed=true;r=await call({origin:'https://malicious.invalid'});assert.equal(r.status,403);
r=await call({requestUid:'not_a_uid'});assert.equal(r.status,400);
bookingStatus='accepted';r=await call();assert.equal(r.status,409);assert.equal(deletes,0,
 'never delete mapping for active Cal booking');
bookingStatus='cancelled';eventId=9999999;r=await call();assert.equal(r.status,403);
assert.equal(deletes,0,'never delete mapping for foreign Cal event');
eventId=7982460;deleteAllowed=false;r=await call();assert.equal(r.status,503);
assert.equal(deletes,1,'failed deletion does not return success');
deleteAllowed=true;r=await call();assert.equal(r.status,200);
assert.equal(r.body.cleaned,true);assert.equal(deletes,2);
env.NL_ALIAS_STAGING_ONLY='false';r=await call();assert.equal(r.status,404);
assert.equal(deletes,2,'production must not support LAB cleanup');
console.log('PASS: staff-auth LAB cleanup denies anonymous, foreign event, active booking, wrong origin, bad UID and production; only cancelled LAB alias may be removed');

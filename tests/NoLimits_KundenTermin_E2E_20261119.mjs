// Real Worker route integration with mocked Cal.com, Supabase and Resend.
// No network requests, bookings or real customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const stageServices = fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const source=fs.readFileSync('worker/src/index.js','utf8')
  .replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",stageServices);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const base='https://stage.example.workers.dev';
const env={
  ALLOWED_ORIGINS:'https://localboostzs.github.io',
  NL_ALIAS_STAGING_ONLY:'true',
  NL_ALIAS_MODE:'enabled',
  NL_ALIAS_DOMAIN:'localboost-zs.ch',
  NL_ALIAS_PREFIX:'info',
  NL_ALIAS_SEPARATOR:'+',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_SECRET_KEY:'sb_secret_mock',
  CAL_API_KEY:'cal_mock',
  CAL_WEBHOOK_SECRET:'hook_mock_secret_long'.repeat(3),
  NL_MANAGE_SECRET:'management_mock_secret_long'.repeat(3),
  NL_EMAIL_ENABLED:'true',
  RESEND_API_KEY:'re_mock'
};
const original='info+nl-staging-route-test@localboost-zs.ch';
const future=new Date(Date.now()+12*86400000).toISOString();
const slot=new Date(Date.now()+13*86400000).toISOString();
const duration=15*60000;
let calBooking=null,uidNumber=0;
const mappings=new Map(), sent=[];
let rejectedCalAttempts=0;
let mappingWrittenBeforeCal=false;
const calRoot='https://api.cal.com/v2/';
function buildBooking(uid,start,email,status='accepted'){
  return {uid,eventTypeId:7982460,status,start,end:new Date(Date.parse(start)+duration).toISOString(),
    attendees:[{email,name:'NoLimits Interner Test',phoneNumber:'+41790000000'}]};
}
const uid=()=>('InternalTestBooking_'+(++uidNumber)).replace(/[^A-Za-z0-9_-]/g,'');
globalThis.fetch=async (value,init={})=>{
  const url=String(value),u=new URL(url),m=init.method||'GET';
  if(u.pathname.includes('/rest/v1/nl_booking_email_aliases')) {
    assert.equal(init.headers?.apikey,'sb_secret_mock');
    if(m==='POST'){
      const row=JSON.parse(init.body);
      assert.match(row.alias_email,/^info\+[0-9a-f]{32}@localboost-zs\.ch$/);
      assert.equal(row.customer_email,original);
      assert.equal(row.event_type_id,7982460);
      mappings.set(row.alias_email,row);
      return new Response(null,{status:201});
    }
    if(m==='PATCH'){
      const addr=decodeURIComponent(u.searchParams.get('alias_email').slice(3));
      assert.ok(mappings.has(addr));
      mappings.get(addr).booking_uid=JSON.parse(init.body).booking_uid;
      return new Response(null,{status:204});
    }
    const values=u.searchParams.get('alias_email');
    const matches=[...(values||'').matchAll(/"([^"]+)"/g)].map(p=>p[1]);
    return Response.json(matches.map(a=>mappings.get(a)).filter(Boolean));
  }
  if(url===calRoot+'bookings' && m==='POST') {
    const data=JSON.parse(init.body);
    mappingWrittenBeforeCal=mappings.has(data.attendee.email);
    assert.ok(mappingWrittenBeforeCal);
    assert.equal(data.eventTypeId,7982460);
    assert.equal(data.attendee.email.startsWith('info+'),true);
    calBooking=buildBooking(uid(),data.start,data.attendee.email);
    return Response.json({data:calBooking});
  }
  if(u.pathname.endsWith('/v2/bookings/'+calBooking?.uid) && m==='GET'){
    return Response.json({data:calBooking});
  }
  if(u.pathname.endsWith('/v2/slots') && m==='GET') {
    return Response.json({data:{[slot.slice(0,10)]:[{start:slot}]}});
  }
  if(u.pathname.endsWith('/v2/bookings/'+calBooking?.uid+'/reschedule') && m==='POST'){
    assert.equal(calBooking.status,'accepted');
    const old=calBooking;
    const next=JSON.parse(init.body).start;
    calBooking=buildBooking(uid(),next,old.attendees[0].email);
    return Response.json({data:calBooking});
  }
  if(u.pathname.endsWith('/v2/bookings/'+calBooking?.uid+'/cancel') && m==='POST'){
    calBooking={...calBooking,status:'cancelled'};
    return Response.json({data:calBooking});
  }
  if(url==='https://api.resend.com/emails'&&m==='POST'){
    sent.push({mail:JSON.parse(init.body),key:init.headers['Idempotency-Key']});
    return Response.json({id:'synthetic_email_'+sent.length});
  }
  rejectedCalAttempts++;
  throw Error('Unexpected mock network request '+m+' '+url);
};
async function call(path,method='GET',data=null,headers={}){
  const opts={method,headers: method==='POST'?{'Content-Type':'application/json',...headers}:headers};
  if(data!==null) opts.body=JSON.stringify(data);
  const response=await worker.fetch(new Request(base+path,opts),env);
  return {status:response.status,body:await response.json()};
}
function managementParams(url){
  const x=new URL(url);
  return {uid:x.searchParams.get('uid'),token:x.searchParams.get('token')};
}
function signedWebhook(typ,payload,wrong=false){
  const body=JSON.stringify({triggerEvent:typ,payload});
  const sig=wrong?'0'.repeat(64):crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(body).digest('hex');
  return worker.fetch(new Request(base+'/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':sig},body}),env);
}
const attempted=await call('/api/book','POST',{
  service:'haarschnitt',name:'NoLimits Interner Test',email:'unrelated@example.invalid',phone:'+41790000000',
  start:future,accepted:true,elapsedMs:9000});
assert.equal(attempted.status,403);
assert.equal(calBooking,null);
let res=await call('/api/book','POST',{service:'haarschnitt',name:'NoLimits Interner Test',email:original,
  phone:'+41790000000',start:future,accepted:true,elapsedMs:9000});
assert.equal(res.status,201,JSON.stringify(res.body));
assert.ok(mappingWrittenBeforeCal);
assert.equal(mappings.size,1);
assert.ok(res.body.booking.manageUrl);
const first=managementParams(res.body.booking.manageUrl);
assert.equal(first.uid,calBooking.uid);
const alias=calBooking.attendees[0].email;
assert.equal(mappings.get(alias).booking_uid,first.uid);
assert.equal(mappings.get(alias).customer_email,original);
res=await call('/api/manage?uid='+first.uid+'&token='+first.token);
assert.equal(res.status,200);
assert.equal(res.body.booking.serviceKey,'haarschnitt');
assert.equal(res.body.booking.canManage,true);
assert.ok(!JSON.stringify(res.body).includes(original));
assert.equal((await call('/api/manage?uid='+first.uid+'&token=bad')).status,403);
assert.equal((await call('/api/manage/cancel','POST',{...first,confirm:false})).status,400);
assert.equal(calBooking.status,'accepted');
res=await call('/api/manage/slots?uid='+first.uid+'&token='+first.token+
  '&service=wrong&start='+slot.slice(0,10)+'&end='+slot.slice(0,10));
assert.equal(res.status,400);
res=await call('/api/manage/slots?uid='+first.uid+'&token='+first.token+
  '&service=haarschnitt&start='+slot.slice(0,10)+'&end='+slot.slice(0,10));
assert.equal(res.status,200);
assert.deepEqual(res.body.days[slot.slice(0,10)],[slot]);
res=await call('/api/manage/reschedule','POST',{...first,confirm:true,start:future});
assert.equal(res.status,409,'unavailable slot must not be booked');
res=await call('/api/manage/reschedule','POST',{...first,confirm:true,start:slot});
assert.equal(res.status,200,JSON.stringify(res.body));
const moved=managementParams(res.body.booking.manageUrl);
assert.notEqual(first.uid,moved.uid,'Cal.com issues a new UID on reschedule');
assert.equal(calBooking.attendees[0].email,alias,'no alias replacement during reschedule');
assert.equal((await call('/api/manage?uid='+moved.uid+'&token='+moved.token)).status,200);
assert.equal((await call('/api/manage?uid='+moved.uid+'&token='+first.token)).status,403);
const invalid=await signedWebhook('BOOKING_RESCHEDULED',{uid:moved.uid,eventTypeId:7982460,startTime:slot,attendees:[{email:alias}]},true);
assert.equal(invalid.status,401);
assert.equal(sent.length,0);
res=await signedWebhook('BOOKING_RESCHEDULED',{uid:moved.uid,eventTypeId:7982460,startTime:slot,attendees:[{email:alias}]});
assert.equal(res.status,200);
assert.equal(sent.length,1);
assert.deepEqual(sent[0].mail.to,[original]);
assert.equal(sent[0].mail.from,'NoLimits Barbershop <noreply@nolimits-barber.ch>');
env.NL_ALIAS_MODE='disabled';
res=await call('/api/manage/cancel','POST',{...moved,confirm:true,reason:'synthetischer Routen-Endtest'});
assert.equal(res.status,200);
assert.equal(calBooking.status,'cancelled');
assert.equal((await call('/api/manage?uid='+moved.uid+'&token='+moved.token)).status,200);
assert.equal((await call('/api/manage/cancel','POST',{...moved,confirm:true})).status,409);
const result=await signedWebhook('BOOKING_CANCELLED',{uid:moved.uid,eventTypeId:7982460,startTime:slot,attendees:[{email:alias}]});
assert.equal(result.status,200);
assert.equal(sent.length,2);
assert.deepEqual(sent[1].mail.to,[original]);
assert.notEqual(sent[0].key,sent[1].key);
assert.equal(rejectedCalAttempts,0);
console.log('PASS: stage customer flow /api/book -> signed manage -> slots -> reschedule -> signed webhook -> rollback cancel -> signed email, auth and invalid input guardrails');

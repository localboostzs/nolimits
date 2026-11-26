// Offline regression of NoLimits meeting decisions. Never contacts live systems.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const services=fs.readFileSync('worker/src/services.js','utf8').replace(/^export /gm,'');
const source=fs.readFileSync('worker/src/index.js','utf8')
  .replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",services);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={
  CAL_API_KEY:'cal_mock',NL_MANAGE_SECRET:'mock-management-secret-long'.repeat(3),
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',ALLOWED_ORIGINS:'https://localboostzs.github.io'
};
let saved=new Map(),seq=0,calCancellations=0, calBookings=0,blockedDate='';
const asDay=(iso)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const ts=new Date(Date.now()+8*86400000);
const first=new Date(Date.UTC(ts.getUTCFullYear(),ts.getUTCMonth(),ts.getUTCDate(),13,0)).toISOString();
globalThis.fetch=async (input,opts={})=>{
  const url=String(input),u=new URL(url),method=opts.method||'GET';
  if(u.pathname==='/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(u.pathname==='/rest/v1/nl_staff')return Response.json([{role:'staff',active:true}]);
  if(u.pathname==='/v2/slots'){
    const d=u.searchParams.get('start');
    if(d===blockedDate)return Response.json({data:{}});
    const y=Number(d.slice(0,4)),m=Number(d.slice(5,7))-1,day=Number(d.slice(8,10));
    const candidate=new Date(Date.UTC(y,m,day,13,0)).toISOString();
    return Response.json({data:{[d]:[{start:candidate}]}});
  }
  if(u.pathname==='/v2/bookings'&&method==='POST'){
    calBookings++;
    const b=JSON.parse(opts.body), uid='seriesMockBookingUID_'+(++seq);
    const obj={uid,eventTypeId:b.eventTypeId,start:b.start,end:new Date(Date.parse(b.start)+30*60000).toISOString(),
      status:'accepted',attendees:[{name:b.attendee.name,email:b.attendee.email,phoneNumber:b.attendee.phoneNumber}]};
    saved.set(uid,obj);return Response.json({data:obj});
  }
  if(u.pathname.startsWith('/v2/bookings/')){
    const uid=u.pathname.split('/')[3], b=saved.get(uid);
    if(!b)return Response.json({}, {status:404});
    if(u.pathname.endsWith('/cancel')){calCancellations++; b.status='cancelled';return Response.json({data:b});}
    return Response.json({data:b});
  }
  throw Error('Unexpected URL '+url);
};
async function call(path,body,auth=false){
 const r=await worker.fetch(new Request('https://nolimits-booking-test.broken-haze-6cad.workers.dev'+path,
   {method:body?'POST':'GET',headers:auth?{'Authorization':'Bearer validated_token','Content-Type':'application/json'}:{'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})}),env);
 return {status:r.status,body:await r.json()};
}
const servicesOut=await call('/api/services');
assert.equal(servicesOut.status,200);
assert.equal(servicesOut.body.services.length,10);
assert.deepEqual(servicesOut.body.services.find(x=>x.key==='gentleman-rasur'),{
 key:'gentleman-rasur',name:'Gentleman Rasur',minutes:30,price:30+(Date.now()>=Date.parse('2027-01-01T00:00:00+01:00')?5:0),
 ...((Date.now()>=Date.parse('2027-01-01T00:00:00+01:00')?5:0)?{}:{priceChange:{from:'2027-01-01',price:35}})
});
const near={service:'haarschnitt',name:'Test Person',email:'test@example.test',phone:'+41790000000',
 start:new Date(Date.now()+30*60000).toISOString(),accepted:true,elapsedMs:5000};
let r=await call('/api/book',near);
assert.equal(r.status,409);
assert.equal(calBookings,0);
const series={...near,start:first,count:4};
r=await call('/api/admin/book-series',series);
assert.equal(r.status,401,'staff auth required');
assert.equal(calBookings,0);
r=await call('/api/admin/book-series',series,true);
assert.equal(r.status,201,JSON.stringify(r.body));
assert.equal(r.body.count,4);
assert.equal(calBookings,4);
assert.equal(r.body.starts.length,4);
assert.ok(r.body.starts.every(x=>asDay(x)));
const before=calBookings;blockedDate=asDay(new Date(Date.parse(first)+14*86400000));
r=await call('/api/admin/book-series',series,true);
assert.equal(r.status,409,JSON.stringify(r.body));
assert.equal(calBookings,before,'preflight prevents partial booking on known conflict');
blockedDate='';
const confirmed={...near,start:first};
r=await call('/api/book',confirmed);
assert.equal(r.status,201,JSON.stringify(r.body));
const url=new URL(r.body.booking.manageUrl),uid=url.searchParams.get('uid'),token=url.searchParams.get('token');
const current=saved.get(uid);assert.ok(current);
current.start=new Date(Date.now()+23*3600000).toISOString();
r=await call('/api/manage?uid='+encodeURIComponent(uid)+'&token='+encodeURIComponent(token));
assert.equal(r.status,200);
assert.equal(r.body.booking.canCancel,false);
assert.equal(r.body.booking.canReschedule,false,'customers cannot reschedule within 24h');
r=await call('/api/manage/cancel',{uid,token,confirm:true});
assert.equal(r.status,409);
assert.equal(calCancellations,0);
current.start=new Date(Date.now()+25*3600000).toISOString();
r=await call('/api/manage/cancel',{uid,token,confirm:true});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(calCancellations,1);
console.log('PASS: 10 public services; 60-min cutoff; staff-only 4-week series; preflight conflict; 24h cancellation and reschedule server guard');

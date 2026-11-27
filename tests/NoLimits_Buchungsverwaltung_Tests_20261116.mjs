
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const readText=(p)=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const code=(()=>{const services=readText('worker/src/services.js').replace(/^export /gm,'');return readText('worker/src/index.js').replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",services);})();
const {default:app}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const serviceId=7888954, uid='testBookingUIDqyz1234';
let state='accepted';let deliveries=[];let cancels=0,reschedules=0;
const when=new Date(Date.now()+10*86400000).toISOString(), end=new Date(Date.parse(when)+60*60000).toISOString();
let booking={uid,eventTypeId:serviceId,start:when,end,status:state,attendees:[{name:'A',email:'qa@example.test'}]};
let slot=new Date(Date.parse(when)+86400000).toISOString();
globalThis.fetch=async(url,opts={})=>{
 url=String(url);
 if(url.endsWith('/v2/bookings/'+uid))return Response.json({status:'success',data:{...booking,status:state}});
 if(url.endsWith('/v2/bookings/'+uid+'/cancel')){cancels++;state='cancelled';return Response.json({status:'success',data:{...booking,status:'cancelled'}});}
 if(url.endsWith('/v2/bookings/'+uid+'/reschedule')){reschedules++;return Response.json({status:'success',data:{...booking,uid:'newUIDqyz999',start:slot,status:'accepted'}});}
 if(url.includes('/v2/slots?'))return Response.json({data:{[slot.slice(0,10)]:[{start:slot}]}});
 if(url.endsWith('/v2/bookings') && opts.method==='POST')return Response.json({status:'success',data:booking});
 if(url==='https://api.resend.com/emails'){deliveries.push(JSON.parse(opts.body));return Response.json({id:'m_123'});}
 throw Error('Unexpected URL '+url);
};
const env={CAL_API_KEY:'cal_mock',NL_MANAGE_SECRET:'test-secret-A'.repeat(7),CAL_WEBHOOK_SECRET:'cal-hook-secret-B'.repeat(5),
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const base='https://nolimits-booking-test.broken-haze-6cad.workers.dev';
async function doReq(path,opts){return await app.fetch(new Request(base+path,opts),env)}
let init=await doReq('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
 service:'haarschnitt-bartschnitt-rasieren',name:'Tester User',email:'qa@example.test',phone:'+41790000000',start:when,accepted:true,elapsedMs:5000
})});
assert.equal(init.status,201);const result=await init.json();
assert.ok(result.booking.manageUrl,'book response has secure manage link');
const u=new URL(result.booking.manageUrl);const uidQ=u.searchParams.get('uid'),tokQ=u.searchParams.get('token');
const get=await doReq('/api/manage?uid='+uidQ+'&token='+tokQ);assert.equal(get.status,200);
const detail=(await get.json()).booking;assert.equal(detail.price,70+(Date.parse(detail.start||new Date())>=Date.parse('2027-01-01T00:00:00+01:00')?5:0));assert.equal(detail.serviceKey,'haarschnitt-bartschnitt-rasieren');
assert.equal(detail.canManage,true);
// Change the first signature character: the last one carries unused bits and may stay valid.
const sig=tokQ.indexOf('.')+1,forged=tokQ.slice(0,sig)+(tokQ[sig]==='A'?'B':'A')+tokQ.slice(sig+1);
const tampered=await doReq('/api/manage?uid='+uidQ+'&token='+forged);assert.equal(tampered.status,403);
const noConfirm=await doReq('/api/manage/cancel',{method:'POST',body:JSON.stringify({uid:uidQ,token:tokQ})});
assert.equal(noConfirm.status,400);assert.equal(cancels,0);
const badReschedule=await doReq('/api/manage/reschedule',{method:'POST',body:JSON.stringify({uid:uidQ,token:tokQ,confirm:true,start:new Date(Date.now()+20*86400000).toISOString()})});
assert.equal(badReschedule.status,409);assert.equal(reschedules,0);
const slotDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(slot));
const out=await doReq('/api/manage/reschedule',{method:'POST',body:JSON.stringify({uid:uidQ,token:tokQ,confirm:true,start:slot})});
assert.equal(out.status,200);assert.equal(reschedules,1);
const cancel=await doReq('/api/manage/cancel',{method:'POST',body:JSON.stringify({uid:uidQ,token:tokQ,confirm:true,reason:'Test'})});
assert.equal(cancel.status,200);assert.equal(cancels,1);
const again=await doReq('/api/manage/cancel',{method:'POST',body:JSON.stringify({uid:uidQ,token:tokQ,confirm:true})});
assert.equal(again.status,409);assert.equal(cancels,1);
const webhook={triggerEvent:'BOOKING_CREATED',payload:{uid,type:'nolimits-haarschnitt-bartschnitt-rasieren',startTime:when,attendees:[{name:'A',email:'qa@example.test'}]}};
const payload=JSON.stringify(webhook);
const signature=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(payload).digest('hex');
const fakeSig=await doReq('/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':'sha256='+'0'.repeat(64)},body:payload});
assert.equal(fakeSig.status,401);
env.NL_EMAIL_ENABLED='true';env.RESEND_API_KEY='re_test_mock';state='accepted';
const ok=await doReq('/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':'sha256='+signature},body:payload});
assert.equal(ok.status,200);assert.equal(deliveries.length,1);
assert.ok(deliveries[0].html.includes('NOLIMITS'));assert.ok(deliveries[0].html.includes('Termin verwalten'));
assert.ok(!deliveries[0].html.includes('<script'));
delete env.CAL_API_KEY;
const noKey=await doReq('/api/manage?uid='+uidQ+'&token='+tokQ);assert.equal(noKey.status,503);
console.log('PASS 14 paths: book/manage link, valid/tampered token, details, cancel confirmation, real cancel once, reschedule free-slot check, webhook signature, custom email, missing API-key graceful');

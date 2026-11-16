
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(process.argv[2] || 'worker/dist/worker.js')).toString('base64'));
const now=new Date(Date.now()+86400000*5).toISOString();
const uid='TestCancelledBooking_1';
let lookups=0, sends=0, lastEmail=null;
globalThis.fetch=async(url,opts={})=>{
  url=String(url);
  if(url.includes('/v2/bookings/')){lookups++;return Response.json({status:'success',data:{uid,eventTypeId:7888954,status:'cancelled',start:now,end:now}});}
  if(url.includes('api.resend.com')){sends++;lastEmail=JSON.parse(opts.body);return Response.json({id:'mock123'});}
  throw new Error('Unexpected '+url);
};
const env={CAL_API_KEY:'cal_mock',NL_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_mock',NL_MANAGE_SECRET:'HmacManageSecretMock'.repeat(5),CAL_WEBHOOK_SECRET:'WebhookSecretMock'.repeat(6),RL_SLOTS:null,RL_BOOK:null};
const payload=JSON.stringify({triggerEvent:'BOOKING_CANCELLED',payload:{uid,startTime:now,attendees:[{email:'test@example.com',name:'QA Test'}]}});
const signature=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(payload).digest('hex');
const request=new Request('https://nolimits-booking-test.broken-haze-6cad.workers.dev/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':signature,'Content-Type':'application/json'},body:payload});
const result=await worker.fetch(request,env);const j=await result.json();
assert.equal(result.status,200);assert.equal(j.sent,true);
assert.equal(sends,1);assert.equal(lookups,1);
assert.ok(lastEmail.subject.includes('storniert'));
assert.ok(lastEmail.html.includes('Haarschnitt mit Bartschnitt und Rasieren'));
assert.ok(!lastEmail.html.includes('Termin verwalten</a>'));
const denied=await worker.fetch(new Request('https://nolimits-booking-test.broken-haze-6cad.workers.dev/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':'00'},body:payload}),env);
assert.equal(denied.status,401);
console.log('PASS webhook CANCELLED without service type -> verified Cal UID -> branded Resend cancellation; invalid signature denied');

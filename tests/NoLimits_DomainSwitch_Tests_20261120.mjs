// NoLimits site-domain switch safety test (mock Cal.com/Supabase/Resend only).
// Preserve all old GitHub Pages deep links until the explicitly approved cutover.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const services=fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const code=fs.readFileSync('worker/src/index.js','utf8').replace(
  "import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",services);
const app=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const future=new Date(Date.now()+7*86400000).toISOString();
let alias='',uid='',sent=[];
const ownerEmail='info+domain-cutover-test@localboost-zs.ch';
const env={
  NL_ALIAS_MODE:'enabled',NL_ALIAS_STAGING_ONLY:'true',
  NL_ALIAS_DOMAIN:'localboost-zs.ch',NL_ALIAS_PREFIX:'info',NL_ALIAS_SEPARATOR:'+',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_SECRET_KEY:'sb_secret_mock',
  CAL_API_KEY:'cal_mock',CAL_WEBHOOK_SECRET:'mock_secret_long'.repeat(5),
  NL_MANAGE_SECRET:'signed_test_secret_long'.repeat(4),
  NL_EMAIL_ENABLED:'true',RESEND_API_KEY:'resend_mock',NL_ICS_ENABLED:'false'
};
globalThis.fetch=async(url,init={})=>{
 const u=String(url);
 if(u.includes('/rest/v1/nl_booking_email_aliases')){
   if(init.method==='POST'){alias=JSON.parse(init.body).alias_email;return new Response(null,{status:201});}
   if(init.method==='PATCH')return new Response(null,{status:204});
   return Response.json([{alias_email:alias,customer_email:ownerEmail}]);
 }
 if(u==='https://api.cal.com/v2/bookings'&&init.method==='POST'){
   return Response.json({data:{uid,status:'accepted',start:future,end:new Date(Date.parse(future)+900000).toISOString()}});
 }
 if(u==='https://api.resend.com/emails'){const mail=JSON.parse(init.body);sent.push(mail);return Response.json({id:'qa-mock'});}
 throw Error('Unexpected network '+u);
};
async function run(label,site,expected,index){
 env.NL_PUBLIC_SITE_BASE=site;
 uid='DomainCutoverTestUID000'+index;
 sent=[];
 const response=await app.fetch(new Request('https://lab.example.test/api/book',{
   method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.'+(index+20)},
   body:JSON.stringify({service:'haarschnitt',name:'Domain Testkunde',email:ownerEmail,
     phone:'+41790000000',accepted:true,start:future,elapsedMs:6000})
 }),env);
 assert.equal(response.status,201,await response.text());
 const data=await response.json();
 const url=new URL(data.booking.manageUrl);
 assert.equal(url.origin+url.pathname,expected+'/termin-verwalten/');
 assert.equal(url.searchParams.get('uid'),uid);
 assert.ok(url.searchParams.get('token')?.length>40);
 const payload=JSON.stringify({triggerEvent:'BOOKING_CREATED',payload:{
   uid,eventTypeId:7982460,startTime:future,attendees:[{name:'Domain Testkunde',email:alias}]
 }});
 const hmac=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(payload).digest('hex');
 const reply=await app.fetch(new Request('https://lab.example.test/api/webhooks/cal',{
   method:'POST',headers:{'X-Cal-Signature-256':hmac},body:payload
 }),env);
 assert.equal(reply.status,200,await reply.text());
 assert.equal(sent.length,1);
 const mail=sent[0];
 assert.deepEqual(mail.to,[ownerEmail]);
 assert.ok(mail.html.includes(expected+'/assets/img/logo-nolimits.jpg'));
 assert.ok(mail.html.includes(expected+'/impressum/'));
 assert.ok(mail.html.includes(expected+'/termin-verwalten/?uid='));
 assert.ok(!mail.html.includes('https://malicious.example'));
 assert.equal(mail.attachments,undefined,'No auto calendar attachments after failed Google import acceptance');
 console.log('PASS',label,expected);
}
await run('default GitHub Pages',undefined,'https://localboostzs.github.io/nolimits',1);
await run('approved domain', 'https://nolimits-barber.ch','https://nolimits-barber.ch',2);
await run('approved www domain with slash','https://www.nolimits-barber.ch/','https://www.nolimits-barber.ch',3);
await run('attacker domain falls back safely','https://malicious.example','https://localboostzs.github.io/nolimits',4);
await run('subdomain spoof attempt falls back','https://nolimits-barber.ch.malicious.example','https://localboostzs.github.io/nolimits',5);
await run('URL with injected path falls back','https://nolimits-barber.ch/evil','https://localboostzs.github.io/nolimits',6);
console.log('PASS: booking deep links, signed mail CTAs and footer switch only to approved NoLimits hostnames');

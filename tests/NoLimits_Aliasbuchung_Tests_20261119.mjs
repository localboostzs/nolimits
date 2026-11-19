// Smoke / regression tests for worker alias logic with mocked Cal.com/Supabase/Resend.
// Run: node tests/NoLimits_Aliasbuchung_Tests_20261119.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
const services=fs.readFileSync('worker/src/services.js','utf8').replace(/^export /gm,'');
const workerSource=fs.readFileSync('worker/src/index.js','utf8')
  .replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';", services);
const {default:app}=await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'));
const future=new Date(Date.now()+9*86400000).toISOString();
const aliasTable=new Map();
const requests=[];const sent=[];
let uid='AliasSmokeBooking12345';
globalThis.fetch=async(url,options={})=>{
  url=String(url);requests.push({url,method:options.method||'GET'});
  if(url.includes('/rest/v1/nl_booking_email_aliases')) {
    if(options.method==='POST') {
      const row=JSON.parse(options.body);assert.match(row.alias_email,/^buchung-[0-9a-f]{32}@nolimits-barber\.ch$/);
      aliasTable.set(row.alias_email,row);
      return new Response(null,{status:201});
    }
    if(options.method==='PATCH'){
      const key=decodeURIComponent(url.match(/alias_email=eq\.([^&]+)/)[1]);const row=aliasTable.get(key);
      row.booking_uid=JSON.parse(options.body).booking_uid;
      return new Response(null,{status:204});
    }
    const q=new URL(url).searchParams.get('alias_email');
    const aliases=(q.match(/"[^"]+"/g)||[]).map(v=>v.slice(1,-1));
    return Response.json(aliases.map(a=>aliasTable.get(a)).filter(Boolean));
  }
  if(url.endsWith('/v2/bookings')&&options.method==='POST'){
    const p=JSON.parse(options.body);
    assert.match(p.attendee.email,/^buchung-[0-9a-f]{32}@nolimits-barber\.ch$/);
    return Response.json({data:{uid,status:'accepted',start:future,end:future}});
  }
  if(url==='https://api.resend.com/emails'){sent.push(JSON.parse(options.body));return Response.json({id:'email_test'});}
  if(url.endsWith('/v2/bookings/'+uid))return Response.json({data:{uid,eventTypeId:7888953,status:'accepted',start:future,end:future,attendees:[{email:[...aliasTable.keys()][0]}]}});
  throw Error('Unexpected fetch '+url);
};
const base='https://stage.example.workers.dev';
const env={NL_ALIAS_MODE:'enabled',NL_ALIAS_DOMAIN:'nolimits-barber.ch',NL_ALIAS_PREFIX:'buchung',NL_ALIAS_SEPARATOR:'-',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',NL_SUPABASE_SECRET_KEY:'sb_secret_mockkey',
  CAL_API_KEY:'cal_mock',NL_MANAGE_SECRET:'manage_mock'.repeat(7),
  NL_EMAIL_ENABLED:'true',RESEND_API_KEY:'resend_mock',CAL_WEBHOOK_SECRET:'hook_mock'.repeat(8)
};
const book=await app.fetch(new Request(base+'/api/book',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({service:'haarschnitt',name:'Test Kunde',email:'real-customer@example.org',
    phone:'+41790000000',accepted:true,start:future,elapsedMs:5000})}),env);
assert.equal(book.status,201,await book.text());
assert.equal(aliasTable.size,1);
const alias=[...aliasTable.keys()][0];
assert.equal(aliasTable.get(alias).customer_email,'real-customer@example.org');
assert.equal(aliasTable.get(alias).booking_uid,uid);
for(const typ of ['BOOKING_CREATED','BOOKING_RESCHEDULED','BOOKING_CANCELLED']){
  const p=JSON.stringify({triggerEvent:typ,payload:{uid,eventTypeId:7888953,startTime:future,attendees:[{email:alias,name:'Test Kunde'}]}});
  const sig=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(p).digest('hex');
  const res=await app.fetch(new Request(base+'/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':sig},body:p}),env);
  assert.equal(res.status,200,await res.text());
}
assert.equal(sent.length,3);
for(const mail of sent){assert.deepEqual(mail.to,['real-customer@example.org']);assert.ok(mail.html.includes('NOLIMITS'));}
env.NL_ALIAS_MODE='off';
const p=JSON.stringify({triggerEvent:'BOOKING_CREATED',payload:{uid,eventTypeId:7888953,startTime:future,attendees:[{email:alias,name:'Test Kunde'}]}});
const sig=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(p).digest('hex');
const fallback=await app.fetch(new Request(base+'/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':sig},body:p}),env);
assert.equal(fallback.status,200);
assert.deepEqual(sent.at(-1).to,['real-customer@example.org']);
aliasTable.clear();
const missing=await app.fetch(new Request(base+'/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':sig},body:p}),env);
assert.equal(missing.status,503);
assert.equal(sent.length,4);
const invalid=await app.fetch(new Request(base+'/api/webhooks/cal',{method:'POST',headers:{'X-Cal-Signature-256':'bad'},body:p}),env);
assert.equal(invalid.status,401);
console.log('PASS: alias mapping before booking; uid binding; 3 branded webhook emails; rollback-safe mapping; fail closed on missing mapping; signed webhook required');

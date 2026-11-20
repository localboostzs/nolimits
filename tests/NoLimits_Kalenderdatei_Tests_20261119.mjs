// Calendar attachment contract: privacy, stable UID, cancellation and opt-in.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const services=fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const code=fs.readFileSync('worker/src/index.js','utf8').replace("import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';",services);
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const alias='info+'+'a'.repeat(32)+'@localboost-zs.ch',real='info+calendar-safety@localboost-zs.ch';
const uid='NoLimitsIcsTestUID000001',start=new Date(Date.now()+10*86400000).toISOString();
const newer=new Date(Date.now()+11*86400000).toISOString();
const env={NL_ALIAS_MODE:'enabled',NL_ALIAS_DOMAIN:'localboost-zs.ch',NL_ALIAS_PREFIX:'info',
 NL_ALIAS_SEPARATOR:'+',NL_ICS_ENABLED:'true',
 NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',NL_SUPABASE_SECRET_KEY:'sb_secret_mock',
 CAL_API_KEY:'cal_mock',CAL_WEBHOOK_SECRET:'cal_mock_secret_long'.repeat(3),
 NL_MANAGE_SECRET:'mgmt_mock'.repeat(7),NL_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_mock'};
const sent=[];
globalThis.fetch=async(url,opts={})=>{
 const x=String(url);
 if(x.includes('/rest/v1/nl_booking_email_aliases?'))return Response.json([{alias_email:alias,customer_email:real}]);
 if(x==='https://api.resend.com/emails'){sent.push(JSON.parse(opts.body));return Response.json({id:'test_email'});}
 throw Error('Unexpected URL '+x);
};
async function fire(typ,when){
 const payload={uid,eventTypeId:7982460,startTime:when,
    attendees:[{name:'Testperson',email:alias}]};
 const body=JSON.stringify({triggerEvent:typ,payload});
 const sig=crypto.createHmac('sha256',env.CAL_WEBHOOK_SECRET).update(body).digest('hex');
 const response=await worker.fetch(new Request('https://stage.example.workers.dev/api/webhooks/cal',{
   method:'POST',headers:{'X-Cal-Signature-256':sig},body}),env);
 assert.equal(response.status,200,await response.text());
 return sent.at(-1);
}
function decode(mail){
 const a=mail.attachments?.[0];
 assert.equal(a?.filename,'NoLimits_Termin.ics');
 assert.ok(a.content_type.startsWith('text/calendar'));
 return Buffer.from(a.content,'base64').toString('utf8');
}
const first=await fire('BOOKING_CREATED',start),rescheduled=await fire('BOOKING_RESCHEDULED',newer);
const cancelled=await fire('BOOKING_CANCELLED',newer);
assert.equal(sent.length,3);
const entries=[first,rescheduled,cancelled].map(decode);
assert.match(entries[0],/METHOD:PUBLISH\r\n/);
assert.match(entries[1],/SEQUENCE:1\r\n/);
assert.match(entries[2],/METHOD:CANCEL\r\n/);
assert.match(entries[2],/STATUS:CANCELLED\r\n/);
assert.match(entries[0],/UID:nolimits-a{32}@nolimits-barber\.ch\r\n/);
const ids=entries.map(x=>x.match(/^UID:(.+)$/m)?.[1]);assert.equal(new Set(ids).size,1);
for(let i=0;i<entries.length;i++){
 const data=entries[i];assert.ok(data.startsWith('BEGIN:VCALENDAR\r\n'));
 assert.ok(data.endsWith('END:VCALENDAR\r\n'));
 assert.ok(data.includes('DTSTART:'));
 assert.ok(!data.includes(real),'real email cannot leak in calendar attachment');
 assert.ok(!data.includes(alias),'internal Cal.com alias cannot leak in customer calendar attachment');
 assert.ok(!data.includes('token='));
 const lines=data.split('\r\n').filter(Boolean);
 for(const line of lines)assert.ok(Buffer.byteLength(line,'utf8')<=75,'RFC 5545 requires 75 octet folding: '+line);
 assert.deepEqual(sent[i].to,[real]);
 assert.match(sent[i].html,/Kalenderdatei liegt bei/);
}
env.NL_ICS_ENABLED='false';
const noIcs=await fire('BOOKING_CREATED',start);
assert.equal(noIcs.attachments,undefined,'calendar attachments off by default unless explicitly enabled');
assert.ok(!noIcs.html.includes('Kalenderdatei liegt bei'));
console.log('PASS: opt-in booking/reschedule/cancel ICS attachments, stable UID, UTF-8 folding, privacy, no signed links, disabled fallback');

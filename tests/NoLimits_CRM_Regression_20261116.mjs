import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/dist/worker.js',import.meta.url));
const worker=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;import assert from 'node:assert/strict';
const env={NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
 NL_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dummy'};
let phase='staff';
const origin='https://localboostzs.github.io';
async function call(p,token='verified-test-token',method='GET',body=null){
 const h={Origin:origin}; if(token)h.Authorization='Bearer '+token;
 if(body)h['Content-Type']='application/json';
 const req=new Request('https://worker.example'+p,{method,headers:h,...(body?{body:JSON.stringify(body)}:{})});
 const res=await worker.fetch(req,env);
 return {status:res.status,data:await res.json()};
}
const real=globalThis.fetch;
globalThis.fetch=async(u,opts={})=>{
 const url=String(u);
 if (url.includes('supabase.co')) assert.equal(opts.redirect,'manual');
 if (url.endsWith('/auth/v1/user')){
   if (phase==='redirect') return new Response('',{status:302,headers:{Location:'https://evil.example'}});
   if (phase==='invalid') return Response.json({error:'invalid token'},{status:403});
   return Response.json({id:'11111111-1111-4111-8111-111111111111'});
 }
 if (url.includes('/rest/v1/nl_staff')){
   return Response.json(phase==='inactive'?[{role:'staff',active:false}]:[{role:'staff',active:true}]);
 }
 if (url.includes('/rest/v1/nl_customer_profiles')){
   return Response.json([{full_name:'Testkunde',email:'customer@example.com',phone:'+41791234567',last_service_key:'haarschnitt'}]);
 }
 if (url.includes('/rest/v1/nl_legacy_contacts')){
   return Response.json([{external_id:'abc',name:'Kunde ohne Mail',email:'',phone:'+41791110000'},
     {external_id:'def',name:'Testkunde',email:'customer@example.com',phone:''}]);
 }
 if(url.includes('/v2/slots')){
   return Response.json({data:{'2026-11-24':[{start:'2026-11-24T10:00:00+01:00'}]}});
 }
 throw new Error('Unexpected external fetch: '+url);
};
try {
 let r=await call('/api/admin/services',null);assert.equal(r.status,401);
 phase='invalid';r=await call('/api/admin/services');assert.equal(r.status,401);
 phase='redirect';r=await call('/api/admin/services');assert.equal(r.status,401);
 phase='inactive';r=await call('/api/admin/services');assert.equal(r.status,403);
 phase='staff';r=await call('/api/admin/services');assert.equal(r.status,200);
 assert.equal(r.data.services.length,10);
 assert.ok(r.data.services.find(x=>x.key==='gentleman-rasur'&&x.internal));
 r=await call('/api/admin/contacts');assert.equal(r.status,200);
 assert.equal(r.data.contacts.length,2);
 assert.equal(r.data.bookingsWarning,true);
 assert.ok(r.data.contacts.find(x=>x.email==='customer@example.com'&&x.registered&&x.legacy));
 assert.ok(r.data.contacts.find(x=>x.phone==='+41791110000'&&x.legacy));
 r=await call('/api/services',null);assert.equal(r.status,200);
 assert.equal(r.data.services.length,9);
 assert.equal(r.data.services.find(x=>x.key==='gentleman-rasur'),undefined);
 r=await call('/api/slots?service=gentleman-rasur&start=2026-11-24&end=2026-11-24',null);assert.equal(r.status,400);
 r=await call('/api/admin/slots?service=gentleman-rasur&start=2026-11-24&end=2026-11-24');
 assert.equal(r.status,200);assert.equal(r.data.minutes,30);
 console.log('PASS 12 staff scenarios: no token, bad token, malicious redirect, inactive staff, authorized, hidden Gentleman, profile/wix merge incl phone-only, missing Cal warning, private slot, public nine');
}finally{globalThis.fetch=real;}

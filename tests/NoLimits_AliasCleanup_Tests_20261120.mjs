// NoLimits: no orphaned customer email mappings after a definite Cal.com rejection.
// All external requests mocked. No real Supabase/Cal.com or actual customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serviceText=fs.readFileSync('worker/src/services.alias-staging.js','utf8').replace(/^export /gm,'');
const source=fs.readFileSync('worker/src/index.js','utf8').replace(
  "import { SERVICES, TIME_ZONE, CAL_BASE } from './services.js';", serviceText);
const app=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;

const env={
  NL_ALIAS_MODE:'enabled', NL_ALIAS_STAGING_ONLY:'true',
  NL_ALIAS_DOMAIN:'localboost-zs.ch',NL_ALIAS_PREFIX:'info',NL_ALIAS_SEPARATOR:'+',
  NL_SUPABASE_URL:'https://jcctdjjunxmxaphjkrsz.supabase.co',
  NL_SUPABASE_SECRET_KEY:'sb_secret_mock',CAL_API_KEY:'cal_mock'
};
const start=new Date(Date.now()+10*86400000).toISOString();
const mappings=new Map();
let outcome=409,deletions=0,insertions=0;
globalThis.fetch=async(url,init={})=>{
  const u=String(url), method=init.method||'GET';
  if(u.includes('/rest/v1/nl_booking_email_aliases')){
    if(method==='POST'){
      const row=JSON.parse(init.body);
      assert.match(row.alias_email,/^info\+[a-f0-9]{32}@localboost-zs\.ch$/);
      mappings.set(row.alias_email,row);insertions++;
      return new Response(null,{status:201});
    }
    if(method==='DELETE'){
      const match=u.match(/alias_email=eq\.([^&]+)/);
      assert.ok(match,'must filter by alias');
      assert.ok(u.includes('booking_uid=is.null'),'only delete unbound aliases');
      const alias=decodeURIComponent(match[1]);
      assert.ok(mappings.has(alias));
      assert.equal(mappings.get(alias).booking_uid,undefined);
      mappings.delete(alias);
      deletions++;
      return new Response(null,{status:204});
    }
    if(method==='PATCH'){
      const match=u.match(/alias_email=eq\.([^&]+)/);
      const alias=decodeURIComponent(match[1]);
      assert.ok(mappings.has(alias));
      Object.assign(mappings.get(alias),JSON.parse(init.body));
      return new Response(null,{status:204});
    }
  }
  if(u==='https://api.cal.com/v2/bookings'&&method==='POST'){
    if(outcome==='timeout')throw Error('network interruption after send');
    if(outcome===201)return Response.json({data:{
      uid:'StagingSyntheticUID123',status:'accepted',start,end:new Date(Date.parse(start)+900000).toISOString()
    }});
    if(outcome===202)return Response.json({data:{status:'pending'}},{status:202});
    return Response.json({message:outcome===409?'Slot not available':'Upstream rejection'},{status:outcome});
  }
  throw Error('Unexpected request '+method+' '+u);
};
async function attempt(scenario,index){
  const beforeSize=mappings.size,oldDeletes=deletions,oldInserts=insertions;
  outcome=scenario;
  const email='info+testcleanup'+index+'@localboost-zs.ch';
  const req=new Request('https://nolimits-alias-staging.example.test/api/book',{
    method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.'+(index+10)},
    body:JSON.stringify({service:'haarschnitt',name:'Alias QA Person',email,
      phone:'+41790000000',start,accepted:true,elapsedMs:6000})
  });
  const response=await app.fetch(req,env);
  assert.equal(insertions,oldInserts+1,'mapping stored before Cal.com call');
  const shouldDelete=[400,409,422].includes(scenario);
  assert.equal(deletions,oldDeletes+(shouldDelete?1:0),'delete only after definite rejection');
  assert.equal(mappings.size,beforeSize+(shouldDelete?0:1),'mapping retention must match certainty');
  if(scenario===201)assert.equal(response.status,201);
  else assert.notEqual(response.status,201);
  console.log('PASS',String(scenario),'HTTP',response.status,
    shouldDelete?'definitely rejected alias removed':'potentially valid alias retained');
}
for(const [i,status] of [400,409,422,500,'timeout',202,201].entries()){
  await attempt(status,i);
}
assert.equal(mappings.size,4,'three rejected aliases are deleted and four uncertain/accepted retained');
assert.equal(deletions,3);
console.log('PASS: rejected Cal.com requests clean unbound alias; ambiguous outcomes stay mapped');

// Read-only release smoke checks for NoLimits: GET /api/health and /api/services.
// This tool never creates or modifies a booking, webhooks, contacts or cloud settings.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// Expected public prices and minutes as confirmed in NoLimits service mapping.
// Fail closed if a future release changes them without updating the approved baseline.
const expectedPublicServices=Object.freeze({
 'haarschnitt-bartschnitt-rasieren':{minutes:60,price:70},
 'haarschnitt-bartschnitt-augenbrauen':{minutes:45,price:65},
 'haarschnitt-waschen':{minutes:45,price:50},
 'haarschnitt-bartschnitt':{minutes:45,price:55},
 'classic-scissor-cut':{minutes:30,price:40},
 'haarschnitt':{minutes:30,price:30},
 'jugendliche-10-14':{minutes:30,price:25},
 'bartschnitt':{minutes:15,price:15},
 'augenbrauen-zupfen':{minutes:15,price:15}
});
// During the cutover the live API still has nine approved services. The new
// candidate has exactly ten. Require an explicit baseline; never accept extra
// services by default.
const candidateServices=Object.freeze({...expectedPublicServices,
 'gentleman-rasur':{minutes:30,price:30}
});
export async function checkReadiness(base,{client=fetch,baseline='legacy'}={}){
 if(!['legacy','candidate'].includes(baseline))throw Error('Unknown service baseline');
 const expectedServices=baseline==='candidate'?candidateServices:expectedPublicServices;
 const knownPublicKeys=Object.keys(expectedServices);
 const target=new URL(base);
 if(target.protocol!=='https:')throw Error('HTTPS required');
 if(target.username||target.password||target.search||target.hash)throw Error('Unexpected URL credentials or query');
 const url=target.origin;
 const request=async path=>{
   const res=await client(url+path,{
     method:'GET',redirect:'manual',cache:'no-store',
     signal:AbortSignal.timeout(10000),
     headers:{Accept:'application/json'}
   });
   if(res.status!==200)throw Error('READONLY_FAIL: '+path+' returned HTTP '+res.status);
   const data=await res.json();
   if(data?.ok!==true)throw Error('READONLY_FAIL: '+path+' did not report ok');
   return data;
 };
 await request('/api/health');
 // The staff directory must NEVER be accessible to unauthenticated visitors.
 // 401 is expected; 200 would expose customer data. Do not read the response
 // body or log any potentially sensitive details if this security guard fails.
 const guest=await client(url+'/api/admin/contacts',{
   method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),
   headers:{Accept:'application/json'}
 });
 if(guest.status!==401)throw Error('READONLY_FAIL: staff contacts must require a valid login (expected HTTP 401; got '+guest.status+')');
 const services=await request('/api/services');
 assert.ok(Array.isArray(services.services),'services must be an array');
 const keys=services.services.map(s=>s.key);
 assert.deepEqual([...keys].sort(),[...knownPublicKeys].sort(),
  'unexpected services/IDs or private staff-only services are public');
 for(const entry of services.services){
   const expected=expectedServices[entry.key];
   assert.equal(entry.minutes,expected.minutes,'unexpected duration for '+entry.key);
   // Ab 01.01.2027 (Zuercher Zeit) meldet der Worker den um CHF 5 hoeheren Preis.
   const raise=Date.now()>=Date.parse('2027-01-01T00:00:00+01:00')?5:0;
   assert.equal(entry.price,expected.price+raise,'unexpected CHF price for '+entry.key);
   assert.ok(typeof entry.name==='string'&&entry.name.length>1);
 }
 return {healthy:true,services:services.services.length,
   checked:['/api/health','/api/admin/contacts (unauthenticated must be 401)','/api/services'],note:'Read-only checks do not prove booking, staff CRM, customer email or calendar sync.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const url=process.argv[2];
 const baseline=process.argv[3]||'legacy';
 if(!url){console.error('Usage: node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://<worker>.workers.dev [legacy|candidate]');process.exitCode=2;}
 else{try{console.log(JSON.stringify(await checkReadiness(url,{baseline}),null,2));}
 catch(e){console.error('Release preflight blocked:',e.message);process.exitCode=1;}}
}

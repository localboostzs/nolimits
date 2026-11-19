// Read-only release smoke checks for NoLimits: GET /api/health and /api/services.
// This tool never creates or modifies a booking, webhooks, contacts or cloud settings.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const knownPublicKeys=[
 'haarschnitt-bartschnitt-rasieren','haarschnitt-bartschnitt-augenbrauen',
 'haarschnitt-waschen','haarschnitt-bartschnitt','classic-scissor-cut',
 'haarschnitt','jugendliche-10-14','bartschnitt','augenbrauen-zupfen'
];
export async function checkReadiness(base,{client=fetch}={}){
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
 const services=await request('/api/services');
 assert.ok(Array.isArray(services.services),'services must be an array');
 const keys=services.services.map(s=>s.key);
 assert.deepEqual([...keys].sort(),[...knownPublicKeys].sort(),
  'unexpected services/IDs or private staff-only services are public');
 for(const entry of services.services){
   assert.ok(Number.isFinite(entry.minutes)&&entry.minutes>0,'duration must be > 0');
   assert.ok(typeof entry.name==='string'&&entry.name.length>1);
 }
 return {healthy:true,services:services.services.length,
   checked:['/api/health','/api/services'],note:'Read-only checks do not prove booking, staff CRM, customer email or calendar sync.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const url=process.argv[2];
 if(!url){console.error('Usage: node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://<worker>.workers.dev');process.exitCode=2;}
 else{try{console.log(JSON.stringify(await checkReadiness(url),null,2));}
 catch(e){console.error('Release preflight blocked:',e.message);process.exitCode=1;}}
}

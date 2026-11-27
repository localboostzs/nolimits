// NoLimits release preflight contract, mocked responses only.
import assert from 'node:assert/strict';
import {checkReadiness} from '../tools/NoLimits_ReadonlyPreflight_20261119.mjs';
const known={
 'haarschnitt-bartschnitt-rasieren':[60,70],
 'haarschnitt-bartschnitt-augenbrauen':[45,65],
 'haarschnitt-waschen':[45,50],
 'haarschnitt-bartschnitt':[45,55],
 'classic-scissor-cut':[30,40],
 'haarschnitt':[30,30],
 'jugendliche-10-14':[30,25],
 'bartschnitt':[15,15],
 'augenbrauen-zupfen':[15,15]
};
function fake(extra=[],fail='',staffHttp=401){
 const paths=[];
 return {paths,client:async(url,opts)=>{
   assert.equal(opts.method,'GET');
   const path=new URL(url).pathname;paths.push(path);
   if(fail===path)return Response.json({ok:false},{status:503});
   if(path==='/api/health')return Response.json({ok:true});
   if(path==='/api/admin/contacts')return Response.json({ok:staffHttp===200},{status:staffHttp});
   if(path==='/api/services')return Response.json({ok:true,services:[...Object.keys(known),...extra].map(key=>({key,name:key,minutes:known[key]?.[0]??30,price:(known[key]?.[1]??30)+(Date.now()>=Date.parse('2027-01-01T00:00:00+01:00')?5:0)}))});
   throw Error('Unknown read request '+path);
 }};
}
const baseline=fake();
const result=await checkReadiness('https://nolimits-booking-test.example.invalid/',{client:baseline.client});
assert.equal(result.services,9);
assert.deepEqual(baseline.paths,['/api/health','/api/admin/contacts','/api/services']);
await assert.rejects(()=>checkReadiness('http://nolimits.example.invalid'),/HTTPS required/);
await assert.rejects(()=>checkReadiness('https://user:pass@nolimits.example.invalid'),/Unexpected URL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid/?secret=abc'),/Unexpected URL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake(['gentleman-rasur']).client}),/unexpected services/);
const candidate=await checkReadiness('https://nolimits.example.invalid',{client:fake(['gentleman-rasur']).client,baseline:'candidate'});
assert.equal(candidate.services,10);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake().client,baseline:'candidate'}),/unexpected services/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake(['gentleman-rasur','unknown']).client,baseline:'candidate'}),/unexpected services/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake().client,baseline:'typo'}),/Unknown service baseline/);
const badPrice=fake();
const normalClient=badPrice.client;
badPrice.client=async(url,opts)=>{
 const data=await normalClient(url,opts);
 if(String(url).endsWith('/api/services')){
   const body=await data.json();
   body.services.find(x=>x.key==='haarschnitt').price=999;
   return Response.json(body);
 }
 return data;
};
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:badPrice.client}),/unexpected CHF price/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([], '',200).client}),/staff contacts must require/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([], '',503).client}),/staff contacts must require/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([],'/api/health').client}),/READONLY_FAIL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([],'/api/services').client}),/READONLY_FAIL/);
console.log('PASS: read-only release smoke checker enforces HTTPS, explicit nine/ten-service baselines, no unapproved services and no mutations');

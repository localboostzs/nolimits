// NoLimits release preflight contract, mocked responses only.
import assert from 'node:assert/strict';
import {checkReadiness} from '../tools/NoLimits_ReadonlyPreflight_20261119.mjs';
const known=[
 'haarschnitt-bartschnitt-rasieren','haarschnitt-bartschnitt-augenbrauen',
 'haarschnitt-waschen','haarschnitt-bartschnitt','classic-scissor-cut',
 'haarschnitt','jugendliche-10-14','bartschnitt','augenbrauen-zupfen'
];
function fake(extra=[],fail=''){
 const paths=[];
 return {paths,client:async(url,opts)=>{
   assert.equal(opts.method,'GET');
   const path=new URL(url).pathname;paths.push(path);
   if(fail===path)return Response.json({ok:false},{status:503});
   if(path==='/api/health')return Response.json({ok:true});
   if(path==='/api/services')return Response.json({ok:true,services:[...known,...extra].map(key=>({key,name:key,minutes:30,price:30}))});
   throw Error('Unknown read request '+path);
 }};
}
const baseline=fake();
const result=await checkReadiness('https://nolimits-booking-test.example.invalid/',{client:baseline.client});
assert.equal(result.services,9);
assert.deepEqual(baseline.paths,['/api/health','/api/services']);
await assert.rejects(()=>checkReadiness('http://nolimits.example.invalid'),/HTTPS required/);
await assert.rejects(()=>checkReadiness('https://user:pass@nolimits.example.invalid'),/Unexpected URL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid/?secret=abc'),/Unexpected URL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake(['gentleman-rasur']).client}),/unexpected services/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([],'/api/health').client}),/READONLY_FAIL/);
await assert.rejects(()=>checkReadiness('https://nolimits.example.invalid',{client:fake([],'/api/services').client}),/READONLY_FAIL/);
console.log('PASS: read-only release smoke checker enforces HTTPS, nine public services, no staff services and no mutations');

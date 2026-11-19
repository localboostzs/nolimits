/* NoLimits – OFFLINE Wix booking migration rehearsal only.
 * Never creates Cal.com bookings or emails customers.
 * Input: manually normalized Wix export rows (no live data committed):
 * {wixId,status,serviceKey,startIso,customerName,customerEmail,customerPhone}.
 * startIso MUST carry Z or numeric UTC offset, never an ambiguous local time.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const ISO_OFFSET=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
export function buildDryRun(bookings,{services,now=Date.now()}={}){
  if(!Array.isArray(bookings)||!services||typeof services!=='object'){
    throw Error('Normalized Wix booking array and Cal.com service definitions required.');
  }
  const ids=new Set(),normalized=[],blockers=[],skipped={past:0,canceled:0,duplicates:0};
  for(const [i,b] of bookings.entries()){
    if(!b||typeof b!=='object'){blockers.push({row:i+1,reason:'invalid_row'});continue;}
    const id=String(b.wixId||'').trim();
    if(!id){blockers.push({row:i+1,reason:'missing_wix_id'});continue;}
    if(ids.has(id)){skipped.duplicates++;continue;}
    ids.add(id);
    const status=String(b.status||'').trim().toUpperCase();
    if(['CANCELED','CANCELLED','DECLINED','REJECTED'].includes(status)){skipped.canceled++;continue;}
    if(!['CONFIRMED','ACCEPTED','PAID'].includes(status)){
      blockers.push({row:i+1,id,reason:'unsupported_status'});continue;
    }
    const iso=String(b.startIso||'').trim();
    if(!ISO_OFFSET.test(iso)||!Number.isFinite(Date.parse(iso))){
      blockers.push({row:i+1,id,reason:'timezone_or_start_invalid'});continue;
    }
    const start=Date.parse(iso);
    if(start<=now){skipped.past++;continue;}
    const key=String(b.serviceKey||'').trim();
    const service=services[key];
    if(!service||!Number.isFinite(service.minutes)||service.minutes<=0){
      blockers.push({row:i+1,id,reason:'unknown_service'});continue;
    }
    const email=String(b.customerEmail||'').trim().toLowerCase();
    const name=String(b.customerName||'').trim();
    if(!EMAIL.test(email)||!name){
      blockers.push({row:i+1,id,reason:'missing_customer_contact'});continue;
    }
    normalized.push({
      wixId:id,serviceKey:key,startIso:new Date(start).toISOString(),
      endIso:new Date(start+service.minutes*60000).toISOString(),
      minutes:service.minutes
    });
  }
  const conflicts=[];
  const sorted=[...normalized].sort((a,b)=>a.startIso.localeCompare(b.startIso));
  for(let i=1;i<sorted.length;i++){
    const previous=sorted[i-1],current=sorted[i];
    if(Date.parse(current.startIso)<Date.parse(previous.endIso)){
      conflicts.push({firstWixId:previous.wixId,secondWixId:current.wixId,reason:'overlapping_staff_time'});
    }
  }
  return {
    ready:blockers.length===0&&conflicts.length===0,
    summary:{sourceRows:bookings.length,prepared:normalized.length,...skipped,blockers:blockers.length,conflicts:conflicts.length},
    appointments:normalized,blockers,conflicts,
    warning:'TROCKENLAUF: Kein Versand, keine Cal.com- oder Wix-Änderung. Zusätzlich bestehende Cal.com-Termine, Kalenderzuständigkeit und Isens Freigabe abgleichen.'
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const input=process.argv[2];
  if(!input){console.error('Usage: node tools/NoLimits_WixBookingPlan_20261119.mjs normalized-bookings.json');process.exitCode=2;}
  else{
    try{
      const source=JSON.parse(readFileSync(input,'utf8'));
      const servicesFile=readFileSync('worker/src/services.js','utf8').replace(/^export /gm,'');
      const services=new Function(servicesFile+'\nreturn SERVICES;')();
      const plan=buildDryRun(source,{services});
      const {appointments,...report}=plan;
      // Display only IDs/UTC time for planning, not customer identities/PII.
      console.log(JSON.stringify({...report,appointments:appointments.map(a=>({
        wixId:a.wixId,serviceKey:a.serviceKey,startIso:a.startIso,endIso:a.endIso
      }))},null,2));
      if(!plan.ready)process.exitCode=1;
    }catch(e){console.error('Offline migration preview failed:',e.message);process.exitCode=2;}
  }
}

// Browser-level LAB staff flow QA. Fake Supabase auth and fake Worker API only.
// No real Cal booking, Supabase write, Wix access or staff JWT.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=(process.env.NOLIMITS_UI_BASE||'http://127.0.0.1:8765').replace(/\/$/,'');
const options={headless:true,args:['--no-sandbox']};
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)options.executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch(options);
const future=new Date(Date.now()+10*86400000).toISOString();
const fakeUid='SyntheticLabBookQA123456789';
const fakeToken='A'.repeat(43);
const fakeLink='https://localboostzs.github.io/nolimits/termin-verwalten/?uid='+fakeUid+'&token='+fakeToken;
async function scenario(name,{authorized=true,crmFound=true,badLink=false,crmAliasLeak=false,cleanupFails=false}={}){
 const context=await browser.newContext({viewport:{width:1366,height:768},locale:'de-CH'});
 const page=await context.newPage();let booked=0,cancelled=0,crmCalls=0,cleanups=0,customerEmail='';
 await page.route('**/assets/js/auth-client.js*',route=>route.fulfill({
   status:200,contentType:'application/javascript',
   body:'window.NOLIMITS_ACCOUNT={staff:async()=>'+(authorized?"({role:'staff',active:true})":"null")+
     ",bearer:async()=> 'mock-internal-staff-session'};"
 }));
 await page.route('**/assets/js/privacy.js*',route=>route.fulfill({
   status:200,contentType:'application/javascript',
   body:'window.NOLIMITS_PRIVACY={authStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};'
 }));
 await page.route('https://nolimits-alias-staging.broken-haze-6cad.workers.dev/**',async(route)=>{
   const req=route.request(),method=req.method(),path=new URL(req.url()).pathname;
   let body,code=200;
   if(path==='/api/admin/services'&&method==='GET'){
     body={ok:true,services:[{key:'haarschnitt',minutes:15,price:0,name:'LAB 15 Minuten'}]};
   }else if(path==='/api/admin/slots'&&method==='GET'){
     body={ok:true,days:{'2099-01-09':[future]}};
   }else if(path==='/api/admin/book'&&method==='POST'){
     booked++;const p=req.postDataJSON();customerEmail=p.email;
     assert.match(p.email,/^info\+nl-lab-staff-\d+@localboost-zs\.ch$/);
     assert.equal(p.service,'haarschnitt');
     assert.equal(p.accepted,true);
     body={ok:true,booking:{uid:fakeUid,status:'accepted',manageUrl:
       badLink?fakeLink.replace('https://localboostzs.github.io/nolimits/termin-verwalten/',
         'https://untrusted.example/other/'):fakeLink}};
   }else if(path==='/api/admin/contacts'&&method==='GET'){
     crmCalls++;
     body={ok:true,contacts:crmFound?[{email:customerEmail,upcoming:[{uid:fakeUid}],past:[]},
       ...(crmAliasLeak?[{email:'info+'+'a'.repeat(32)+'@localboost-zs.ch',upcoming:[]}]:[])]:[]};
   }else if(path==='/api/manage/cancel'&&method==='POST'){
     cancelled++;const p=req.postDataJSON();
     assert.equal(p.uid,fakeUid);
     assert.equal(p.token,fakeToken);
     assert.equal(p.confirm,true);
     body={ok:true,status:'cancelled'};
   }else if(path==='/api/lab/cleanup'&&method==='POST'){
     cleanups++;assert.equal(cancelled,1,'cleanup must follow cancellation');
     assert.equal(req.postDataJSON().uid,fakeUid);
     if(cleanupFails){code=503;body={ok:false,error:{code:'cleanup_unavailable'}};}
     else body={ok:true,cleaned:true};
   }else throw Error('Unexpected mocked API '+method+' '+path);
   await route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(body)});
 });
 try{
   const response=await page.goto(root+'/verwaltung-lab/',{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200);
   if(!authorized){
     await page.getByText('Bitte zuerst über die normale NoLimits-Verwaltung').waitFor({timeout:8000});
     assert.equal(await page.locator('#nl-lab-run').isDisabled(),true);
     assert.equal(booked,0);assert.equal(crmCalls,0);assert.equal(cancelled,0);assert.equal(cleanups,0);
     console.log('PASS',name,'blocked without staff login');
   }else{
     await page.locator('#nl-lab-run').waitFor({state:'visible',timeout:8000});
     await page.waitForFunction(()=>!document.getElementById('nl-lab-run').disabled);
     await page.locator('#nl-lab-run').click();
     const success=crmFound&&!badLink&&!crmAliasLeak&&!cleanupFails;
     await page.getByText(success?'GESAMTER MITARBEITER-LAB-TEST BESTANDEN.':
       'LAB-TEST NOCH NICHT VOLLSTÄNDIG BESTANDEN.',{exact:false}).waitFor({timeout:30000});
     assert.equal(booked,1,'only one Cal LAB booking');
     assert.equal(cancelled,1,'always cancel LAB booking, even on CRM failure');
     assert.ok(cleanups>=1,'always attempt server-verified test alias cleanup');
     if(badLink)assert.equal(crmCalls,0,'wrong management link must fail before loading CRM');
     else assert.ok(crmCalls>=1);
     const out=await page.locator('#nl-lab-output').innerText();
     assert.ok(!out.includes(fakeToken),'signed manage token must never appear in UI output');
     assert.ok(!out.includes('mock-internal-staff-session'),'auth session must never appear in UI output');
     if(!crmFound) assert.match(out,/nicht rechtzeitig/);
     if(badLink) assert.match(out,/unerwartetes Ziel/);
     if(crmAliasLeak) assert.match(out,/Aliasadresse/);
     if(cleanupFails) assert.match(out,/nicht bereinigt/);
     console.log('PASS',name,crmFound?'booking/CRM/cancel':'CRM error still cancels booking');
   }
 }finally{await context.close();}
}
try{
 await scenario('authorized-staff-success');
 await scenario('unauthorized-staff', {authorized:false});
 await scenario('crm-lag-fails-closed-but-cancels', {authorized:true,crmFound:false});
 await scenario('wrong-manage-url-still-cancels', {authorized:true,badLink:true});
 await scenario('crm-alias-exposure-still-cancels', {authorized:true,crmAliasLeak:true});
 await scenario('alias-cleanup-failure-must-report', {authorized:true,cleanupFails:true});
}finally{await browser.close();}
console.log('PASS: isolated LAB browser E2E uses mock auth and one test booking, cancellation always runs');

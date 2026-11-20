// NoLimits booking-management UI: browser-level E2E with synthetic API data.
// No customer sessions, Cal.com API requests, bookings or live changes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const root=(process.env.NOLIMITS_UI_BASE||'http://127.0.0.1:8765').replace(/\/$/,'');
const chromiumOpts={headless:true,args:['--no-sandbox']};
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)chromiumOpts.executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch(chromiumOpts);
await mkdir('artifacts/nolimits-manage-e2e-20261119',{recursive:true});
const start=new Date(Date.now()+12*86400000).toISOString();
const next=new Date(Date.now()+13*86400000).toISOString();
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(next));
const initialUid='InternalManageUIDabc123',initialToken='signed_mock_token_one';
const movedUid='InternalManageNewUID9999',movedToken='signed_mock_token_two';
function booking(status='accepted',time=start){
 return {service:'Haarschnitt',serviceKey:'haarschnitt',eventTypeId:7982460,
  minutes:30,price:30,start:time,end:new Date(Date.parse(time)+30*60000).toISOString(),
  status,canManage:status==='accepted'};
}
async function runCase(name,viewport,mode){
 const context=await browser.newContext({viewport,locale:'de-CH',timezoneId:'Europe/Zurich'});
 const page=await context.newPage();
 const calls=[];
 await page.route('**/api/manage**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   calls.push({method:req.method(),path});
   const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':root,
     'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
   let response,status=200;
   if(path==='/api/manage'&&req.method()==='GET') {
     if(mode==='invalid'){status=403;response={ok:false,error:{message:'Dieser Buchungslink ist ungültig oder abgelaufen.'}};}
     else response={ok:true,booking:booking()};
   }else if(path==='/api/manage/slots'&&req.method()==='GET'){
     response={ok:true,days:{[day]:[next]}};
   }else if(path==='/api/manage/reschedule'&&req.method()==='POST'){
     const data=JSON.parse(req.postData()||'{}');
     assert.equal(data.confirm,true);
     assert.equal(data.start,next);
     assert.equal(data.uid,initialUid);
     response={ok:true,booking:{start:next,status:'accepted',end:new Date(Date.parse(next)+30*60000).toISOString(),
       manageUrl:'https://localboostzs.github.io/nolimits/termin-verwalten/?uid='+movedUid+'&token='+movedToken}};
   }else if(path==='/api/manage/cancel'&&req.method()==='POST'){
     const data=JSON.parse(req.postData()||'{}');
     assert.equal(data.uid,initialUid);
     assert.equal(data.confirm,true);
     response={ok:true,status:'cancelled'};
   }else{status=404;response={ok:false,error:{message:'Unbekannte Testanfrage.'}};}
   await route.fulfill({status,headers,body:JSON.stringify(response)});
 });
 try{
   const link=root+'/termin-verwalten/?uid='+initialUid+'&token='+initialToken;
   const result=await page.goto(link,{waitUntil:'domcontentloaded',timeout:15000});
   assert.equal(result?.status(),200);
   const reject=page.locator('.nl-privacy-reject');
   if(await reject.isVisible())await reject.click();
   if(mode==='invalid'){
     await page.locator('#nl-manage-unavailable').waitFor({state:'visible',timeout:10000});
     assert.ok((await page.locator('#nl-manage-msg').textContent()).includes('ungültig'));
     assert.equal(await page.locator('#nl-manage-actions').isVisible(),false);
   }else{
     await page.locator('#nl-manage-details').waitFor({state:'visible',timeout:10000});
     assert.equal((await page.locator('#nl-manage-service').textContent()).trim(),'Haarschnitt');
     assert.equal(await page.locator('#nl-manage-actions').isVisible(),true);
     assert.ok(!page.url().includes('token='),'personal management token removed from browser URL');
     if(mode==='reschedule'){
       await page.locator('#nl-manage-show-reschedule').click();
       await page.locator('#nl-manage-date').fill(day);
       await page.locator('#nl-manage-date').dispatchEvent('change');
       const slot=page.locator('.nl-manage-slot');
       await slot.first().waitFor({state:'visible',timeout:10000});
       await slot.first().click();
       await page.locator('#nl-manage-confirm-reschedule').check();
       await page.locator('#nl-manage-reschedule-submit').click();
       await page.locator('#nl-manage-result').waitFor({state:'visible',timeout:10000});
       assert.ok((await page.locator('#nl-manage-result-title').textContent()).includes('verschoben'));
       assert.equal(await page.locator('#nl-manage-actions').isVisible(),false);
       const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('nl-manage-link')));
       assert.equal(saved.uid,movedUid);
       assert.equal(saved.token,movedToken);
       assert.equal(calls.filter(x=>x.path==='/api/manage/reschedule').length,1);
     }else if(mode==='cancel'){
       await page.locator('#nl-manage-show-cancel').click();
       await page.locator('#nl-manage-confirm-cancel').check();
       await page.locator('#nl-manage-cancel [type=submit]').click();
       await page.locator('#nl-manage-result').waitFor({state:'visible',timeout:10000});
       assert.ok((await page.locator('#nl-manage-result-title').textContent()).includes('storniert'));
       assert.equal(await page.locator('#nl-manage-actions').isVisible(),false);
       assert.equal(await page.locator('#nl-manage-details').evaluate(x=>x.classList.contains('is-cancelled')),true);
       assert.equal(calls.filter(x=>x.path==='/api/manage/cancel').length,1);
     }
   }
   const bodyWidth=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(bodyWidth<=2,'Management page overflow: '+bodyWidth);
   await page.screenshot({path:'artifacts/nolimits-manage-e2e-20261119/'+name+'.png',fullPage:true});
   console.log('PASS',name,'mock API calls',calls.map(x=>x.method+' '+x.path).join(' | '));
 }finally{await context.close();}
}
try{
 await runCase('desktop-reschedule',{width:1366,height:800},'reschedule');
 await runCase('desktop-cancel',{width:1366,height:800},'cancel');
 await runCase('desktop-invalid-link',{width:1366,height:800},'invalid');
 await runCase('mobile390-reschedule',{width:390,height:844},'reschedule');
 await runCase('mobile390-cancel',{width:390,height:844},'cancel');
}finally{await browser.close();}
console.log('PASS: NoLimits management page browser-level E2E with mocked API only');

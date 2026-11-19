// NoLimits customer-account profile browser regression with synthetic auth stub.
// No real Supabase session, Google login, customer profile, or network writes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const root=(process.env.NOLIMITS_UI_BASE||'http://127.0.0.1:8765').replace(/\/$/,'');
const opts={headless:true,args:['--no-sandbox']};
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)opts.executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch(opts);
await mkdir('artifacts/nolimits-account-e2e-20261119',{recursive:true});
const fakeAuth=`
(function(){
 var initial={full_name:'Testperson Beispiel',phone:'+41790000001',address:'Teststrasse 1, 6000 Luzern',last_service_key:'haarschnitt'};
 function profile(){try{return JSON.parse(sessionStorage.getItem('qa-profile')||'null')||initial;}catch(_){return initial;}}
 window.NOLIMITS_ACCOUNT={
   enabled:true,
   async user(){return sessionStorage.getItem('qa-signed-out')?null:{email:'internal-test@example.invalid'};},
   async profile(){return profile();},
   async saveProfile(p){sessionStorage.setItem('qa-profile',JSON.stringify(p));return p;},
   async signOut(){sessionStorage.setItem('qa-signed-out','1');},
   async socialProviderStatus(){return {google:false};},
   async staff(){return false;}
 };
})();`;
async function testDevice(name,viewport) {
 const context=await browser.newContext({viewport,locale:'de-CH'});
 const page=await context.newPage();
 await page.route('**/assets/js/auth-client.js*',route=>route.fulfill({
   status:200,contentType:'application/javascript; charset=utf-8',body:fakeAuth
 }));
 try{
   const reply=await page.goto(root+'/konto/',{waitUntil:'domcontentloaded'});
   assert.equal(reply.status(),200);
   await page.locator('#nl-details').waitFor({state:'visible',timeout:8000});
   assert.equal((await page.locator('#nl-name').inputValue()),'Testperson Beispiel');
   assert.equal((await page.locator('#nl-email').textContent()).trim(),'internal-test@example.invalid');
   assert.equal(await page.locator('#nl-last').isVisible(),true);
   // Save and read back from a browser-only synthetic account state.
   await page.locator('#nl-name').fill('Geprüfte Testperson');
   await page.locator('#nl-phone').fill('+41790000002');
   await page.locator('#nl-address').fill('Testplatz 2, 6000 Luzern');
   await page.locator('#nl-profile-form button[type=submit]').click();
   await page.waitForFunction(()=>document.getElementById('nl-status').textContent.includes('gespeichert'));
   const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('qa-profile')));
   assert.equal(stored.full_name,'Geprüfte Testperson');
   assert.equal(stored.last_service_key,'haarschnitt','saving must preserve last-service preference');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#nl-details').waitFor({state:'visible',timeout:8000});
   assert.equal(await page.locator('#nl-name').inputValue(),'Geprüfte Testperson');
   assert.equal(await page.locator('#nl-phone').inputValue(),'+41790000002');
   assert.equal(await page.locator('#nl-address').inputValue(),'Testplatz 2, 6000 Luzern');
   const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
   assert.equal(overflowing,false);
   await page.screenshot({path:'artifacts/nolimits-account-e2e-20261119/'+name+'_profile_saved.png',fullPage:true});
   await page.locator('#nl-signout').click();
   await page.locator('#nl-login').waitFor({state:'visible',timeout:8000});
   assert.equal(await page.locator('#nl-details').isVisible(),false);
   console.log('PASS',name,'synthetic login, profile save, persistence, preserved service and signout');
 }finally{await context.close();}
}
try{
 await testDevice('desktop1366',{width:1366,height:800});
 await testDevice('mobile390',{width:390,height:844});
}finally{await browser.close();}
console.log('PASS: NoLimits synthetic customer account CRUD UI with mocked Supabase client');

// Read-only visual smoke test for NoLimits public demo pages.
// Does not authenticate, create bookings, change appointments, or access customer data.
// Execute on GitHub Actions with Playwright Chromium.
import { chromium } from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=(process.env.NOLIMITS_UI_BASE||'https://localboostzs.github.io/nolimits').replace(/\/$/,'');
const pages=[
  ['start','/'],
  ['buchung','/booking-test/'],
  ['konto','/konto/'],
  ['verwaltung','/verwaltung/'],
  ['termin-verwaltung','/termin-verwalten/']
];
const devices=[
  {name:'mobile320',viewport:{width:320,height:760},isMobile:true,deviceScaleFactor:1},
  {name:'mobile390',viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1},
  {name:'desktop1366',viewport:{width:1366,height:768},isMobile:false,deviceScaleFactor:1}
];
await mkdir('artifacts/nolimits-ui-20261119',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const problems=[];
try {
  for(const device of devices) {
    const context=await browser.newContext({
      viewport:device.viewport,
      isMobile:device.isMobile,
      deviceScaleFactor:device.deviceScaleFactor,
      locale:'de-CH',
      timezoneId:'Europe/Zurich'
    });
    for(const [name,path] of pages) {
      const page=await context.newPage();
      const jsErrors=[];
      page.on('pageerror',err=>jsErrors.push(err.message));
      try {
        const response=await page.goto(root+path,{waitUntil:'domcontentloaded',timeout:30000});
        assert.equal(response?.status(),200,name+' page HTTP');
        await page.waitForTimeout(1500);
        assert.ok(await page.locator('h1').count(), name+' page requires a heading');
        const layout=await page.evaluate(()=>({
          viewport:document.documentElement.clientWidth,
          document:document.documentElement.scrollWidth,
          body:document.body.scrollWidth
        }));
        if(layout.document>layout.viewport+2) {
          const offenders=await page.evaluate(()=>{
            const width=document.documentElement.clientWidth;
            return Array.from(document.querySelectorAll('body *')).map(el=>{
              const r=el.getBoundingClientRect();
              const c=getComputedStyle(el);
              return {tag:el.tagName.toLowerCase(),id:el.id,cls:String(el.className||'').slice(0,80),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),display:c.display};
            }).filter(x=>x.display!=='none'&&x.width>0&&x.right>width+2&&x.left<width).sort((a,b)=>b.right-a.right).slice(0,12);
          });
          throw Error(name+' '+device.name+' has horizontal overflow: '+JSON.stringify({layout,offenders}));
        }
        assert.deepEqual(jsErrors,[],name+' '+device.name+' no unhandled JS exceptions');
        if(name==='buchung') {
          assert.equal(await page.locator('form#bk-form').count(),1);
          assert.equal(await page.locator('#f-name').count(),1);
          assert.equal(await page.locator('#f-email').count(),1);
          assert.equal(await page.locator('#f-phone').count(),1);
          assert.equal(await page.locator('#f-terms').count(),1);
          assert.equal(await page.locator('#bk-submit').count(),1);
        }
        if(name==='konto') {
          assert.equal(await page.locator('#nl-email-form').count(),1);
        }
        if(name==='verwaltung') {
          assert.equal(await page.locator('#nl-desk').count(),1);
          assert.ok(await page.locator('#nl-gate').count(),'Admin gate present');
        }
        if(name==='termin-verwaltung') {
          assert.equal(await page.locator('#nl-manage-missing').count(),1);
          assert.equal(await page.locator('#nl-manage-details').count(),1);
        }
        console.log('PASS',device.name,name,'status',response.status(),'width',layout.document);
      } catch(err) {
        problems.push(device.name+' '+name+': '+err.message);
        console.error('FAIL',device.name,name,err.message);
      } finally {
        await page.screenshot({
          path:'artifacts/nolimits-ui-20261119/'+device.name+'_'+name+'.png',
          fullPage:true
        }).catch(()=>{});
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if(problems.length) {
  throw new Error(problems.join('\n'));
}
console.log('PASS read-only desktop/mobile smoke test:',devices.length*pages.length,'page combinations');

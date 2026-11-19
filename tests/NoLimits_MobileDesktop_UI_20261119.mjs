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
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
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

        // Authenticated *visual state* only, with synthetic data; never log in.
        // Previous generic page checks missed the strong/button overlap.
        if(name==='konto') {
          for(const serviceName of ['Haarschnitt','Haarschnitt mit Bartschnitt und Rasieren']) {
            const geometry=await page.evaluate(title=>{
              const loading=document.getElementById('nl-loading');
              const loggedIn=document.getElementById('nl-details');
              const tile=document.getElementById('nl-last');
              if(loading) loading.hidden=true;
              loggedIn.hidden=false;
              document.getElementById('nl-login').hidden=true;
              document.getElementById('nl-email').textContent='qa-intern@example.invalid';
              tile.replaceChildren();
              const strong=document.createElement('strong'); strong.textContent=title;
              const action=document.createElement('a');
              action.className='btn btn-gold btn-sm';
              action.href='../booking-test/?service=haarschnitt';
              action.textContent='Gleiche Leistung wieder buchen';
              tile.append(strong,action); tile.hidden=false;
              const a=strong.getBoundingClientRect(),b=action.getBoundingClientRect(),p=tile.getBoundingClientRect();
              const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
              const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
              return {overlapX,overlapY, actionWidth:b.width, headingWidth:a.width, tileWidth:p.width,
                inside: a.left>=p.left-1&&a.right<=p.right+1&&b.left>=p.left-1&&b.right<=p.right+1,
                pageWidth:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth};
            },serviceName);
            assert.ok(geometry.overlapX<=1||geometry.overlapY<=1,
              device.name+' logged-in quick-booking title/button overlap: '+JSON.stringify(geometry));
            assert.ok(geometry.inside&&geometry.actionWidth>50&&geometry.headingWidth>50,
              device.name+' logged-in quick-booking exceeds card bounds: '+JSON.stringify(geometry));
            assert.ok(geometry.pageWidth<=geometry.viewport+2,
              device.name+' logged-in quick-booking causes page overflow: '+JSON.stringify(geometry));
            await page.screenshot({
              path:'artifacts/nolimits-ui-20261119/'+device.name+'_konto-angemeldet_'+
                (serviceName==='Haarschnitt'?'kurz':'lang')+'.png',fullPage:true});
            console.log('PASS',device.name,'konto-angemeldet',serviceName,'no overlap');
          }
        }
        if(name==='verwaltung') {
          const selectInfo=await page.evaluate(()=>{
            const desk=document.getElementById('nl-desk'),gate=document.getElementById('nl-gate');
            desk.hidden=false;gate.hidden=true;
            const service=document.getElementById('nl-admin-service'),
                  slots=document.getElementById('nl-admin-slot');
            service.replaceChildren();
            for(const label of [
              'Leistung auswählen',
              'Haarschnitt mit Bartschnitt und Rasieren · 60 Min · CHF 60',
              'Haarschnitt mit Bartschnitt + Augenbrauen · 45 Min · CHF 55',
              'Haarschnitt mit Waschen · 45 Min · CHF 50',
              'Haarschnitt · 30 Min · CHF 30',
              'Gentleman Rasur · 30 Min · CHF 30']) {
                service.append(new Option(label,label==='Leistung auswählen'?'':label));
            }
            slots.replaceChildren(new Option('Uhrzeit auswählen',''),
              new Option('10:15','10:15'),new Option('11:30','11:30'));
            const st=getComputedStyle(service),opt=CSS.supports('appearance','base-select');
            return {height:service.getBoundingClientRect().height, radius:st.borderTopLeftRadius,
              appearance:st.appearance, modernSupport:opt,
              labelServices:!!document.querySelector('label[for="nl-admin-service"]'),
              labelSlots:!!document.querySelector('label[for="nl-admin-slot"]'),
              options:service.options.length};
          });
          assert.ok(selectInfo.height>=52,'staff dropdown is a touch-friendly size');
          assert.ok(parseFloat(selectInfo.radius)>=6,'staff dropdown has modern radius');
          assert.ok(selectInfo.labelServices&&selectInfo.labelSlots,'both select labels accessible');
          assert.equal(selectInfo.options,6);
          if(selectInfo.modernSupport) assert.equal(selectInfo.appearance,'base-select',
            'supported Chromium should style the opened native picker');
          await page.screenshot({
            path:'artifacts/nolimits-ui-20261119/'+device.name+'_verwaltung-dropdown-geschlossen.png',
            fullPage:true});
          if(selectInfo.modernSupport) {
            await page.locator('#nl-admin-service').click();
            const opened=await page.locator('#nl-admin-service').evaluate(el=>el.matches(':open'));
            assert.ok(opened,'styled native select opens');
            await page.screenshot({
              path:'artifacts/nolimits-ui-20261119/'+device.name+'_verwaltung-dropdown-geoeffnet.png',
              fullPage:true});
            await page.keyboard.press('Escape');
          }
          console.log('PASS',device.name,'verwaltung dropdown touch size/labels/picker');
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

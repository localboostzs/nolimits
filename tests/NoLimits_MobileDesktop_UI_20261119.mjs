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
          // Realistic consent interaction: the privacy dialog must be dismissed
          // before the staff dashboard can receive pointer events on a phone.
          const reject=page.locator('.nl-privacy-reject');
          if(await reject.isVisible()) await reject.click();
          const selectInfo=await page.evaluate(()=>{
            const desk=document.getElementById('nl-desk'),gate=document.getElementById('nl-gate');
            desk.hidden=false;gate.hidden=true;
            const service=document.getElementById('nl-admin-service');
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
            const st=getComputedStyle(service),opt=CSS.supports('appearance','base-select');
            return {height:service.getBoundingClientRect().height, radius:st.borderTopLeftRadius,
              appearance:st.appearance, modernSupport:opt,
              labelServices:!!document.querySelector('label[for="nl-admin-service"]'),
              labelSlots:!!document.querySelector('#nl-admin-calendar[aria-labelledby="nl-admin-when"]')&&!!document.querySelector('#nl-admin-calendar .bk-cal-head .bk-nav'),
              options:service.options.length};
          });
          assert.ok(selectInfo.height>=52,'staff dropdown is a touch-friendly size');
          assert.ok(parseFloat(selectInfo.radius)>=6,'staff dropdown has modern radius');
          assert.ok(selectInfo.labelServices&&selectInfo.labelSlots,'service label and labelled booking calendar');
          assert.equal(selectInfo.options,6);
          if(selectInfo.modernSupport) assert.equal(selectInfo.appearance,'base-select',
            'supported Chromium should style the opened native picker');
          await page.screenshot({
            path:'artifacts/nolimits-ui-20261119/'+device.name+'_verwaltung-dropdown-geschlossen.png',
            fullPage:true});
          if(selectInfo.modernSupport) {
            await page.locator('#nl-admin-service').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
            await page.locator('#nl-admin-service').click({position:{x:24,y:24},timeout:6000});
            const opened=await page.locator('#nl-admin-service').evaluate(el=>el.matches(':open'));
            assert.ok(opened,'styled native select opens');
            await page.screenshot({
              path:'artifacts/nolimits-ui-20261119/'+device.name+'_verwaltung-dropdown-geoeffnet.png',
              fullPage:true});
            await page.keyboard.press('Escape');
          }
          // Import preview with fake contacts: no staff session, no database writes.
          const importFile='Contact ID;First Name;Last Name;Email;Phone\\n'+
            'synthetic-1;Test;Person;test@example.invalid;+41790000001\\n'+
            'synthetic-2;Test;Person 2;second@example.invalid;+41790000002';
          await page.locator('#nl-wix-file').setInputFiles({
            name:'Wix_Demo_Nur_Testdaten.csv',mimeType:'text/csv',
            buffer:Buffer.from(importFile.replace(/\\n/g,'\n'))
          });
          assert.equal(await page.locator('#nl-wix-import').isDisabled(),true,
            'import disabled until preview and explicit approval');
          await page.locator('#nl-wix-preview').click();
          await page.waitForFunction(()=>!document.getElementById('nl-wix-summary').hidden);
          const summary=await page.locator('#nl-wix-summary').textContent();
          assert.ok(summary.includes('2 geeignete Kontakte'),summary);
          assert.ok(summary.includes('Noch keine Daten importiert'),summary);
          assert.equal(await page.locator('#nl-wix-import').isDisabled(),true,
            'preview alone cannot grant consent');
          const disabledOpacity=await page.locator('#nl-wix-import').evaluate(
            el=>parseFloat(getComputedStyle(el).opacity));
          assert.ok(disabledOpacity<.7,'unapproved import must visually appear disabled');
          await page.locator('#nl-wix-consent').check();
          assert.equal(await page.locator('#nl-wix-import').isEnabled(),true);
          const enabledOpacity=await page.locator('#nl-wix-import').evaluate(
            el=>parseFloat(getComputedStyle(el).opacity));
          assert.ok(enabledOpacity>disabledOpacity,
            'approved import action must have a distinct visual enabled state');
          await page.locator('#nl-wix-file').setInputFiles({
            name:'Wix_Demo_Geaendert.csv',mimeType:'text/csv',
            buffer:Buffer.from('Email,Name\\nchanged@example.invalid,Neue Person'.replace(/\\n/g,'\n'))
          });
          assert.equal(await page.locator('#nl-wix-import').isDisabled(),true,
            'changing CSV invalidates prior preview');
          console.log('PASS',device.name,'Wix migration preview, consent and stale-file guards');
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

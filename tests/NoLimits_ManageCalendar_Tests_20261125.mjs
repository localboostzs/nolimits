import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../assets/js/manage.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../termin-verwalten/index.html',import.meta.url),'utf8');
class Element {
  constructor(){this.children=[];this.events={};this.attrs={};this.hidden=false;this.disabled=false;this.checked=false;this.value='';this.classList={add(){},remove(){},toggle(){}};}
  set textContent(v){this.text=String(v);this.children=[];}
  get textContent(){return this.text||'';}
  appendChild(x){this.children.push(x);return x;}
  append(...x){this.children.push(...x);}
  replaceChildren(...x){this.children=x;this.text='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,v){this.events[k]=v;}
  querySelectorAll(s){return this.children.filter(x=>s==='button'?x.tag==='button':false);}
  querySelector(s){return this.children.find(x=>s==='[aria-pressed=true]'&&x.attrs['aria-pressed']==='true');}
  focus(){}
  scrollIntoView(){}
  async fire(k){return this.events[k]?.call(this,{preventDefault(){}});}
}
const els=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],new Element()]));
const $=id=>els[id];
const now=Date.UTC(2026,10,25,12);
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const requests=[];
const next='2026-12-08T18:45:00+01:00';
let fail=false;
let delayed=null;
const fakeFetch=async(url,opts)=>{
  const u=new URL(url);requests.push({u,opts});
  let body;
  if(u.pathname==='/api/manage')body={ok:true,booking:{service:'Augenbrauen',serviceKey:'augenbrauen',start:'2026-12-01T18:45:00+01:00',minutes:15,price:15,status:'accepted',canManage:true}};
  else if(u.pathname==='/api/manage/slots'){
    if(fail){fail=false;return {ok:false,json:async()=>({ok:false,error:{message:'Offline'}})};}
    if(delayed){const wait=delayed;delayed=null;await wait;}
    body={ok:true,days:{'2026-11-24':['2026-11-24T18:00:00+01:00'],'2026-11-26':[],'2026-12-01':[], '2026-12-08':[next,next,'not-a-time'],'2026-12-09':['2026-12-08T18:45:00+01:00']}};
  }else if(u.pathname==='/api/manage/reschedule')body={ok:true,booking:{start:next}};
  else throw Error('unexpected '+u.pathname);
  return {ok:true,json:async()=>body};
};
const context={window:{NOLIMITS_BOOKING:{API_BASE:'https://mock.invalid'}},document:{getElementById:$,createElement(tag){const e=new Element();e.tag=tag;return e;},querySelectorAll(){return[];}},Date:FixedDate,Intl,URL,location:{href:'https://mock.invalid/termin-verwalten/?uid=test&token=mock',pathname:'/termin-verwalten/'},sessionStorage:{setItem(){},getItem(){return null;}},history:{replaceState(){}},fetch:fakeFetch};
vm.runInNewContext(script,context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
await tick();
await $('nl-manage-show-reschedule').fire('click');await tick();
const activeDays=()=>$('nl-manage-calendar').children.filter(x=>x.tag==='button'&&!x.disabled);
assert.equal(activeDays().length,0,'past/empty/out-of-month days disabled');
assert.equal($('nl-manage-reschedule-submit').disabled,true);
assert.equal($('nl-manage-slots').hidden,true);
await $('nl-manage-next').fire('click');await tick();
assert.deepEqual(activeDays().map(x=>x.textContent),['8']);
assert.match(activeDays()[0].className,/bk-day is-free/);
await activeDays()[0].fire('click');
const slot=$('nl-manage-slots').children[1].children[0];
assert.equal($('nl-manage-slots').children[1].children.length,1);
assert.match(slot.className,/bk-slot/);
await slot.fire('click');
assert.equal($('nl-manage-reschedule-submit').disabled,true);
$('nl-manage-confirm-reschedule').checked=true;
await $('nl-manage-confirm-reschedule').fire('change');
assert.equal($('nl-manage-reschedule-submit').disabled,false);
await $('nl-manage-prev').fire('click');await tick();
assert.equal($('nl-manage-reschedule-submit').disabled,true,'month change clears selection');
assert.equal($('nl-manage-slots').hidden,true);
await $('nl-manage-reschedule').fire('submit');
assert.equal(requests.filter(x=>x.opts.method==='POST').length,0);
fail=true;await $('nl-manage-next').fire('click');await tick();
assert.equal(activeDays().length,0,'failed fetch never enables a date');
assert.match($('nl-manage-calendar-note').textContent,/Offline/);
await $('nl-manage-calendar-note').children[0].fire('click');await tick();
assert.equal(activeDays().length,1);
await activeDays()[0].fire('click');
await $('nl-manage-slots').children[1].children[0].fire('click');
await $('nl-manage-reschedule').fire('submit');await tick();
const posts=requests.filter(x=>x.opts.method==='POST');
assert.equal(posts.length,1);
assert.deepEqual(JSON.parse(posts[0].opts.body),{uid:'test',token:'mock',confirm:true,start:next});
assert.equal($('nl-manage-result').hidden,false);
assert.match($('nl-manage-result-title').textContent,/verschoben/);
assert.match(html,/booking\.css/);
assert.doesNotMatch(html,/type="date"/);
console.log('PASS: offline management calendar – disabled dates, slot validation, selection reset, retry, confirmation and one mock POST');

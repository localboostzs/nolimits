/**
 * NoLimits Consent Manager: DOM/storage checks without browser/network deps.
 * Run from repo root: node tests/NoLimits_CookieBanner_Tests_20261115.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../assets/js/privacy.js', import.meta.url),'utf8');
const authKey = 'sb-jcctdjjunxmxaphjkrsz-auth-token';
const choiceKey = 'nl_privacy_options_v1';
class Storage {
  constructor(){ this.values = new Map(); }
  get length(){ return this.values.size; }
  key(i){ return [...this.values.keys()][i] ?? null; }
  getItem(k){ return this.values.has(k) ? this.values.get(k) : null; }
  setItem(k,v){ this.values.set(String(k),String(v)); }
  removeItem(k){ this.values.delete(String(k)); }
}
class Element {
  constructor(tag){ this.tag=tag; this.attrs=new Map();this.children=[];this.events={};this.hidden=false;this.className='';this.parentNode=null;this.textContent=''; }
  setAttribute(k,v){ this.attrs.set(k,String(v)); }
  getAttribute(k){ return this.attrs.get(k)??null; }
  hasAttribute(k){ return this.attrs.has(k); }
  append(...items){for(const x of items) this.appendChild(x);}
  appendChild(x){this.children.push(x);x.parentNode=this;return x;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
  addEventListener(ev,fn){this.events[ev]=fn;}
  focus(){}
  querySelector(q){return this.children.find(c=>q[0]==='.'?c.className.split(' ').includes(q.slice(1)):c.tag===q)||null;}
}
function walk(root,fn) {
  if(fn(root))return root;
  for(const c of root.children){const found=walk(c,fn);if(found)return found;}
  return null;
}
function boot(local=new Storage(),session=new Storage()){
  const body=new Element('body'),footer=new Element('footer');
  const map=new Element('div'),iframe=new Element('iframe');
  iframe.setAttribute('data-nl-map-src','https://www.google.com/maps?q=test');
  map.appendChild(iframe);
  let ready;
  const doc={
    currentScript:{src:'https://localboostzs.github.io/nolimits/assets/js/privacy.js'},
    readyState:'loading',body,
    addEventListener(type,fn){if(type==='DOMContentLoaded')ready=fn;},
    createElement(tag){return new Element(tag);},
    querySelectorAll(q){return q==='iframe[data-nl-map-src]'?[iframe]:[];},
    querySelector(q){return q==='.footer-bottom'?footer:null;}
  };
  const win={localStorage:local,sessionStorage:session,dispatchEvent(){},};
  const ctx={window:win,document:doc,URL,CustomEvent:class{constructor(n,x){this.type=n;this.detail=x.detail;}}};
  vm.runInNewContext(source,ctx,{filename:'privacy.js',timeout:3000});
  ready();
  return {local,session,win,body,footer,map,iframe,privacy:win.NOLIMITS_PRIVACY};
}
function click(root,txt) {
  const el=walk(root,e=>e.textContent===txt && !!e.events.click);
  assert.ok(el,'Missing clickable text: '+txt);
  el.events.click();
}
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS',name);}

let local=new Storage(),session=new Storage();
local.setItem(authKey,'legacy-token');
let b=boot(local,session);
test('Ohne vorherige Einwilligung alte Local-Auth-Token entfernen',()=>assert.equal(local.getItem(authKey),null));
test('Bei Erstbesuch Banner sichtbar',()=>assert.equal(b.body.children[0].hidden,false));
test('Google Maps vor Einwilligung hat keine externe src',()=>{
  assert.equal(b.iframe.hasAttribute('src'),false);
  assert.ok(b.map.querySelector('.nl-map-blocker'));
});
b.privacy.authStorage.setItem(authKey,'temporary-session');
test('Vor Einwilligung nur Browser-Tab-Speicher',()=>{
 assert.equal(session.getItem(authKey),'temporary-session');
 assert.equal(local.getItem(authKey),null);
});
click(b.body,'Alle akzeptieren');
test('Akzeptieren speichert Login im dauerhaften Speicher',()=>{
 assert.equal(local.getItem(authKey),'temporary-session');
 assert.equal(session.getItem(authKey),null);
 assert.equal(b.privacy.get().persistentLogin,true);
 assert.equal(b.body.children[0].hidden,true);
});
test('Akzeptieren lädt Google Maps',()=>assert.ok(b.iframe.getAttribute('src').startsWith('https://www.google.com/')));
b=boot(local,new Storage());
test('Nach erneutem Besuch bleibt Login bei Akzeptieren erhalten',()=>assert.equal(b.privacy.authStorage.getItem(authKey),'temporary-session'));
click(b.footer,'Cookie-Einstellungen');
test('Footer öffnet Einstellungen erneut',()=>assert.equal(b.body.children[0].hidden,false));
click(b.body,'Alle ablehnen');
test('Ablehnen verschiebt Login aus dauerhaftem Speicher in den Tab',()=>{
 assert.equal(local.getItem(authKey),null);
 assert.equal(b.session.getItem(authKey),'temporary-session');
 assert.equal(b.privacy.get().persistentLogin,false);
});
test('Ablehnen deaktiviert Google Maps wieder',()=>assert.equal(b.iframe.getAttribute('src'),'about:blank'));
b=boot(local,new Storage());
test('Neuer Browser-Tab nach Ablehnen ist abgemeldet',()=>assert.equal(b.privacy.authStorage.getItem(authKey),null));
test('Ablehnen bleibt als Präferenz gespeichert',()=>{
 assert.equal(b.privacy.get().persistentLogin,false);
 assert.equal(b.body.children[0].hidden,true);
});
click(b.footer,'Cookie-Einstellungen');
click(b.body,'Anpassen');
const optInputs=[];
function collectInput(el){
 if(el.tag==='input')optInputs.push(el);
 for(const c of el.children)collectInput(c);
}
collectInput(b.body);
assert.equal(optInputs.length,2);
optInputs[0].checked=false;
optInputs[1].checked=true;
click(b.body,'Auswahl speichern');
test('Separate Karten-Einwilligung ohne dauerhaften Login',()=>{
 assert.equal(b.privacy.get().persistentLogin,false);
 assert.equal(b.privacy.get().googleMaps,true);
 assert.equal(b.privacy.authStorage.getItem(authKey),null);
});
b.privacy.authStorage.setItem(authKey,'short-session');
test('Auch bei Google-Maps-Zustimmung bleibt Login ohne Speicher-Zustimmung temporär',()=>{
 assert.equal(local.getItem(authKey),null);
 assert.equal(b.session.getItem(authKey),'short-session');
});
b.privacy.authStorage.removeItem(authKey);
test('Abmelden entfernt Token aus beiden Speicherarten',()=>{
 assert.equal(local.getItem(authKey),null);
 assert.equal(b.session.getItem(authKey),null);
});
console.log('Alle '+tests+' Cookie-Banner- und Speicher-Tests erfolgreich.');

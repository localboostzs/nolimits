
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const els=new Map(), handlers={};
function el(id) {if(!els.has(id))els.set(id,{hidden:id==='nl-login',clientWidth:340,
 textContent:'',classList:{toggle(){}},replaceChildren(){this.children=[]},children:[],
 set textContent(t){this._text=t},get textContent(){return this._text||''}});
 return els.get(id)}
const state={loadCount:0,signins:0,dispatched:[],disableAutoSelect:0};
let cb,config,renderOpts,renderTarget;
const google={accounts:{id:{
 initialize(o){config=o},renderButton(target,opts){renderTarget=target;renderOpts=opts;target.children.push('google-official-button')},
 disableAutoSelect(){state.disableAutoSelect++;}}}};
const mockAuth={enabled:true,client:{auth:{signInWithIdToken:async o=>{state.signins++;state.signin=o;return {error:null}}}}};
const doc={
 getElementById:el,
 addEventListener(t,f){handlers[t]=f},
 dispatchEvent(event){state.dispatched.push(event.type);if(handlers[event.type])return handlers[event.type](event)},
 createElement(tag){assert.equal(tag,'script');state.loadCount++;return {async:false,onload:null,onerror:null,src:''}},
 head:{appendChild(script){assert.ok(script.src.includes('accounts.google.com/gsi/client'));setImmediate(()=>{ctx.window.google=google;script.onload()})}}
};
const ctx={window:{crypto:webcrypto,NOLIMITS_ACCOUNT:mockAuth},document:doc,
 CustomEvent:function(type){this.type=type},btoa,TextEncoder,Uint8Array,Array,Math,Promise,console};
vm.runInNewContext(fs.readFileSync(process.argv[2] || 'assets/js/NoLimits_GoogleLogin_20261117.js','utf8'),ctx);
function tick(){return new Promise(resolve=>setTimeout(resolve,20))}
(async()=>{
 assert.equal(state.loadCount,0,'No 3rd-party Google request until login view');
 assert.equal(config,undefined,'Google not initialized in authenticated view');
 el('nl-login').hidden=false;
 doc.dispatchEvent(new ctx.CustomEvent('nolimits-google-login-visible'));
 doc.dispatchEvent(new ctx.CustomEvent('nolimits-google-login-visible'));
 await tick();
 assert.equal(state.loadCount,1,'Google script loads once');
 assert.ok(config,'Google initialized on page readiness');
 assert.equal(renderTarget,el('nl-google-button-slot'));
 assert.equal(renderTarget.children.length,1,'One directly actionable official button');
 assert.equal(config.ux_mode,'popup');
 assert.equal(config.nonce.length,64,'SHA256 nonce');
 assert.equal(renderOpts.text,'continue_with');
 assert.equal(el('nl-social-note').hidden,true);
 await config.callback({credential:'fake-google-id-token'});
 assert.equal(state.signins,1);
 assert.equal(state.signin.provider,'google');
 const actual=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(state.signin.nonce))).toString('hex');
 assert.equal(actual,config.nonce);
 assert.equal(state.dispatched.includes('nolimits-google-id-success'),true);
 doc.dispatchEvent(new ctx.CustomEvent('nolimits-google-id-signout'));
 assert.equal(state.disableAutoSelect,1);
 assert.equal(state.loadCount,1);
 console.log('PASS one official clickable Google button; lazy on login view; nonce protected; success; signout; no duplicate');
})().catch(err=>{process.stderr.write(err.stack);process.exit(1)});

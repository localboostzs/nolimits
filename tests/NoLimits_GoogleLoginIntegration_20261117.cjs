
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const elements=new Map(),events={};
function elem(id) {
 if(!elements.has(id))elements.set(id,{
  hidden:id==='nl-google-button-slot',disabled:false,clientWidth:300,textContent:'',
  classList:{toggle(){}},firstChild:null,removeChild(){this.firstChild=null;},
  addEventListener(type,cb){this.callback=cb;}
 });
 return elements.get(id);
}
const captured={};
const google={accounts:{id:{
 initialize(o){captured.init=o},
 renderButton(el,opts){assert.equal(el.hidden,false,'button visible before rendering');captured.button=opts;captured.buttonTarget=el;el.firstChild={};},
 prompt(){captured.prompted=true;}
}}};
let shouldFail=false,signins=0,success=0;
const client={auth:{signInWithIdToken:async(o)=>{captured.signin=o;signins++;return {data:{user:{id:'synthetic-user'}},error:shouldFail?new Error('Mock login failure'):null}}}};
const doc={
 getElementById:elem,
 addEventListener(type,cb){events[type]=cb;},
 dispatchEvent(ev){if(ev.type==='nolimits-google-id-success')success++;if(events[ev.type])events[ev.type](ev);},
 createElement(){throw Error('Google library should not load a new script when mock is present');},
 head:{appendChild(){}}
};
const win={google,crypto:webcrypto,NOLIMITS_ACCOUNT:{enabled:true,client}};
const context={window:win,document:doc,CustomEvent:function(type){this.type=type},TextEncoder,Uint8Array,btoa,Promise,Array,Math};
vm.runInNewContext(fs.readFileSync(process.argv[2] || 'assets/js/NoLimits_GoogleLogin_20261117.js','utf8'),context);
assert.equal(win.NOLIMITS_GOOGLE_ID_ACTIVE,true);
assert.equal(captured.init,undefined,'No third-party library before user click');
(async()=>{
 await elem('nl-google-login').callback();
 assert.equal(captured.init.ux_mode,'popup');
 assert.ok(captured.init.client_id.endsWith('.apps.googleusercontent.com'));
 assert.equal(captured.buttonTarget,elem('nl-google-button-slot'));
 assert.equal(captured.init.nonce.length,64,'SHA256 nonce');
 assert.equal(captured.prompted,true,'offer prompt on user click');
 assert.equal(elem('nl-google-login').hidden,true);
 assert.equal(elem('nl-google-button-slot').hidden,false);
 await captured.init.callback({credential:'synthetic-jwt'});
 assert.equal(captured.signin.provider,'google');
 assert.equal(captured.signin.token,'synthetic-jwt');
 const got=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(captured.signin.nonce))).toString('hex');
 assert.equal(captured.init.nonce,got);
 assert.equal(success,1);
 assert.equal(elem('nl-google-login').hidden,false,'button restored for future signout');
 assert.equal(elem('nl-google-button-slot').hidden,true);
 assert.equal(elem('nl-google-login').disabled,false);
 doc.dispatchEvent(new context.CustomEvent('nolimits-google-id-signout'));
 assert.equal(elem('nl-google-login').hidden,false);
 shouldFail=true;
 await elem('nl-google-login').callback();
 await captured.init.callback({credential:'synthetic-jwt-again'});
 assert.equal(signins,2);
 assert.equal(success,1,'failed sign-in does not trigger success');
 assert.equal(elem('nl-google-login').hidden,false,'retry after failure works');
 assert.equal(elem('nl-social-note').hidden,false,'error explained');
 console.log('PASS: lazy Google load, nonce, render, prompt, correct Supabase ID token, auth success event, signout reset, retry on error');
})().catch(e=>{process.stderr.write(String(e.stack));process.exit(1)});

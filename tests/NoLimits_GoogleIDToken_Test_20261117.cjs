
const vm=require('node:vm'); const fs=require('node:fs'); const assert=require('node:assert/strict');
const {webcrypto,randomBytes}=require('node:crypto');
const elements=new Map();
function elem(id) {
 if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,clientWidth:300, textContent:'',style:{},classList:{toggle(){}},addEventListener(type,cb){this.callback=cb}});
 return elements.get(id);
}
const captured={};
const google={accounts:{id:{
 initialize(o){captured.init=o},
 renderButton(el,opts){captured.button=opts;captured.buttonTarget=el}
}}};
const client={auth:{signInWithIdToken:async(o)=>{captured.signin=o;return {data:{user:{id:'fake'}},error:null}}}};
const context={window:{google,crypto:webcrypto,NOLIMITS_ACCOUNT:{enabled:true,client}},
 document:{getElementById:elem,createElement(){throw Error('External script should not load when google mock available')},head:{appendChild(){}}},
 console:{log(){throw Error('No auth logs allowed')}},
 TextEncoder,Uint8Array,btoa,Promise,Array,Math};
vm.runInNewContext(fs.readFileSync(process.argv[2] || 'assets/js/NoLimits_GoogleLoginTest_20261117.js','utf8'),context);
(async ()=>{
 await elem('nl-gsi-load').callback();
 assert.equal(captured.init.ux_mode,'popup');
 assert.ok(captured.init.client_id.endsWith('.apps.googleusercontent.com'));
 assert.equal(captured.buttonTarget,elem('nl-gsi-button'));
 assert.equal(captured.init.nonce.length,64,'hashed SHA256 nonce in hex');
 await captured.init.callback({credential:'fake-jwt-not-real'});
 assert.equal(captured.signin.provider,'google');
 assert.equal(captured.signin.token,'fake-jwt-not-real');
 assert.ok(captured.signin.nonce.length>32);
 let hashed=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(captured.signin.nonce))).toString('hex');
 assert.equal(captured.init.nonce,hashed);
 assert.equal(elem('nl-gsi-result').hidden,false);
 assert.equal(elem('nl-gsi-button').hidden,true);
 console.log('PASS button, verified SHA-256 nonce handoff, Supabase signInWithIdToken, no page redirects or token logs');
})().catch(e=>{process.stderr.write(String(e.stack));process.exit(1)});

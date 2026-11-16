(function(){
  'use strict';
  var apiBase = window.NOLIMITS_BOOKING && window.NOLIMITS_BOOKING.API_BASE;
  var key='nl-manage-link';
  var uid='',token='',booking=null,selectedStart='';
  function $(id){return document.getElementById(id);}
  function setMessage(text,error){
    var el=$('nl-manage-msg');el.textContent=text||'';el.hidden=!text;el.classList.toggle('error',!!error);
  }
  function fmt(iso){return new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',dateStyle:'full',timeStyle:'short'}).format(new Date(iso))+' Uhr';}
  function time(iso){return new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
  function show(id){
    ['nl-manage-loading','nl-manage-unavailable','nl-manage-missing','nl-manage-details'].forEach(function(name){$(name).hidden=name!==id;});
  }
  async function request(path,opts){
    var r=await fetch(apiBase+path,Object.assign({cache:'no-store',referrerPolicy:'no-referrer'},opts||{}));
    var body=await r.json().catch(function(){return null;});
    if(!r.ok || !body || !body.ok)throw new Error(body&&body.error&&body.error.message||'Die Verbindung konnte nicht hergestellt werden.');
    return body;
  }
  function params(){return 'uid='+encodeURIComponent(uid)+'&token='+encodeURIComponent(token);}
  function collapse(){
    $('nl-manage-cancel').hidden=true;$('nl-manage-reschedule').hidden=true;
    setMessage('');
  }
  function render(b){
    booking=b;show('nl-manage-details');
    $('nl-manage-service').textContent=b.service;
    $('nl-manage-status').textContent=b.status==='accepted'?'Termin bestätigt':b.status==='cancelled'?'Termin storniert':'Status: '+b.status;
    $('nl-manage-time').textContent=fmt(b.start);
    $('nl-manage-duration').textContent=b.minutes+' Minuten';
    $('nl-manage-price').textContent=b.price==null?'Vor Ort':('CHF '+b.price+' · vor Ort');
    $('nl-manage-actions').hidden=!b.canManage;
    $('nl-manage-result').hidden=true;
    if(!b.canManage)setMessage('Dieser Termin kann nicht mehr online geändert werden. Bei Fragen kontaktiere bitte NoLimits.',false);
  }
  async function load(){
    setMessage('');
    try {render((await request('/api/manage?'+params())).booking);}
    catch(e){show('nl-manage-unavailable');setMessage(e.message,true);}
  }
  function pickSlots(d){
    var list=$('nl-manage-slots');list.replaceChildren();
    var slots=Object.values(d.days||{}).flatMap(function(a){return a});
    if(!slots.length){list.textContent='Für dieses Datum sind keine freien Termine verfügbar.';return;}
    var head=document.createElement('p');head.textContent='Freie Uhrzeiten auswählen:';
    var grid=document.createElement('div');grid.className='nl-manage-slots-grid';
    slots.forEach(function(start){
      var b=document.createElement('button');b.type='button';b.className='nl-manage-slot';
      b.textContent=time(start);b.setAttribute('aria-pressed','false');
      b.addEventListener('click',function(){
        selectedStart=start;$('nl-manage-selected-start').value=start;
        grid.querySelectorAll('button').forEach(function(el){el.setAttribute('aria-pressed',el===b?'true':'false');});
      });
      grid.appendChild(b);
    });
    list.append(head,grid);
  }
  async function updateSlots(){
    selectedStart='';$('nl-manage-selected-start').value='';
    var date=$('nl-manage-date').value;
    if(!date)return;
    var list=$('nl-manage-slots');list.textContent='Verfügbare Uhrzeiten werden geladen …';
    try{
      var d=await request('/api/manage/slots?'+params()+'&service='+encodeURIComponent(booking.serviceKey)+'&start='+date+'&end='+date);
      pickSlots(d);
    }catch(e){list.textContent='Freie Zeiten konnten nicht geladen werden: '+e.message;}
  }
  function done(title,description){
    collapse();$('nl-manage-actions').hidden=true;
    $('nl-manage-result').hidden=false;
    $('nl-manage-result-title').textContent=title;
    $('nl-manage-result-message').textContent=description;
    $('nl-manage-details').scrollIntoView({block:'start'});
  }
  $('nl-manage-show-cancel').addEventListener('click',function(){
    collapse();$('nl-manage-cancel').hidden=false;
    $('nl-manage-confirm-cancel').checked=false;
  });
  $('nl-manage-show-reschedule').addEventListener('click',function(){
    collapse();$('nl-manage-reschedule').hidden=false;
    $('nl-manage-confirm-reschedule').checked=false;
    var iso=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Zurich'});
    $('nl-manage-date').min=/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso:new Date().toISOString().slice(0,10);
    $('nl-manage-date').max=new Date(Date.now()+366*86400000).toISOString().slice(0,10);
  });
  document.querySelectorAll('[data-dismiss]').forEach(function(el){el.addEventListener('click',collapse);});
  $('nl-manage-date').addEventListener('change',updateSlots);
  $('nl-manage-cancel').addEventListener('submit',async function(e){
    e.preventDefault();if(!$('nl-manage-confirm-cancel').checked)return;
    var b=this.querySelector('[type=submit]');b.disabled=true;setMessage('');
    try{
      await request('/api/manage/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        uid:uid,token:token,confirm:true,reason:$('nl-manage-reason').value.trim()
      })});
      done('Dein Termin wurde storniert','Der Termin ist jetzt abgesagt. Du erhältst eine Bestätigung über die eingerichteten Benachrichtigungen.');
    }catch(err){setMessage(err.message,true);}finally{b.disabled=false;}
  });
  $('nl-manage-reschedule').addEventListener('submit',async function(e){
    e.preventDefault();
    if(!selectedStart){setMessage('Bitte wähle zuerst eine freie Uhrzeit.',true);return;}
    if(!$('nl-manage-confirm-reschedule').checked)return;
    var b=$('nl-manage-reschedule-submit');b.disabled=true;setMessage('');
    try{
      var out=await request('/api/manage/reschedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        uid:uid,token:token,confirm:true,start:selectedStart
      })});
      var desc='Der neue Termin beginnt am '+fmt(out.booking.start)+'. Eine neue Buchungsbestätigung wird über die eingerichteten Benachrichtigungen versendet.';
      if(out.booking.manageUrl){
        var u=new URL(out.booking.manageUrl);
        uid=u.searchParams.get('uid');token=u.searchParams.get('token');
        sessionStorage.setItem(key,JSON.stringify({uid:uid,token:token}));
      }
      done('Dein Termin wurde verschoben',desc);
    }catch(err){setMessage(err.message,true);}finally{b.disabled=false;}
  });
  try{
    var url=new URL(location.href);
    uid=url.searchParams.get('uid')||'';token=url.searchParams.get('token')||'';
    if(uid && token){
      sessionStorage.setItem(key,JSON.stringify({uid:uid,token:token}));
      history.replaceState(history.state,'',location.pathname);
    }else{
      var saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(saved){uid=saved.uid;token=saved.token;}
    }
  }catch(_){/* Private tab can disable storage; token remains in URL. */}
  if(!apiBase || !uid || !token)show('nl-manage-missing');
  else load();
})();
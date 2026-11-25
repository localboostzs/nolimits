(function(){
  'use strict';
  var apiBase = window.NOLIMITS_BOOKING && window.NOLIMITS_BOOKING.API_BASE;
  var key='nl-manage-link';
  var uid='',token='',booking=null,selectedStart='',calendarMonth=null,monthDays={},selectedDay='',monthRequest=0;
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
  function showCancelled(){
    // Nach einer Stornierung ausschliesslich die Abschlussbestätigung anzeigen:
    // keine alten Termindetails, Gebührenhinweise oder Aktionsbuttons.
    collapse();
    $('nl-manage-details').classList.add('is-cancelled');
    $('nl-manage-status').textContent='Termin wurde storniert';
    $('nl-manage-actions').hidden=true;
    $('nl-manage-result').hidden=false;
    $('nl-manage-result-title').textContent='Dein Termin wurde storniert';
    $('nl-manage-result-message').textContent='Der Termin ist jetzt abgesagt. Du erhältst eine Bestätigung über die eingerichteten Benachrichtigungen.';
    setMessage('');
    show('nl-manage-details');
  }
  function render(b){
    booking=b;
    if(b.status==='cancelled'){showCancelled();return;}
    $('nl-manage-details').classList.remove('is-cancelled');
    show('nl-manage-details');
    $('nl-manage-service').textContent=b.service;
    $('nl-manage-status').textContent=b.status==='accepted'?'Termin bestätigt':'Status: '+b.status;
    $('nl-manage-time').textContent=fmt(b.start);
    $('nl-manage-duration').textContent=b.minutes+' Minuten';
    $('nl-manage-price').textContent=b.price==null?'Vor Ort':('CHF '+b.price+' · vor Ort');
    $('nl-manage-actions').hidden=!b.canManage;
    // Nur ausblenden, wenn der Worker ausdruecklich false meldet. Der fruehere Worker (Rollback)
    // liefert diese Felder nicht; dort entscheidet canManage und der Server prueft selbst.
    $('nl-manage-show-cancel').hidden=b.canCancel===false;
    $('nl-manage-show-reschedule').hidden=b.canReschedule===false;
    $('nl-manage-result').hidden=true;
    if(!b.canManage)setMessage('Dieser Termin kann nicht mehr online geändert werden. Bei Fragen kontaktiere bitte NoLimits.',false);
  }
  async function load(){
    setMessage('');
    try {render((await request('/api/manage?'+params())).booking);}
    catch(e){show('nl-manage-unavailable');setMessage(e.message,true);}
  }
  function zDate(date){
    var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    function v(k){return p.find(function(x){return x.type===k;}).value;}
    return v('year')+'-'+v('month')+'-'+v('day');
  }
  function monthNum(y,m){return y*12+m;}
  function currentMonth(){var d=zDate(new Date());return {y:Number(d.slice(0,4)),m:Number(d.slice(5,7))-1};}
  function dateInMonth(day){return calendarMonth.y+'-'+String(calendarMonth.m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
  function clearChosen(){selectedDay='';selectedStart='';$('nl-manage-selected-start').value='';$('nl-manage-slots').replaceChildren();}
  function renderDaySlots(){
    var list=$('nl-manage-slots');list.replaceChildren();
    var slots=monthDays[selectedDay]||[];
    if(!slots.length){list.textContent='Für diesen Tag sind keine freien Termine verfügbar.';return;}
    var head=document.createElement('p');head.textContent='Freie Uhrzeiten auswählen:';
    var grid=document.createElement('div');grid.className='nl-manage-slots-grid';
    slots.forEach(function(start){
      var b=document.createElement('button');b.type='button';b.className='nl-manage-slot';
      b.textContent=time(start);b.setAttribute('aria-pressed',String(selectedStart===start));
      b.addEventListener('click',function(){
        selectedStart=start;$('nl-manage-selected-start').value=start;
        grid.querySelectorAll('button').forEach(function(el){el.setAttribute('aria-pressed',el===b?'true':'false');});
      });
      grid.appendChild(b);
    });
    list.append(head,grid);
  }
  function paintMonth(){
    var here=currentMonth(),number=monthNum(calendarMonth.y,calendarMonth.m),firstAllowed=monthNum(here.y,here.m);
    $('nl-manage-prev').disabled=number<=firstAllowed;
    $('nl-manage-next').disabled=number>=firstAllowed+2;
    $('nl-manage-month').textContent=new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(calendarMonth.y,calendarMonth.m,1)));
    var el=$('nl-manage-calendar');el.replaceChildren();
    var firstDay=(new Date(Date.UTC(calendarMonth.y,calendarMonth.m,1)).getUTCDay()+6)%7;
    for(var n=0;n<firstDay;n++){var empty=document.createElement('span');empty.className='nl-manage-month-empty';empty.setAttribute('aria-hidden','true');el.appendChild(empty);}
    var last=new Date(Date.UTC(calendarMonth.y,calendarMonth.m+1,0)).getUTCDate();
    for(var day=1;day<=last;day++){
      var key=dateInMonth(day),b=document.createElement('button');
      b.type='button';b.className='nl-manage-day';b.textContent=day;
      b.disabled=key<zDate(new Date()) || !(monthDays[key]||[]).length;
      b.setAttribute('aria-label',new Intl.DateTimeFormat('de-CH',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z')));
      b.setAttribute('aria-pressed',String(selectedDay===key));
      (function(dateKey){b.addEventListener('click',function(){clearChosen();selectedDay=dateKey;paintMonth();renderDaySlots();});})(key);
      el.appendChild(b);
    }
  }
  async function loadMonth(){
    var requestId=++monthRequest;
    clearChosen();monthDays={};paintMonth();
    var container=$('nl-manage-slots');container.textContent='Freie Tage werden geladen …';
    var first=dateInMonth(1),last=dateInMonth(new Date(Date.UTC(calendarMonth.y,calendarMonth.m+1,0)).getUTCDate());
    try{
      var d=await request('/api/manage/slots?'+params()+'&service='+encodeURIComponent(booking.serviceKey)+'&start='+first+'&end='+last);
      if(requestId!==monthRequest)return;
      monthDays=d.days||{};container.textContent='Bitte zuerst einen freien Tag im Kalender auswählen.';
      paintMonth();
    }catch(e){if(requestId===monthRequest)container.textContent='Kalender konnte nicht geladen werden: '+e.message;}
  }
  function moveMonth(delta){
    var d=new Date(Date.UTC(calendarMonth.y,calendarMonth.m+delta,1));
    calendarMonth={y:d.getUTCFullYear(),m:d.getUTCMonth()};
    loadMonth();
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
    calendarMonth=currentMonth();
    loadMonth();
  });
  document.querySelectorAll('[data-dismiss]').forEach(function(el){el.addEventListener('click',collapse);});
  $('nl-manage-prev').addEventListener('click',function(){moveMonth(-1);});
  $('nl-manage-next').addEventListener('click',function(){moveMonth(1);});
  $('nl-manage-cancel').addEventListener('submit',async function(e){
    e.preventDefault();if(!$('nl-manage-confirm-cancel').checked)return;
    var b=this.querySelector('[type=submit]');b.disabled=true;setMessage('');
    try{
      await request('/api/manage/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        uid:uid,token:token,confirm:true,reason:$('nl-manage-reason').value.trim()
      })});
      showCancelled();
      $('nl-manage-details').scrollIntoView({block:'start'});
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
      // Nach der Umbuchung keine veraltete Uhrzeit mehr anzeigen.
      $('nl-manage-status').textContent='Termin verschoben';
      $('nl-manage-time').textContent=fmt(out.booking.start);
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
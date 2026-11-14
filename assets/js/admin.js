/* NoLimits staff dashboard. Never stores Cal API tokens in the browser.
   Every sensitive API request is protected again by server-side Supabase token and RLS checks. */
(function(){
  'use strict';
  var A=window.NOLIMITS_ACCOUNT;
  var API=(window.NOLIMITS_BOOKING&&window.NOLIMITS_BOOKING.API_BASE||'').replace(/\/$/,'');
  var gate=document.getElementById('nl-gate'), desk=document.getElementById('nl-desk'),
      notice=document.getElementById('nl-admin-notice');
  var list=document.getElementById('nl-contacts'), info=document.getElementById('nl-info'),
      search=document.getElementById('nl-search'), form=document.getElementById('nl-admin-book-form');
  var services=document.getElementById('nl-admin-service'), date=document.getElementById('nl-admin-date'),
      slots=document.getElementById('nl-admin-slot');
  var contacts=[], selected=null, loadedServices=[];
  function msg(text,error){ notice.textContent=text;notice.hidden=!text;notice.classList.toggle('error',!!error); }
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function fmt(date){try{return new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(date));}catch(e){return date||'';}}
  async function request(path,opts){
    var token=await A.bearer();if(!token)throw new Error('Sitzung abgelaufen – bitte erneut anmelden.');
    var options=Object.assign({method:'GET',cache:'no-store'},opts||{});
    options.headers=Object.assign({'Authorization':'Bearer '+token,'Content-Type':'application/json'},options.headers||{});
    var r=await fetch(API+path,options),json=await r.json().catch(function(){return null;});
    if(!r.ok||!json||json.ok===false)throw new Error(json&&json.error&&json.error.message||'Anfrage fehlgeschlagen.');
    return json;
  }
  function makeAppt(b){
    var p=el('div','nl-appt'),s=el('strong',null,(b.service||'Termin'));
    var small=el('small',null,fmt(b.start)+' · '+(b.status||''));
    p.append(s,small);return p;
  }
  function displayContact(c){
    selected=c;info.replaceChildren();
    if(!c){info.appendChild(el('p',null,'Wähle links einen Kunden aus.'));return;}
    info.append(el('h2',null,c.name||c.email),el('p',null,c.email+(c.phone?' · '+c.phone:'')));
    info.appendChild(el('h3',null,'Kommende Termine'));
    if(!c.upcoming.length)info.appendChild(el('p','nl-small','Keine kommenden Termine.'));
    c.upcoming.forEach(function(x){info.appendChild(makeAppt(x));});
    info.appendChild(el('h3',null,'Vergangene Termine'));
    if(!c.past.length)info.appendChild(el('p','nl-small','Keine vergangenen Termine.'));
    c.past.slice(0,12).forEach(function(x){info.appendChild(makeAppt(x));});
    form.elements.name.value=c.name||'';form.elements.email.value=c.email||'';
    form.elements.phone.value=c.phone||'';renderContacts();
  }
  function renderContacts(){
    var q=search.value.trim().toLowerCase();list.replaceChildren();
    var matches=contacts.filter(function(c){return (c.name+' '+c.email+' '+(c.phone||'')).toLowerCase().includes(q);});
    document.getElementById('nl-contact-count').textContent=matches.length+' Kontakte';
    if(!matches.length){list.appendChild(el('p','nl-small','Keine Kontakte gefunden.'));return;}
    matches.forEach(function(c){
      var b=el('button','nl-contact');b.type='button';
      b.setAttribute('aria-pressed',selected&&selected.email===c.email?'true':'false');
      b.append(el('strong',null,c.name||c.email),el('span',null,c.email));
      b.addEventListener('click',function(){displayContact(c);});
      list.appendChild(b);
    });
  }
  async function loadSlots(){
    slots.replaceChildren();slots.appendChild(new Option('Zuerst Leistung und Datum auswählen',''));
    if(!services.value||!date.value)return;
    slots.disabled=true;
    try{
      var q='?service='+encodeURIComponent(services.value)+'&start='+date.value+'&end='+date.value;
      var result=await request('/api/admin/slots'+q);
      var available=result.days&&result.days[date.value]||[];
      slots.replaceChildren();
      slots.appendChild(new Option(available.length?'Uhrzeit auswählen':'Keine freien Zeiten',''));
      available.forEach(function(s){slots.appendChild(new Option(fmt(s).split(', ').pop(),s));});
      if(!available.length)msg('Für diesen Tag sind keine freien Zeiten vorhanden.');
      else msg('');
    }catch(e){msg(e.message,true);}
    finally{slots.disabled=false;}
  }
  async function loadData(){
    msg('');
    try{
      var r=await Promise.all([request('/api/admin/services'),request('/api/admin/contacts')]);
      loadedServices=r[0].services||[];
      services.replaceChildren();services.appendChild(new Option('Leistung auswählen',''));
      loadedServices.forEach(function(s){services.appendChild(new Option(s.name+' · '+s.minutes+' Min · CHF '+s.price,s.key));});
      contacts=r[1].contacts||[];renderContacts();
      if(selected){var found=contacts.find(function(c){return c.email===selected.email;});displayContact(found||null);}
    }catch(e){msg(e.message,true);}
  }
  // CSV-Verarbeitung erfolgt vollständig im Browser, der Import nur nach Freigabe.
  function csvParse(input, delim) {
    var rows=[],r=[],cell='',quoted=false;
    for(var i=0;i<input.length;i++){
      var c=input[i];
      if(c==='"'){
        if(quoted && input[i+1]==='"'){cell+='"';i++;}
        else quoted=!quoted;
      } else if(c===delim && !quoted){r.push(cell);cell='';}
      else if((c==='\n'||c==='\r') && !quoted){
        r.push(cell);if(r.some(function(x){return x.trim();}))rows.push(r);
        r=[];cell='';if(c==='\r'&&input[i+1]==='\n')i++;
      } else cell+=c;
    }
    r.push(cell);if(r.some(function(x){return x.trim();}))rows.push(r);
    return rows;
  }
  function norm(h){
    return String(h||'').replace(/^\uFEFF/,'').toLowerCase()
      .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]/g,'');
  }
  document.getElementById('nl-wix-import').addEventListener('click',async function(){
    var file=document.getElementById('nl-wix-file').files[0],
      consent=document.getElementById('nl-wix-consent').checked,
      button=document.getElementById('nl-wix-import');
    if(!consent){msg('Bitte zuerst die ausdrückliche Einwilligung von Isen bestätigen.',true);return;}
    if(!file){msg('Bitte eine Wix-CSV-Datei auswählen.',true);return;}
    if(file.size>5*1024*1024){msg('Die Datei ist zu gross (max. 5 MB).',true);return;}
    button.disabled=true;
    try {
      if(!await A.staff())throw new Error('Keine Verwaltungsberechtigung.');
      var data=await file.text();
      var lines=data.split(/\r?\n/,1)[0];
      var delim=(lines.match(/;/g)||[]).length>(lines.match(/,/g)||[]).length?';':',';
      var rows=csvParse(data,delim);
      if(rows.length<2)throw new Error('Keine Kontaktdaten gefunden.');
      var head=rows.shift().map(norm);
      function get(row, aliases){
        for(var k of aliases){var idx=head.indexOf(k);if(idx>=0&&row[idx])return row[idx].trim();}
        return '';
      }
      var valid=[],seen=new Set();
      for(var row of rows.slice(0,2000)){
        var email=get(row,['email','emailaddress','primaryemail','emails','emailadresse','email1']).toLowerCase().slice(0,120);
        var phone=get(row,['phone','phonenumber','telefon','telephone','mobile','handynummer','primaryphone']).slice(0,30);
        var id=get(row,['contactid','wixcontactid','id','contactsid']);
        var first=get(row,['firstname','vorname','givenname']);
        var last=get(row,['lastname','nachname','surname','familyname']);
        var name=get(row,['name','displayname','fullname','contactname'])||[first,last].filter(Boolean).join(' ');
        var external=(id?'wix:':email?'email:':'phone:')+(id||email||phone);
        if(!id&&!email&&!phone||seen.has(external))continue;
        seen.add(external);
        valid.push({source:'wix',external_id:external.slice(0,180),name:(name||email||phone).slice(0,100),email,phone});
      }
      if(!valid.length)throw new Error('Keine geeigneten Kontaktspalten erkannt. Bitte Wix-CSV prüfen.');
      for(var i=0;i<valid.length;i+=50){
        var batch=valid.slice(i,i+50);
        var result=await A.client.from('nl_legacy_contacts').upsert(batch,{onConflict:'external_id'});
        if(result.error)throw result.error;
      }
      msg(valid.length+' Kontakte importiert. Bitte eventuelle Dubletten und die nächste Terminliste prüfen.');
      document.getElementById('nl-wix-file').value='';
      document.getElementById('nl-wix-consent').checked=false;
      await loadData();
    }catch(e){msg('Import fehlgeschlagen: '+(e.message||''),true);}
    finally{button.disabled=false;}
  });
  form.addEventListener('submit',async function(ev){
    ev.preventDefault();msg('');
    if(!confirm('Termin für diesen Kunden jetzt verbindlich eintragen?'))return;
    var btn=form.querySelector('[type=submit]');btn.disabled=true;
    try{
      var data={
        service:services.value,start:slots.value,
        name:form.elements.name.value.trim(),
        email:form.elements.email.value.trim(),
        phone:form.elements.phone.value.trim(),
        notes:form.elements.notes.value.trim(),
        accepted:form.elements.accepted.checked
      };
      if(!data.start)throw new Error('Bitte eine freie Uhrzeit auswählen.');
      var result=await request('/api/admin/book',{method:'POST',body:JSON.stringify(data)});
      msg('Termin erfolgreich gebucht: '+fmt(result.booking.start));
      await loadData();
    }catch(e){msg(e.message,true);}
    finally{btn.disabled=false;}
  });
  services.addEventListener('change',loadSlots);
  date.addEventListener('change',loadSlots);
  search.addEventListener('input',renderContacts);
  document.getElementById('nl-refresh').addEventListener('click',loadData);
  (async function(){
    try{
      if(!A||!A.enabled||!API){gate.textContent='Verwaltung noch nicht eingerichtet. Die Einrichtung erfolgt auf dem eigenen NoLimits-Konto.';return;}
      var u=await A.user();if(!u){gate.textContent='Bitte zuerst im Kundenkonto mit deiner E-Mail-Adresse anmelden.';return;}
      var role=await A.staff();
      if(!role){gate.textContent='Dieses Konto hat keinen Verwaltungszugriff. Der Inhaber muss dich zunächst ausdrücklich freischalten.';return;}
      gate.hidden=true;desk.hidden=false;
      document.getElementById('nl-loggedin').textContent=u.email||'';
      await loadData();
    }catch(e){gate.textContent='Die Verwaltung konnte nicht geladen werden: '+e.message;}
  })();
})();

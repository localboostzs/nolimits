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
    info.append(el('h2',null,c.name||c.email||c.phone),
      el('p',null,[c.email,c.phone].filter(Boolean).join(' · ')));
    if(c.registered) info.appendChild(el('p','nl-small','NoLimits-Kundenkonto vorhanden'));
    if(c.legacy) info.appendChild(el('p','nl-small','Aus Wix importiert'));
    if(c.recentService) info.appendChild(el('p','nl-small','Zuletzt gebuchte Leistung: '+c.recentService));
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
      b.setAttribute('aria-pressed',selected&&selected.name===c.name&&selected.email===c.email&&selected.phone===c.phone?'true':'false');
      b.append(el('strong',null,c.name||c.email||c.phone),el('span',null,c.email||c.phone||'Wix-Kontakt'));
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
      if(selected){var found=contacts.find(function(c){return c.email && selected.email
        ? c.email===selected.email : c.phone===selected.phone && c.name===selected.name;});
        displayContact(found||null);}
      if(r[1].bookingsWarning){
        msg('Kundenkonten und importierte Wix-Kontakte werden angezeigt. Die Cal.com-Terminübersicht wird erst nach Verbindung des geschäftlichen Cal.com-Kontos synchronisiert.');
      } else if (r[1].legacyWarning) {
        msg('Kundenkonten und Termine geladen. Wix-Kontakte konnten nicht gelesen werden.',true);
      }
    }catch(e){msg(e.message,true);}
  }
  // Preview remains entirely local: no contact data leaves the browser here.
  var wixFile=document.getElementById('nl-wix-file'),
      wixPreview=document.getElementById('nl-wix-preview'),
      wixSummary=document.getElementById('nl-wix-summary'),
      wixImport=document.getElementById('nl-wix-import'),
      wixConsent=document.getElementById('nl-wix-consent');
  var reviewed=null,reviewedFile=null;
  function resetWixReview(){
    reviewed=null;reviewedFile=null;
    wixImport.disabled=true;
    wixSummary.hidden=true;
    wixSummary.textContent='';
  }
  wixFile.addEventListener('change',resetWixReview);
  wixConsent.addEventListener('change',function(){
    if(!wixConsent.checked)wixImport.disabled=true;
    else wixImport.disabled=!reviewed;
  });
  wixPreview.addEventListener('click',async function(){
    resetWixReview();
    var file=wixFile.files&&wixFile.files[0];
    if(!file){msg('Bitte zuerst eine Wix-CSV-Datei auswählen.',true);return;}
    if(file.size>5*1024*1024){msg('Die CSV-Datei ist zu gross (max. 5 MB).',true);return;}
    wixPreview.disabled=true;
    try{
      if(!window.NOLIMITS_WIX_CSV)throw Error('CSV-Vorschau konnte nicht geladen werden.');
      var parsed=window.NOLIMITS_WIX_CSV.parse(await file.text());
      reviewed=parsed;reviewedFile=file;
      wixSummary.textContent=parsed.stats.valid+' geeignete Kontakte von '+parsed.stats.rows+
        ' Zeilen. '+parsed.stats.duplicates+' Dubletten, '+parsed.stats.skipped+
        ' ohne gültige Kontaktdaten und '+parsed.stats.invalidEmails+
        ' ungültige E-Mail-Adressen. Noch keine Daten importiert.';
      wixSummary.hidden=false;
      wixImport.disabled=!wixConsent.checked;
      msg('Vorschau erstellt. Überprüfe das Ergebnis vor dem verbindlichen Import.');
    }catch(e){resetWixReview();msg('Vorschau fehlgeschlagen: '+(e.message||''),true);}
    finally{wixPreview.disabled=false;}
  });
  wixImport.addEventListener('click',async function(){
    if(!reviewed||!reviewedFile||wixFile.files[0]!==reviewedFile){
      resetWixReview();msg('Bitte zuerst die aktuelle CSV-Datei in der Vorschau prüfen.',true);return;
    }
    if(!wixConsent.checked){msg('Der Import erfordert die ausdrückliche Einwilligung von Isen.',true);return;}
    var rows=reviewed.contacts;
    if(!confirm(rows.length+' Wix-Kontakte nach ausdrücklicher Freigabe jetzt importieren? Es werden keine bestehenden Wix-Termine übernommen.'))return;
    wixImport.disabled=true;
    try{
      if(!await A.staff())throw Error('Keine Verwaltungsberechtigung.');
      for(var i=0;i<rows.length;i+=50){
        var batch=rows.slice(i,i+50);
        var result=await A.client.from('nl_legacy_contacts').upsert(batch,{onConflict:'external_id'});
        if(result.error)throw result.error;
      }
      msg(rows.length+' geprüfte Kontakte importiert. Bitte Dubletten und bestehende Wix-Termine separat kontrollieren.');
      wixFile.value='';
      wixConsent.checked=false;
      resetWixReview();
      await loadData();
    }catch(e){
      // Partial imports can exist after a network failure. Keep preview for
      // idempotent retry; upsert uses stable external_id.
      wixImport.disabled=false;
      msg('Import fehlgeschlagen oder unvollständig: '+(e.message||'')+
        '. Bitte den Importstatus prüfen; ein erneuter Lauf aktualisiert bestehende Wix-IDs.',true);
    }
  });
  form.addEventListener('submit',async function(ev){
    ev.preventDefault();msg('');
    var series=form.elements.repeat.checked, weeks=series?Number(form.elements.repeatWeeks.value):1;
    if(!confirm(series
      ? 'Jetzt '+weeks+' wöchentliche Termine verbindlich buchen? Es werden zunächst alle freien Zeiten geprüft. Bei Problemen kann eine Teilbuchung entstehen.'
      : 'Termin für diesen Kunden jetzt verbindlich eintragen?'))return;
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
      if(series)data.count=weeks;
      var result=await request(series?'/api/admin/book-series':'/api/admin/book',{method:'POST',body:JSON.stringify(data)});
      msg(series?'Serientermin erfolgreich: '+result.count+' Termine ab '+fmt(result.starts[0])+' gebucht.':'Termin erfolgreich gebucht: '+fmt(result.booking.start));
      await loadData();
    }catch(e){msg(e.message,true);}
    finally{btn.disabled=false;}
  });
  var repeat=document.getElementById('nl-admin-repeat'), repeatSettings=document.getElementById('nl-admin-repeat-settings');
  repeat.addEventListener('change',function(){repeatSettings.hidden=!repeat.checked;});
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

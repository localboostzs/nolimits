/* NoLimits staff dashboard. Never stores Cal API tokens in the browser.
   Every sensitive API request is protected again by server-side Supabase token and RLS checks. */
(function(){
  'use strict';
  var A=window.NOLIMITS_ACCOUNT;
  var K=window.NOLIMITS_KALENDER;
  var API=(window.NOLIMITS_BOOKING&&window.NOLIMITS_BOOKING.API_BASE||'').replace(/\/$/,'');
  var gate=document.getElementById('nl-gate'), desk=document.getElementById('nl-desk'),
      notice=document.getElementById('nl-admin-notice');
  var list=document.getElementById('nl-contacts'), info=document.getElementById('nl-info'),
      search=document.getElementById('nl-search'), form=document.getElementById('nl-admin-book-form');
  var services=document.getElementById('nl-admin-service'), slotInput=document.getElementById('nl-admin-slot'),
      bookHeading=document.getElementById('nl-book-heading'), bookFor=document.getElementById('nl-book-for');
  var contacts=[], selected=null, loadedServices=[], unclearBooking=false;
  var N=window.NOLIMITS_NOTFALL;
  var FALLBACK=' Termine, die per WhatsApp eingehen, bis dahin im Google-Kalender «Termine auf Facebook für No Limits Barber» eintragen, damit die Zeit online gesperrt bleibt.';
  var DAY_MS=86400000;
  function msg(text,error){ notice.textContent=text;notice.hidden=!text;notice.classList.toggle('error',!!error); }
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function fmt(date){try{return new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(date));}catch(e){return date||'';}}
  var dateFmt=new Intl.DateTimeFormat('de-CH',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'});
  async function request(path,opts){
    var token=await A.bearer();if(!token)throw new Error('Sitzung abgelaufen – bitte erneut anmelden.');
    var options=Object.assign({method:'GET',cache:'no-store'},opts||{});
    options.headers=Object.assign({'Authorization':'Bearer '+token,'Content-Type':'application/json'},options.headers||{});
    return N.request(API+path,options);
  }
  async function requireReachable(){
    if(!(await N.reachable(API)))throw N.failure(N.UNREACHABLE+' Es wurde nichts gesendet.'+FALLBACK,'offline',0,true);
  }
  // Freie Zeiten über die bestehende Mitarbeiter-API (gleiche Prüfung wie bisher).
  function slotLoader(serviceKey){
    return async function(first,last){
      var r=await request('/api/admin/slots?service='+encodeURIComponent(serviceKey)+'&start='+first+'&end='+last);
      return r.days||{};
    };
  }
  function serviceByKey(key){return loadedServices.find(function(s){return s.key===key;});}
  // Preise nach Termindatum (Zuercher Kalendertag), nicht nach Buchungsdatum.
  function priceOn(key,start){
    var P=window.NOLIMITS_PREISE,s=serviceByKey(key);
    return s&&Number.isFinite(s.price)?P.on(s,P.day(start)):null;
  }
  function movedPrice(b,start){
    var before=priceOn(b.serviceKey,b.start),after=priceOn(b.serviceKey,start);
    if(before==null||after==null)return '';
    return ' Preis am neuen Termin: CHF '+after+(after!==before?' (bisher CHF '+before+')':'')+'.';
  }
  function initials(c){
    var words=String(c.name||'').trim().split(/\s+/).filter(Boolean);
    var text=words.length>1?words[0][0]+words[words.length-1][0]:words.length?words[0].slice(0,2):String(c.email||c.phone||'?')[0];
    return text.toUpperCase();
  }
  function avatar(c,cls){var a=el('span','nl-avatar'+(cls?' '+cls:''),initials(c));a.setAttribute('aria-hidden','true');return a;}
  var STATUS={accepted:'Bestätigt',cancelled:'Storniert',canceled:'Storniert',rejected:'Abgelehnt',pending:'Unbestätigt',unconfirmed:'Unbestätigt'};

  /* ---------- Terminkarten ---------- */
  function makeAppt(b){
    var card=el('article','nl-appt'),body=el('div','nl-appt-body');
    var start=Date.parse(b.start),end=Date.parse(b.end||'');
    var s=serviceByKey(b.serviceKey);
    var minutes=Number.isFinite(end)&&end>start?Math.round((end-start)/60000):s&&s.minutes;
    var price=priceOn(b.serviceKey,b.start);
    var top=el('div','nl-appt-top');
    top.append(el('strong','nl-appt-service',b.service||'Termin'));
    var status=String(b.status||'').toLowerCase();
    if(status)top.append(el('span','nl-status nl-status-'+status.replace(/[^a-z]/g,''),STATUS[status]||b.status));
    body.append(top);
    var facts=el('dl','nl-appt-facts');
    function fact(label,value){if(value==null||value==='')return;var w=el('div');w.append(el('dt',null,label),el('dd',null,value));facts.append(w);}
    if(Number.isFinite(start)){
      fact('Datum',dateFmt.format(new Date(start)));
      fact('Uhrzeit',K.time(start)+' Uhr');
    }
    if(minutes)fact('Dauer',minutes+' Min');
    if(price!=null)fact('Preis','CHF '+price);
    body.append(facts);
    card.append(body);
    if(b.uid&&b.serviceKey&&status==='accepted'&&start>Date.now()){
      if(start-Date.now()<DAY_MS)card.append(el('p','nl-appt-note','Beginnt in weniger als 24 Stunden: Kunden können online nichts mehr ändern, Mitarbeitende schon.'));
      card.appendChild(staffActions(b));
    }
    return card;
  }
  // Mitarbeiter duerfen auch kurzfristig absagen und verschieben; der Server prueft die Berechtigung.
  function staffActions(b){
    var box=el('div','nl-appt-actions'),panel=el('div','nl-appt-move');panel.hidden=true;
    var shortNotice=function(){return Date.parse(b.start)-Date.now()<DAY_MS;};
    function button(text,cls,onClick){var x=el('button',cls,text);x.type='button';x.addEventListener('click',onClick);return x;}
    async function send(path,data,done){
      box.querySelectorAll('button').forEach(function(x){x.disabled=true;});
      try{await requireReachable();await request(path,{method:'POST',body:JSON.stringify(data)});await loadData();msg(done);}
      catch(e){
        if(N.notExecuted(e)){msg(e.message,true);box.querySelectorAll('button').forEach(function(x){x.disabled=false;});save.disabled=!picker||!picker.selected();return;}
        // Unklar: Knöpfe dieser Karte bleiben gesperrt, bis der Stand neu geladen ist.
        await loadData();
        msg('Status unklar: Wir wissen nicht, ob die Änderung ausgeführt wurde. Prüfe den Termin (Liste neu laden oder Cal.com), bevor du es erneut versuchst.',true);
      }
    }
    var pickerBox=el('div','nl-picker-box'),picker=null,hint=el('p','nl-small nl-appt-move-price');hint.setAttribute('role','status');
    var save=button('Neue Zeit speichern','btn btn-gold btn-sm nl-appt-save',async function(){
      var target=picker&&picker.selected();
      if(!target){msg('Bitte eine freie Uhrzeit auswählen.',true);return;}
      var extra=shortNotice()?' Mitarbeiterausnahme: Der bisherige Termin beginnt in weniger als 24 Stunden.':'';
      if(!confirm('Termin vom '+fmt(b.start)+' auf '+fmt(target)+' verschieben?'+movedPrice(b,target)+extra))return;
      send('/api/admin/reschedule',{uid:b.uid,start:target,confirm:true},'Termin erfolgreich verschoben.');
    });
    save.disabled=true;
    panel.append(el('p','nl-appt-move-title','Neue Zeit wählen'),pickerBox,hint,save);
    box.append(button('Verschieben','nl-plain-button nl-appt-reschedule',function(){
        panel.hidden=!panel.hidden;
        if(!panel.hidden&&!picker){
          picker=K.create(pickerBox,{load:slotLoader(b.serviceKey),label:'Neues Datum für '+(b.service||'den Termin'),onChange:function(start){
            save.disabled=!start;
            hint.textContent=start?movedPrice(b,start).trim():'';
          }});
          picker.reset(true);
        }
      }),
      button('Absagen','nl-plain-button nl-appt-cancel',function(){
        var extra=shortNotice()?' Mitarbeiterausnahme: Der Termin beginnt in weniger als 24 Stunden.':'';
        if(!confirm('Termin vom '+fmt(b.start)+' wirklich absagen?'+extra))return;
        send('/api/admin/cancel',{uid:b.uid,confirm:true},'Termin erfolgreich abgesagt.');
      }),panel);
    return box;
  }

  /* ---------- Kundendetails ---------- */
  function section(title,items,empty){
    var s=el('section','nl-crm-section');
    var h=el('h3',null,title);h.append(el('span','nl-crm-count',String(items.length)));
    s.append(h);
    if(!items.length)s.append(el('p','nl-empty',empty));
    else{var g=el('div','nl-appt-list');items.forEach(function(x){g.append(makeAppt(x));});s.append(g);}
    return s;
  }
  function displayContact(c){
    selected=c;info.replaceChildren();
    if(!c){
      var empty=el('div','nl-crm-placeholder');
      empty.append(el('h2',null,'Kunde auswählen'),el('p',null,'Wähle links einen Kunden, um Termine zu sehen und zu verwalten, oder buche unten einen Termin für einen neuen Kunden.'));
      info.append(empty);
      setBookingCustomer(null);renderContacts();return;
    }
    var head=el('div','nl-crm-head');
    var who=el('div','nl-crm-who');
    who.append(el('h2',null,c.name||c.email||c.phone));
    var lines=el('p','nl-crm-lines');
    if(c.email)lines.append(el('span',null,c.email));
    if(c.phone)lines.append(el('span',null,c.phone));
    who.append(lines);
    var tags=el('p','nl-crm-tags');
    tags.append(el('span','nl-tag-chip',c.registered?'NoLimits-Kundenkonto':'Ohne Kundenkonto'));
    if(c.legacy)tags.append(el('span','nl-tag-chip','Aus Wix importiert'));
    who.append(tags);
    if(c.recentService)who.append(el('p','nl-small','Zuletzt gebuchte Leistung: '+c.recentService));
    head.append(avatar(c,'nl-avatar-lg'),who);
    var quick=el('div','nl-crm-quick');
    if(c.email){var m=el('a','nl-plain-button','E-Mail schreiben');m.href='mailto:'+c.email;quick.append(m);}
    if(c.phone){var t=el('a','nl-plain-button','Anrufen');t.href='tel:'+String(c.phone).replace(/[^+\d]/g,'');quick.append(t);}
    var book=el('button','nl-plain-button nl-crm-book','Termin buchen');book.type='button';
    book.addEventListener('click',function(){document.getElementById('nl-book-panel').scrollIntoView({behavior:'smooth',block:'start'});services.focus({preventScroll:true});});
    quick.append(book);
    info.append(head,quick,
      section('Kommende Termine',c.upcoming||[],'Keine kommenden Termine.'),
      section('Vergangene Termine',(c.past||[]).slice(0,12),'Keine vergangenen Termine.'));
    setBookingCustomer(c);renderContacts();
  }
  function setBookingCustomer(c){
    form.elements.name.value=c&&c.name||'';form.elements.email.value=c&&c.email||'';
    form.elements.phone.value=c&&c.phone||'';
    bookHeading.textContent=c?'Termin für '+(c.name||c.email||'diesen Kunden')+' buchen':'Termin für neuen Kunden buchen';
    bookFor.hidden=!c;
  }
  function renderContacts(){
    var q=search.value.trim().toLowerCase();list.replaceChildren();
    var matches=contacts.filter(function(c){return (c.name+' '+c.email+' '+(c.phone||'')).toLowerCase().includes(q);});
    document.getElementById('nl-contact-count').textContent=q?matches.length+' von '+contacts.length:String(contacts.length);
    if(!contacts.length){list.append(el('p','nl-empty','Noch keine Kontakte vorhanden.'));return;}
    if(!matches.length){list.append(el('p','nl-empty','Keine Kontakte zu «'+search.value.trim()+'» gefunden.'));return;}
    matches.forEach(function(c){
      var b=el('button','nl-contact');b.type='button';
      var active=!!selected&&selected.name===c.name&&selected.email===c.email&&selected.phone===c.phone;
      b.setAttribute('aria-pressed',active?'true':'false');
      var text=el('span','nl-contact-text');
      text.append(el('strong',null,c.name||c.email||c.phone));
      if(c.email)text.append(el('span',null,c.email));
      if(c.phone)text.append(el('span',null,c.phone));
      if(!c.email&&!c.phone)text.append(el('span',null,'Wix-Kontakt'));
      b.append(avatar(c),text);
      if(c.upcoming&&c.upcoming.length){var n=el('span','nl-contact-next',String(c.upcoming.length));n.setAttribute('aria-label',c.upcoming.length+' kommende Termine');n.title='Kommende Termine';b.append(n);}
      b.addEventListener('click',function(){displayContact(c);});
      list.appendChild(b);
    });
  }

  /* ---------- Termin buchen ---------- */
  var calendar=K.create(document.getElementById('nl-admin-calendar'),{
    load:function(first,last){return slotLoader(services.value)(first,last);},
    idleText:'Bitte zuerst eine Leistung wählen.',
    label:'Datum für den neuen Termin',
    onChange:function(start){slotInput.value=start||'';showBookingPrice();}
  });
  function bookingPrice(){
    var P=window.NOLIMITS_PREISE,s=serviceByKey(services.value),first=calendar.day();
    if(!s||!Number.isFinite(s.price)||!first)return '';
    var count=form.elements.repeat.checked?Number(form.elements.repeatWeeks.value):1,totals=new Map();
    for(var i=0;i<count;i++){
      var d=new Date(first+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*i);
      var price=P.on(s,d.toISOString().slice(0,10));
      totals.set(price,(totals.get(price)||0)+1);
    }
    var parts=Array.from(totals);
    if(count===1)return 'Preis am gewählten Datum: CHF '+parts[0][0]+' (Zahlung vor Ort).';
    return 'Preise nach Termindatum: '+parts.map(function(p){return p[1]+' × CHF '+p[0];}).join(', ')+' (Zahlung vor Ort).';
  }
  // Geplante Serientermine wie im Worker: gleicher Zürcher Wochentag und gleiche Uhrzeit, je 7 Kalendertage später.
  function seriesPlan(count){
    var P=window.NOLIMITS_PREISE,s=serviceByKey(services.value),start=slotInput.value,first=start&&P.day(start);
    if(!first)return [];
    var hm=new Intl.DateTimeFormat('de-CH',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Zurich'}).format(new Date(start));
    var plan=[];
    for(var i=0;i<count;i++){
      var d=new Date(first+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*i);
      var day=d.toISOString().slice(0,10);
      plan.push({day:day,label:dateFmt.format(d)+', '+hm+' Uhr',price:s&&Number.isFinite(s.price)?P.on(s,day):null});
    }
    return plan;
  }
  function seriesQuestion(count){
    var plan=seriesPlan(count),s=serviceByKey(services.value),known=plan.every(function(p){return p.price!=null;});
    var total=plan.reduce(function(sum,p){return sum+(p.price||0);},0);
    return 'Serie verbindlich buchen?\n\n'+(s?s.name+', ':'')+count+' Termine:\n'+
      plan.map(function(p,i){return (i+1)+'. '+p.label+(p.price!=null?' – CHF '+p.price:'');}).join('\n')+
      (known?'\n\nTotal CHF '+total+' (Zahlung vor Ort, Preis nach Termindatum).':'')+
      '\n\nZuerst werden alle Zeiten geprüft. Ist eine nicht frei, wird keiner der Termine gebucht. Bei einer Störung während der Buchung kann eine Teilserie entstehen.';
  }
  window.NOLIMITS_ADMIN_TEST={seriesPlan:seriesPlan,seriesQuestion:seriesQuestion};
  function showBookingPrice(){
    var box=document.getElementById('nl-admin-price'),text=bookingPrice();
    box.textContent=text;box.hidden=!text;
  }
  async function loadData(){
    msg('');
    try{
      var r=await Promise.all([request('/api/admin/services'),request('/api/admin/contacts')]);
      loadedServices=r[0].services||[];
      var keep=services.value;
      services.replaceChildren();services.appendChild(new Option('Leistung auswählen',''));
      loadedServices.forEach(function(s){services.appendChild(new Option(s.name+' · '+s.minutes+' Min · CHF '+s.price+(s.priceChange?' (ab 2027: CHF '+s.priceChange.price+')':''),s.key));});
      if(keep&&serviceByKey(keep))services.value=keep;
      contacts=r[1].contacts||[];
      if(selected){var found=contacts.find(function(c){return c.email && selected.email
        ? c.email===selected.email : c.phone===selected.phone && c.name===selected.name;});
        displayContact(found||null);}
      else{displayContact(null);}
      if(services.value)calendar.reload();
      if(r[1].bookingsWarning){
        msg('Kundenkonten und importierte Wix-Kontakte werden angezeigt. Die Cal.com-Terminübersicht wird erst nach Verbindung des geschäftlichen Cal.com-Kontos synchronisiert.');
      } else if (r[1].legacyWarning) {
        msg('Kundenkonten und Termine geladen. Wix-Kontakte konnten nicht gelesen werden.',true);
      }
      return true;
    }catch(e){msg(e.message+(e.unavailable?FALLBACK:''),true);return false;}
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
    ev.preventDefault();if(unclearBooking)return;msg('');
    var series=form.elements.repeat.checked, weeks=series?Number(form.elements.repeatWeeks.value):1;
    var btn=form.querySelector('[type=submit]');
    try{
      if(!services.value)throw new Error('Bitte eine Leistung wählen.');
      if(!slotInput.value)throw new Error('Bitte im Kalender einen Tag und eine freie Uhrzeit auswählen.');
      if(!form.reportValidity())return;
      btn.disabled=true;
      // Unmittelbar vor dem Absenden beim Worker nachfragen, ob die Zeit noch frei ist.
      if(!await calendar.stillFree()){
        await calendar.reload();
        throw new Error('Diese Uhrzeit ist inzwischen nicht mehr frei. Bitte eine andere wählen.');
      }
      var price=bookingPrice();
      if(!confirm(series
        ? seriesQuestion(weeks)
        : 'Termin am '+fmt(slotInput.value)+' für diesen Kunden jetzt verbindlich eintragen?'+(price?' '+price:''))) return;
      var data={
        service:services.value,start:slotInput.value,
        name:form.elements.name.value.trim(),
        email:form.elements.email.value.trim(),
        phone:form.elements.phone.value.trim(),
        notes:form.elements.notes.value.trim(),
        accepted:form.elements.accepted.checked,
        // Kennung des Bestaetigungstextes in verwaltung/index.html
        termsVersion:'staff-2026-11-25-informiert'
      };
      if(series)data.count=weeks;
      await requireReachable();
      unclearBooking=true; // gilt, bis eine Bestätigung oder eine eindeutige Ablehnung da ist
      var result=await request(series?'/api/admin/book-series':'/api/admin/book',{method:'POST',body:JSON.stringify(data)});
      if(series?!(result.count===weeks&&result.starts&&result.starts.length===weeks):!N.confirmed(result.booking))throw N.failure('Keine Bestätigung erhalten.','unclear');
      unclearBooking=false;
      // loadData() leert die Meldung: zuerst aktualisieren, dann den Erfolg anzeigen.
      await loadData();
      var paid=(series?result.prices||[]:[result.booking.price]).filter(Number.isFinite);
      var priceNote=paid.length?' Preis je Termin nach Datum: '+paid.map(function(p){return 'CHF '+p;}).join(', ')+'.':'';
      msg((series?'Serientermin erfolgreich: '+result.count+' Termine ab '+fmt(result.starts[0])+' gebucht.':'Termin erfolgreich gebucht: '+fmt(result.booking.start)+'.')+priceNote);
      form.elements.accepted.checked=false;
    }catch(e){
      if(unclearBooking&&N.notExecuted(e))unclearBooking=false;
      msg(unclearBooking
        ?(e.code==='series_partial'?e.message:'Status unklar: Wir wissen nicht, ob der Termin eingetragen wurde.')+' Nicht erneut buchen. Erst «Aktualisieren» wählen oder in Cal.com prüfen.'
        :e.message,true);
      if(e.code==='slot_unavailable'||e.code==='series_conflict')calendar.reload();
    }
    finally{btn.disabled=unclearBooking;}
  });
  var repeat=document.getElementById('nl-admin-repeat'), repeatSettings=document.getElementById('nl-admin-repeat-settings');
  repeat.addEventListener('change',function(){repeatSettings.hidden=!repeat.checked;});
  services.addEventListener('change',function(){slotInput.value='';showBookingPrice();calendar.reset(!!services.value);});
  [form.elements.repeat,form.elements.repeatWeeks].forEach(function(x){x.addEventListener('change',showBookingPrice);});
  search.addEventListener('input',renderContacts);
  document.getElementById('nl-new-customer').addEventListener('click',function(){
    displayContact(null);
    document.getElementById('nl-book-panel').scrollIntoView({behavior:'smooth',block:'start'});
    form.elements.name.focus({preventScroll:true});
  });
  document.getElementById('nl-refresh').addEventListener('click',async function(){
    if(!(await loadData())||!unclearBooking)return;
    unclearBooking=false;form.querySelector('[type=submit]').disabled=false;
    msg('Stand neu geladen. Prüfe beim Kunden, ob der Termin eingetragen ist, bevor du erneut buchst.');
  });
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

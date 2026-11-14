(function(){
  'use strict';
  var A = window.NOLIMITS_ACCOUNT, setup = document.getElementById('nl-setup'),
    login = document.getElementById('nl-login'), details = document.getElementById('nl-details'),
    status = document.getElementById('nl-status'), emailForm = document.getElementById('nl-email-form'),
    profileForm = document.getElementById('nl-profile-form'), last = document.getElementById('nl-last');
  var names = {
    'haarschnitt-bartschnitt-rasieren':'Haarschnitt mit Bartschnitt und Rasieren',
    'haarschnitt-bartschnitt-augenbrauen':'Haarschnitt mit Bartschnitt + Augenbrauen',
    'haarschnitt-waschen':'Haarschnitt mit Waschen',
    'haarschnitt-bartschnitt':'Haarschnitt & Bartschnitt',
    'classic-scissor-cut':'Classic Hair Scissor Cut','haarschnitt':'Haarschnitt',
    'jugendliche-10-14':'Jugendliche (von 10 bis 14 Jahre alt)',
    'bartschnitt':'Bartschnitt','augenbrauen-zupfen':'Augenbrauen zupfen'
  };
  function message(s,error) {status.textContent=s;status.hidden=!s;status.classList.toggle('error',!!error);}
  function visible(id) {login.hidden=id!=='login';details.hidden=id!=='details';setup.hidden=id!=='setup';}
  async function display() {
    if (!A || !A.enabled){visible('setup');return;}
    try {
      var u = await A.user();
      if (!u){visible('login');return;}
      visible('details');
      document.getElementById('nl-email').textContent=u.email||'';
      var p = await A.profile();
      profileForm.elements.full_name.value=p&&p.full_name||'';
      profileForm.elements.phone.value=p&&p.phone||'';
      profileForm.elements.address.value=p&&p.address||'';
      last.replaceChildren();
      if(p && names[p.last_service_key]){
        var title=document.createElement('strong');title.textContent=names[p.last_service_key];
        var btn=document.createElement('a');btn.className='btn btn-gold btn-sm';
        btn.href='../booking-test/?service='+encodeURIComponent(p.last_service_key);btn.textContent='Gleiche Leistung wieder buchen';
        last.append(title,btn);last.hidden=false;
      } else {last.hidden=true;}
    } catch(e){message('Kontodaten konnten nicht geladen werden. '+(e.message||''),true);}
  }
  emailForm.addEventListener('submit',async function(e){
    e.preventDefault();var email=emailForm.elements.email.value.trim();
    var btn=emailForm.querySelector('[type=submit]');btn.disabled=true;message('');
    try{
      await A.emailSignIn(email,location.origin+location.pathname);
      message('E-Mail versendet. Öffne den Anmeldelink auf deinem Gerät. Die Anmeldung ist kostenlos.');
    }catch(e){message(e.message||'Anmeldung fehlgeschlagen.',true);}
    finally{btn.disabled=false;}
  });
  profileForm.addEventListener('submit',async function(e){
    e.preventDefault();var b=profileForm.querySelector('[type=submit]');b.disabled=true;message('');
    try{
      var before=await A.profile();
      await A.saveProfile({
        full_name:profileForm.elements.full_name.value,
        phone:profileForm.elements.phone.value,
        address:profileForm.elements.address.value,
        last_service_key:before&&before.last_service_key||''
      });
      message('Deine Angaben wurden gespeichert.');
    }catch(e){message(e.message||'Speichern fehlgeschlagen.',true);}
    finally{b.disabled=false;}
  });
  document.getElementById('nl-signout').addEventListener('click',async function(){
    await A.signOut();message('Abgemeldet.');await display();
  });
  display();
})();

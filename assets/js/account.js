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
  function visible(id) {var loading=document.getElementById('nl-loading');if(loading)loading.hidden=true;login.hidden=id!=='login';details.hidden=id!=='details';setup.hidden=id!=='setup';if(id==='login')document.dispatchEvent(new CustomEvent('nolimits-google-login-visible'));}
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
    } catch(e){var loading=document.getElementById('nl-loading');if(loading)loading.hidden=true;message('Kontodaten konnten nicht geladen werden. '+(e.message||''),true);}
  }
  /* Die Supabase-Schutzlimits lassen sich auf der Website nicht umgehen.
     Statt englischer Serverfehler: verständliche Meldungen und lokale
     10-Sekunden-Sperre, um unnötige zusätzliche Anfragen zu vermeiden. */
  var loginCooldownTimer = null, loginCooldownUntil = 0;
  function loginErrorText(err) {
    var raw = String((err && err.message) || '').toLowerCase();
    var code = String((err && err.code) || '').toLowerCase();
    if (code === 'over_email_send_rate_limit' || raw.includes('email rate limit exceeded')) {
      return 'Zu viele Anmelde-E-Mails versendet. Das Versandlimit wurde erreicht. Bitte später erneut versuchen. Falls du bereits eine Anmeldemail erhalten hast, verwende diesen Link.';
    }
    if (raw.includes('for security purposes') || raw.includes('only request this after') ||
        code === 'over_request_rate_limit') {
      var match = raw.match(/after\s+(\d+)\s+second/);
      return 'Bitte warte ' + (match ? match[1] : 'einige') +
        ' Sekunden, bevor du erneut einen Anmeldelink anforderst. Bereits erhaltene E-Mails kannst du weiterhin öffnen.';
    }
    if (code === 'email_address_not_authorized' || raw.includes('email address not authorized')) {
      return 'Der Kundenlogin befindet sich noch im Testbetrieb. Anmeldemails können aktuell nur an freigegebene Testadressen gesendet werden.';
    }
    if (raw.includes('network') || raw.includes('failed to fetch')) {
      return 'Die Verbindung ist gerade nicht erreichbar. Bitte prüfe deine Internetverbindung und versuche es später erneut.';
    }
    return 'Der Anmeldelink konnte nicht versendet werden. Bitte versuche es später erneut.';
  }
  function loginCooldown(seconds) {
    var btn = emailForm.querySelector('[type=submit]');
    if (loginCooldownTimer) clearInterval(loginCooldownTimer);
    loginCooldownUntil = Date.now() + Math.max(1,seconds) * 1000;
    function update() {
      var remain = Math.max(0, Math.ceil((loginCooldownUntil - Date.now()) / 1000));
      btn.disabled = remain > 0;
      btn.textContent = remain ? 'Erneut senden in ' + remain + ' s' : 'Anmeldelink senden';
      if (!remain && loginCooldownTimer) {
        clearInterval(loginCooldownTimer);
        loginCooldownTimer = null;
      }
    }
    update();
    loginCooldownTimer = setInterval(update,1000);
  }
  emailForm.addEventListener('submit',async function(e){
    e.preventDefault();
    if (Date.now() < loginCooldownUntil) return;
    var email=emailForm.elements.email.value.trim();
    var btn=emailForm.querySelector('[type=submit]');
    btn.disabled=true;message('');
    var delay=0;
    try {
      await A.emailSignIn(email,location.origin+location.pathname);
      message('Anmeldelink angefordert. Falls dein Postfach zugelassen ist, erhältst du die E-Mail. Bitte prüfe auch den Spam-Ordner.');
      delay=10;
    } catch (err) {
      message(loginErrorText(err),true);
      var raw=String((err && err.message) || '').toLowerCase();
      if (raw.includes('only request this after') || raw.includes('for security purposes')) {
        var match=raw.match(/after\s+(\d+)\s+second/);
        delay=match ? Math.min(120,Math.max(1,Number(match[1]))) : 10;
      }
    } finally {
      if (delay) loginCooldown(delay);
      else btn.disabled=false;
    }
  });
  var socialNote = document.getElementById('nl-social-note');
  var socialButtons = [
    { provider: 'google', element: document.getElementById('nl-google-login') }
  ];
  function setSocialNote(text) {
    if (!socialNote) return;
    socialNote.textContent = text;
    socialNote.hidden = !text;
  }
  if (!window.NOLIMITS_GOOGLE_ID_ACTIVE && A && A.enabled && A.socialProviderStatus) {
    A.socialProviderStatus().then(function(providers) {
      if (providers.google) setSocialNote('');
      else setSocialNote('Die Google-Anmeldung ist derzeit nicht verfügbar. Verwende den Anmeldelink per E-Mail.');
    }).catch(function() {
      setSocialNote('Die Anmeldeanbieter können momentan nicht geprüft werden. Der E-Mail-Login funktioniert weiterhin.');
    });
  }
  socialButtons.forEach(function(item) {
    if (item.provider === 'google' && window.NOLIMITS_GOOGLE_ID_ACTIVE) return;
    if (!item.element) return;
    item.element.addEventListener('click',async function() {
      if (!A || !A.enabled || !A.socialSignIn) {
        message('Kundenlogin noch nicht eingerichtet.',true);
        return;
      }
      item.element.disabled=true;
      message('');
      try {
        await A.socialSignIn(item.provider,location.origin+location.pathname);
        message('Weiterleitung zur Anmeldung gestartet.');
      } catch (err) {
        if (err && err.code === 'provider_not_enabled') message(err.message,true);
        else message('Die Google-Anmeldung konnte nicht gestartet werden. Bitte versuche es erneut oder verwende die E-Mail-Anmeldung.',true);
      } finally {
        item.element.disabled=false;
      }
    });
  });
  document.addEventListener('nolimits-google-id-success', function() {
    message('');
    display();
  });
  // Avoid displaying raw OAuth error codes or user-supplied callback text.
  try {
    var callbackParams = new URLSearchParams(location.search);
    if (callbackParams.has('error')) {
      message('Die Anmeldung wurde abgebrochen oder konnte nicht abgeschlossen werden. Du kannst es erneut versuchen.',true);
      callbackParams.delete('error');
      callbackParams.delete('error_code');
      callbackParams.delete('error_description');
      var cleaned = location.pathname + (callbackParams.toString() ? '?' + callbackParams : '') + location.hash;
      history.replaceState(history.state,'',cleaned);
    }
  } catch (_) { /* History may be unavailable in embedded browsers. */ }
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
    await A.signOut();document.dispatchEvent(new CustomEvent('nolimits-google-id-signout'));message('Abgemeldet.');await display();
  });
  display();
})();

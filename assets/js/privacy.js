/* NoLimits Datenschutz-Einstellungen: ausschliesslich optionale Funktionen.
   Auth: nach Ablehnung nur sessionStorage, nach Einwilligung localStorage.
   Google Maps: kein Google-iframe-Request ohne Freigabe oder ausdrücklichen Klick. */
(function () {
  'use strict';
  var KEY = 'nl_privacy_options_v1';
  var AUTH_PREFIX = 'sb-jcctdjjunxmxaphjkrsz-auth-token';
  var storageLocal = available('localStorage');
  var storageSession = available('sessionStorage');
  var choices = readChoices();
  var pageRoot = new URL('../../', document.currentScript.src);
  var banner;

  function available(name) {
    try {
      var obj = window[name], probe = '__nl_probe__';
      obj.setItem(probe, '1');
      obj.removeItem(probe);
      return obj;
    } catch (e) { return null; }
  }
  function readChoices() {
    try {
      var raw = storageLocal && storageLocal.getItem(KEY);
      var c = raw && JSON.parse(raw);
      if (c && c.version === 1 && typeof c.persistentLogin === 'boolean' && typeof c.googleMaps === 'boolean') return c;
    } catch (e) {}
    return null;
  }
  function isAuthKey(key) {
    return key === AUTH_PREFIX || key.indexOf(AUTH_PREFIX + '-') === 0;
  }
  function authKeys(store) {
    var arr = [];
    if (!store) return arr;
    try {
      for (var i = 0; i < store.length; i++) {
        var key = store.key(i);
        if (key && isAuthKey(key)) arr.push(key);
      }
    } catch (e) {}
    return arr;
  }
  function wipeAuth(store) {
    authKeys(store).forEach(function (key) {
      try { store.removeItem(key); } catch (e) {}
    });
  }
  function moveAuth(from, to) {
    if (!from) return;
    authKeys(from).forEach(function (key) {
      try {
        var value = from.getItem(key);
        if (value !== null && to) to.setItem(key, value);
        from.removeItem(key);
      } catch (e) {}
    });
  }

  /* Ältere Login-Tokens wurden ohne Einwilligung im localStorage abgelegt.
     Ohne neu erteilte Zustimmung entfernen, BEVOR Supabase initialisiert wird. */
  if (!choices || !choices.persistentLogin) {
    if (choices && storageSession) moveAuth(storageLocal, storageSession);
    else wipeAuth(storageLocal);
  } else if (storageLocal) {
    moveAuth(storageSession, storageLocal);
  }

  var authStorage = {
    getItem: function (key) {
      var active = choices && choices.persistentLogin ? storageLocal : storageSession;
      try { return active ? active.getItem(key) : null; } catch (e) { return null; }
    },
    setItem: function (key, value) {
      var active = choices && choices.persistentLogin ? storageLocal : storageSession;
      try { if (active) active.setItem(key, value); } catch (e) {}
    },
    removeItem: function (key) {
      try {
        if (storageLocal) storageLocal.removeItem(key);
        if (storageSession) storageSession.removeItem(key);
      } catch (e) {}
    }
  };

  function save(next) {
    next = { version: 1, persistentLogin: !!next.persistentLogin, googleMaps: !!next.googleMaps };
    if (next.persistentLogin) moveAuth(storageSession, storageLocal);
    else moveAuth(storageLocal, storageSession);
    choices = next;
    try { if (storageLocal) storageLocal.setItem(KEY, JSON.stringify(choices)); } catch (e) {}
    updateMaps();
    if (banner) banner.hidden = true;
    window.dispatchEvent(new CustomEvent('nl-privacy-updated', { detail: choices }));
  }
  function make(tag, className, content) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }
  function replaceMap(iframe, allowed) {
    var parent = iframe.parentNode;
    if (!parent) return;
    var blocker = parent.querySelector('.nl-map-blocker');
    if (allowed) {
      if (blocker) blocker.remove();
      iframe.hidden = false;
      if (iframe.getAttribute('src') !== iframe.getAttribute('data-nl-map-src')) {
        iframe.setAttribute('src', iframe.getAttribute('data-nl-map-src'));
      }
      return;
    }
    if (iframe.hasAttribute('src')) iframe.setAttribute('src', 'about:blank');
    iframe.hidden = true;
    if (blocker) return;
    blocker = make('div','nl-map-blocker');
    blocker.setAttribute('role','group');
    blocker.setAttribute('aria-label','Google Maps ist deaktiviert');
    var title = make('strong', null, 'Google Maps ist deaktiviert');
    var desc = make('p', null, 'Die externe Karte wird erst geladen, wenn du es ausdrücklich erlaubst.');
    var btn = make('button','nl-map-load','Karte einmalig laden');
    btn.type = 'button';
    btn.addEventListener('click', function () { replaceMap(iframe, true); });
    var link = make('a', null, 'Anfahrt in Google Maps öffnen');
    link.href = 'https://www.google.com/maps/search/?api=1&query=Schmiedgasse+94%2C+6438+Ibach%2C+Schweiz';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    blocker.append(title,desc,btn,link);
    parent.appendChild(blocker);
  }
  function updateMaps() {
    document.querySelectorAll('iframe[data-nl-map-src]').forEach(function (iframe) {
      replaceMap(iframe, !!(choices && choices.googleMaps));
    });
  }
  function createBanner() {
    banner = make('section','nl-privacy-banner');
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-label','Datenschutz-Einstellungen');
    banner.setAttribute('aria-modal','false');
    var line = make('div','nl-privacy-inner');
    var heading = make('h2', null, 'Cookies & Datenschutz bei NoLimits');
    var copy = make('p',null,'Notwendige Funktionen ermöglichen Buchungen und speichern deine Auswahl. Mit deiner Einwilligung können wir deine Anmeldung auf diesem Gerät dauerhaft speichern und Google Maps anzeigen.');
    var detail = make('p','nl-privacy-note','Ohne Einwilligung bleibt eine Anmeldung nur während des aktuellen Browser-Tabs aktiv. Du kannst deine Entscheidung jederzeit ändern.');
    var legal = make('a','nl-privacy-legal','Datenschutzinformationen');
    legal.href = new URL('impressum/', pageRoot).href;

    var controls = make('div','nl-privacy-actions');
    var no = make('button','nl-privacy-reject','Alle ablehnen');
    no.type='button';
    var adjust = make('button','nl-privacy-customize','Anpassen');
    adjust.type='button';
    var yes = make('button','nl-privacy-accept','Alle akzeptieren');
    yes.type='button';

    var prefs = make('div','nl-privacy-preferences');
    prefs.hidden = true;
    var pTitle = make('p',null,'Wähle selbst:');
    var labelLogin = make('label','nl-privacy-option');
    var inputLogin = make('input');
    inputLogin.type='checkbox';
    inputLogin.checked=!!(choices && choices.persistentLogin);
    labelLogin.append(inputLogin,make('span',null,'Angemeldet bleiben – Kundenkonto auf diesem Gerät dauerhaft speichern'));
    var labelMap = make('label','nl-privacy-option');
    var inputMap = make('input');
    inputMap.type='checkbox';
    inputMap.checked=!!(choices && choices.googleMaps);
    labelMap.append(inputMap,make('span',null,'Google Maps – externe Karte auf der Website anzeigen'));
    var saveBtn = make('button','nl-privacy-save','Auswahl speichern');
    saveBtn.type='button';
    saveBtn.addEventListener('click',function() {
      save({persistentLogin:inputLogin.checked,googleMaps:inputMap.checked});
    });
    prefs.append(pTitle,labelLogin,labelMap,saveBtn);

    no.addEventListener('click', function () { save({persistentLogin:false,googleMaps:false}); });
    yes.addEventListener('click', function () { save({persistentLogin:true,googleMaps:true}); });
    adjust.addEventListener('click',function(){
      prefs.hidden=!prefs.hidden;
      adjust.setAttribute('aria-expanded',String(!prefs.hidden));
      if (!prefs.hidden) inputLogin.focus();
    });
    adjust.setAttribute('aria-expanded','false');
    controls.append(no,adjust,yes);
    line.append(heading,copy,detail,legal,controls,prefs);
    banner.appendChild(line);
    banner.hidden=!!choices;
    document.body.appendChild(banner);

    var footer = document.querySelector('.footer-bottom') || document.querySelector('footer');
    if (footer) {
      var reopen = make('button','nl-privacy-reopen','Cookie-Einstellungen');
      reopen.type = 'button';
      reopen.addEventListener('click',function(){
        prefs.hidden=true;adjust.setAttribute('aria-expanded','false');
        inputLogin.checked=!!(choices && choices.persistentLogin);
        inputMap.checked=!!(choices && choices.googleMaps);
        banner.hidden=false;
        no.focus({preventScroll:true});
      });
      footer.appendChild(reopen);
    }
  }
  function ready() {
    updateMaps();
    createBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready);
  else ready();
  window.NOLIMITS_PRIVACY = {
    get: function () { return choices ? Object.assign({},choices) : null; },
    authStorage: authStorage,
    save: save,
    isPersistentLogin: function () { return !!(choices && choices.persistentLogin); }
  };
})();

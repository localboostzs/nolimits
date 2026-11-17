(function () {
  'use strict';
  // Public Google OAuth client ID only. No OAuth client secret or user token in source.
  var googleClientId = '341617264129-o9h3p41bg2d4tftrnu8vmupf02aht5f2.apps.googleusercontent.com';
  var status = document.getElementById('nl-social-note');
  var googleSlot = document.getElementById('nl-google-button-slot');
  var loading = document.getElementById('nl-login');
  if (!status || !googleSlot || !loading) return;
  window.NOLIMITS_GOOGLE_ID_ACTIVE = true;

  var prepared = false;
  var preparing = false;
  var scriptPromise = null;

  function report(message, error) {
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('error', !!error);
  }

  function loadGoogleLibrary() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client?hl=de';
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { scriptPromise = null; reject(new Error('Google-Anmeldung konnte nicht geladen werden.')); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function createNonce() {
    if (!window.crypto || !window.crypto.getRandomValues || !window.crypto.subtle) {
      throw new Error('Sichere Google-Anmeldung wird von diesem Browser nicht unterstützt.');
    }
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    var nonce = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
    var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
    var hashed = Array.from(new Uint8Array(digest)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    return { raw: nonce, hashed: hashed };
  }

  async function prepareGoogleButton() {
    if (prepared || preparing || loading.hidden) return;
    preparing = true;
    try {
      var auth = window.NOLIMITS_ACCOUNT;
      if (!auth || !auth.enabled || !auth.client) throw new Error('Kundenkonto noch nicht verfügbar.');
      var nonce = await createNonce();
      await loadGoogleLibrary();
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        throw new Error('Google-Anmeldung ist derzeit nicht verfügbar.');
      }
      // Directly show the *official* Google button. A single click on it
      // opens Google's account picker; no intermediary NoLimits button.
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: nonce.hashed,
        ux_mode: 'popup',
        auto_select: false,
        callback: async function (response) {
          try {
            if (!response || !response.credential) throw new Error('Kein Google-Token erhalten.');
            report('Anmeldung wird geprüft …', false);
            var login = await auth.client.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: nonce.raw
            });
            if (login.error) throw login.error;
            report('', false);
            document.dispatchEvent(new CustomEvent('nolimits-google-id-success'));
          } catch (_) {
            report('Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut oder verwende den E-Mail-Anmeldelink.', true);
          }
        }
      });
      if (loading.hidden) return;
      googleSlot.replaceChildren();
      window.google.accounts.id.renderButton(googleSlot, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        locale: 'de',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(400, Math.max(180, googleSlot.clientWidth || 300))
      });
      prepared = true;
      report('', false);
    } catch (error) {
      // Email-link sign-in remains available without any third-party script.
      googleSlot.textContent = 'Google-Anmeldung derzeit nicht verfügbar';
      report('Du kannst dich weiterhin per E-Mail-Anmeldelink anmelden.', true);
    } finally {
      preparing = false;
    }
  }

  // The account UI fires this event only when the visitor is not signed in.
  // This avoids loading Google's third-party library on signed-in account views.
  document.addEventListener('nolimits-google-login-visible', prepareGoogleButton);
  document.addEventListener('nolimits-google-id-signout', function () {
    if (window.google && window.google.accounts && window.google.accounts.id &&
        typeof window.google.accounts.id.disableAutoSelect === 'function') {
      window.google.accounts.id.disableAutoSelect();
    }
  });
})();
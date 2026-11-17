(function () {
  'use strict';
  // Public Google OAuth client ID (not a secret). OAuth client secrets are never sent to the browser.
  var googleClientId = '341617264129-o9h3p41bg2d4tftrnu8vmupf02aht5f2.apps.googleusercontent.com';
  var status = document.getElementById('nl-gsi-status');
  var loadButton = document.getElementById('nl-gsi-load');
  var googleSlot = document.getElementById('nl-gsi-button');
  var result = document.getElementById('nl-gsi-result');
  var started = false;

  function report(message, error) {
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('error', !!error);
  }
  function loadGoogleLibrary() {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client?hl=de';
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Die Google-Anmeldung konnte nicht geladen werden.')); };
      document.head.appendChild(script);
    });
  }
  async function createNonce() {
    if (!window.crypto || !window.crypto.getRandomValues || !window.crypto.subtle) {
      throw new Error('Dieser Browser unterstützt die sichere Anmeldung nicht.');
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

  loadButton.addEventListener('click', async function () {
    if (started) return;
    started = true;
    loadButton.disabled = true;
    report('Google-Anmeldung wird vorbereitet …', false);
    try {
      var auth = window.NOLIMITS_ACCOUNT;
      if (!auth || !auth.enabled || !auth.client) throw new Error('NoLimits-Kundenkonto nicht verfügbar.');
      var nonce = await createNonce();
      await loadGoogleLibrary();
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        throw new Error('Google Identity Services ist nicht verfügbar.');
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: nonce.hashed,
        ux_mode: 'popup',
        auto_select: false,
        callback: async function (response) {
          try {
            if (!response || !response.credential) throw new Error('Google hat kein Anmeldetoken zurückgegeben.');
            report('Anmeldung wird geprüft …', false);
            var signIn = await auth.client.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: nonce.raw
            });
            if (signIn.error) throw signIn.error;
            // No credential is logged or persisted outside Supabase Auth's consent-aware session storage.
            report('Anmeldung erfolgreich.', false);
            result.hidden = false;
            googleSlot.hidden = true;
          } catch (_) {
            report('Die Anmeldung konnte nicht abgeschlossen werden. Bitte verwende bis zur Freigabe die bisherige Google-Anmeldung.', true);
          }
        }
      });
      window.google.accounts.id.renderButton(googleSlot, {
        theme: 'outline',
        type: 'standard',
        size: 'large',
        text: 'continue_with',
        locale: 'de',
        shape: 'rectangular',
        width: Math.min(320, Math.max(210, googleSlot.clientWidth || 300))
      });
      loadButton.hidden = true;
      report('Klicke auf den Google-Button, um die neue Anmeldung zu testen.', false);
    } catch (err) {
      started = false;
      loadButton.disabled = false;
      report(err && err.message || 'Google-Anmeldung konnte nicht vorbereitet werden.', true);
    }
  });
})();

(function () {
  'use strict';
  // Public Google OAuth client ID (not a secret). OAuth client secrets are never sent to the browser.
  var googleClientId = '341617264129-o9h3p41bg2d4tftrnu8vmupf02aht5f2.apps.googleusercontent.com';
  var status = document.getElementById('nl-social-note');
  var loadButton = document.getElementById('nl-google-login');
  var googleSlot = document.getElementById('nl-google-button-slot');
  var result = null;
  var started = false;
  if (!loadButton || !googleSlot || !status) return;
  window.NOLIMITS_GOOGLE_ID_ACTIVE = true;

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

  function resetButton() {
    started = false;
    loadButton.disabled = false;
    loadButton.hidden = false;
    googleSlot.hidden = true;
    // Remove the old Google button so the next login gets a fresh nonce.
    while (googleSlot.firstChild) googleSlot.removeChild(googleSlot.firstChild);
  }
  document.addEventListener('nolimits-google-id-signout', resetButton);
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
            // Update the existing account UI without a redirect, so sessions work
            // even when the customer has not approved persistent cookies.
            resetButton();
            document.dispatchEvent(new CustomEvent('nolimits-google-id-success'));
          } catch (_) {
            resetButton();
            report('Die Google-Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut oder verwende die E-Mail-Anmeldung.', true);
          }
        }
      });
      googleSlot.hidden = false;
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
      report('Bitte wähle dein Google-Konto. Falls kein Fenster erscheint, tippe auf den Google-Button.', false);
      // One Tap may not be available on all browsers. The rendered official
      // Google button remains the accessible and tested fallback.
      if (typeof window.google.accounts.id.prompt === 'function') {
        try { window.google.accounts.id.prompt(); } catch (_) { /* optional */ }
      }
    } catch (err) {
      resetButton();
      report(err && err.message || 'Google-Anmeldung konnte nicht vorbereitet werden.', true);
    }
  });
})();

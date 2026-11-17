(function () {
  'use strict';
  // Public OAuth Web Client ID only. Client Secret is kept inside Cloudflare Worker Secret.
  var clientId = '341617264129-o9h3p41bg2d4tftrnu8vmupf02aht5f2.apps.googleusercontent.com';
  var endpoint = 'https://nolimits-booking-test.broken-haze-6cad.workers.dev/api/auth/google/exchange';
  var button = document.getElementById('nl-google-login');
  var status = document.getElementById('nl-code-status') || document.getElementById('nl-social-note');
  var result = document.getElementById('nl-code-result');
  var isAccountPage = !!document.getElementById('nl-login') && !result;
  if (!button || !status || (!result && !isAccountPage)) return;
  // Tell account.js not to attach its former Supabase redirect flow to this button.
  if (isAccountPage) window.NOLIMITS_GOOGLE_ID_ACTIVE = true;
  var client = null;
  var busy = false;

  function report(message, error) {
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('error', !!error);
  }
  function restore(error) {
    busy = false;
    button.disabled = !client;
    if (error) report(error, true);
  }
  function setup() {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      restore('Google-Anmeldung konnte nicht geladen werden.'); return;
    }
    try {
      client = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        select_account: true,
        callback: async function (response) {
          if (!response || response.error || !response.code) {
            restore('Die Google-Anmeldung wurde abgebrochen oder konnte nicht abgeschlossen werden.');
            return;
          }
          report('Google-Anmeldung wird geprüft …', false);
          try {
            var auth = window.NOLIMITS_ACCOUNT;
            if (!auth || !auth.enabled || !auth.client) throw new Error('Kundenkonto nicht bereit.');
            var reply = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'NoLimitsGoogleOAuth' },
              credentials: 'omit',
              cache: 'no-store',
              body: JSON.stringify({ code: response.code })
            });
            var body = await reply.json();
            if (!reply.ok || !body.ok || !body.idToken) throw new Error('Austausch fehlgeschlagen.');
            var login = await auth.client.auth.signInWithIdToken({
              provider: 'google',
              token: body.idToken
            });
            if (login.error) throw login.error;
            // Never put authorization codes, Google tokens, or customer data into logs or URLs.
            report('', false);
            if (isAccountPage) {
              // account.js refreshes the signed-in view without a page redirect.
              document.dispatchEvent(new CustomEvent('nolimits-google-id-success'));
            } else {
              button.hidden = true;
              result.hidden = false;
            }
          } catch (_) {
            restore('Die Google-Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.');
          }
        },
        error_callback: function (e) {
          if (e && (e.type === 'popup_closed' || e.type === 'popup_failed_to_open')) {
            restore('Das Google-Fenster wurde geschlossen oder vom Browser blockiert.');
          } else restore('Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
        }
      });
      button.disabled = false;
      report('', false);
    } catch (_) { restore('Google-Anmeldung konnte nicht eingerichtet werden.'); }
  }

  // Prepare the Google SDK before a click. Only load it when the account
  // login is visible, avoiding third-party requests for already signed-in users.
  // requestCode() is invoked synchronously inside a direct user gesture.
  var started = false;
  function prepare() {
    if (started) return;
    started = true;
    button.disabled = true;
    report('Google-Anmeldung wird geladen …', false);
    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=de';
    script.async = true;
    script.onload = setup;
    script.onerror = function () { restore('Google-Anmeldung konnte nicht geladen werden.'); };
    document.head.appendChild(script);
  }
  button.disabled = true;
  if (isAccountPage) {
    document.addEventListener('nolimits-google-login-visible', prepare);
  } else {
    prepare();
  }
  button.addEventListener('click', function () {
    if (busy || !client) return;
    busy = true;
    button.disabled = true;
    report('', false);
    try { client.requestCode(); } catch (_) { restore('Das Google-Anmeldefenster konnte nicht geöffnet werden.'); }
  });
})();
/* NoLimits internal staff QA; all live requests are opt-in and staging-only.
   Never render, log, store or export the Supabase bearer token or signed manage URL. */
(function () {
  'use strict';
  var LAB = 'https://nolimits-alias-staging.broken-haze-6cad.workers.dev';
  var runButton = document.getElementById('nl-lab-run');
  var authNotice = document.getElementById('nl-lab-auth');
  var output = document.getElementById('nl-lab-output');
  var account = window.NOLIMITS_ACCOUNT;
  var testActive = false;

  function line(message, severity) {
    var item = document.createElement('li');
    item.textContent = message;
    if (severity) item.className = 'nl-lab-' + severity;
    output.appendChild(item);
  }
  function fail(message) {
    throw new Error(message);
  }
  function delay(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
  async function request(method, path, bearer, payload) {
    var headers = {Accept:'application/json'};
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (payload) headers['Content-Type'] = 'application/json';
    var response;
    try {
      response = await fetch(LAB + path, {
        method: method, headers: headers, redirect:'manual', cache:'no-store',
        ...(payload ? {body:JSON.stringify(payload)} : {})
      });
    } catch {
      fail('Das isolierte LAB ist nicht erreichbar. Nur während des freigegebenen Testfensters testen.');
    }
    if (response.status < 200 || response.status >= 300) {
      var errorBody = await response.json().catch(function() { return null; });
      var safeCode = String(errorBody?.error?.code || 'request_failed').replace(/[^a-z0-9_-]/gi, '').slice(0,80);
      fail('LAB-Anfrage fehlgeschlagen (HTTP ' + response.status + ', ' + safeCode + ').');
    }
    var data = await response.json().catch(function() { return null; });
    if (!data || data.ok !== true) fail('Das LAB hat keine gültige Erfolgsantwort gesendet.');
    return data;
  }
  function dateOffset(days) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0,10);
  }
  function urlParams(manageUrl) {
    var url = new URL(manageUrl);
    var uid = url.searchParams.get('uid');
    var token = url.searchParams.get('token');
    if (!uid || !token) fail('Signierte Verwaltungsdaten fehlen.');
    // Preserve the token for emergency cleanup even if the link has a wrong host.
    // Never follow the wrong URL or display the token on screen.
    return {uid:uid,token:token,expectedTarget:
      url.origin === 'https://localboostzs.github.io' &&
      url.pathname === '/nolimits/termin-verwalten/'};
  }
  async function ready() {
    if (!account) {
      authNotice.textContent = 'Anmeldung nicht verfügbar. Bitte die normale Verwaltung öffnen.';
      return false;
    }
    try {
      var person = await account.staff();
      if (!person || !['owner','staff'].includes(person.role)) {
        authNotice.textContent = 'Bitte zuerst über die normale NoLimits-Verwaltung mit einem berechtigten Mitarbeiterkonto anmelden und danach diese Seite im selben Browser-Tab öffnen.';
        return false;
      }
      authNotice.textContent = 'Berechtigte Mitarbeiteranmeldung vorhanden. Der Test kann gestartet werden.';
      return true;
    } catch {
      authNotice.textContent = 'Die Mitarbeiterberechtigung konnte nicht überprüft werden.';
      return false;
    }
  }
  async function run() {
    if (testActive) return;
    testActive = true;
    runButton.disabled = true;
    output.replaceChildren();
    var signed = null, created = false, cancelled = false, crmMatches = false, aliasCleaned = false;
    try {
      if (!(await ready())) fail('Bitte zuerst als Mitarbeiter anmelden.');
      var jwt = await account.bearer();
      if (!jwt) fail('Die Mitarbeiter-Sitzung ist abgelaufen. Bitte erneut anmelden.');
      line('Mitarbeiterberechtigung lokal geprüft.');

      var services = await request('GET','/api/admin/services',jwt);
      if (services.services?.length !== 1 ||
          services.services[0]?.key !== 'haarschnitt' ||
          services.services[0]?.minutes !== 15 ||
          services.services[0]?.price !== 0) {
        fail('LAB-Isolation nicht bestätigt: Es darf nur eine kostenlose 15-Minuten-Testleistung geben.');
      }
      line('LAB-Isolation bestätigt: genau eine kostenlose 15-Minuten-Testleistung.');

      var range = '?service=haarschnitt&start=' + dateOffset(1) + '&end=' + dateOffset(30);
      var slots = await request('GET','/api/admin/slots' + range,jwt);
      var possibilities = Object.values(slots.days || {}).flat()
        .filter(function(v) { return Number.isFinite(Date.parse(v)) && Date.parse(v) > Date.now()+3600000; })
        .sort();
      if (!possibilities.length) fail('Kein verfügbarer LAB-Testtermin in den nächsten 30 Tagen.');
      line('LAB-Verfügbarkeit erfolgreich aus Cal.com abgerufen.');

      var testEmail = 'info+nl-lab-staff-' + Date.now() + '@localboost-zs.ch';
      var book = await request('POST','/api/admin/book',jwt,{
        service:'haarschnitt',name:'NoLimits interner Mitarbeiter-LAB-Test',
        email:testEmail,phone:'+41790000000',start:possibilities[0],
        accepted:true,elapsedMs:8000,notes:'Nur technischer QA-Test. Kein Besuch.'
      });
      if (!book.booking?.uid || book.booking.status !== 'accepted') {
        fail('Cal.com hat die Testbuchung nicht eindeutig bestätigt.');
      }
      created = true;
      signed = urlParams(book.booking.manageUrl);
      if (signed.uid !== book.booking.uid) fail('Der signierte Verwaltungslink gehört nicht zum Testtermin.');
      if (!signed.expectedTarget) fail('Der persönliche Verwaltungslink verweist auf ein unerwartetes Ziel.');
      line('Verbindliche LAB-Testbuchung erstellt und persönlicher Verwaltungslink geprüft.');

      // Bookings may appear slightly later in Cal.com list results. Retry briefly.
      for (var n=0;n<5;n++) {
        if (n>0) await delay(1800);
        var crm = await request('GET','/api/admin/contacts',jwt);
        var entry=(crm.contacts||[]).find(function(c) { return c.email === testEmail; });
        if (entry && (entry.upcoming||[]).some(function(b) { return b.uid === signed.uid; })) {
          if (/info\+[0-9a-f]{32}@localboost-zs\.ch/i.test(JSON.stringify(crm.contacts||[])))
            fail('Interne Aliasadresse ist in den CRM-Antwortdaten sichtbar.');
          crmMatches=true;
          break;
        }
      }
      if (!crmMatches) fail('Der LAB-Alias-Termin wurde nicht rechtzeitig im Mitarbeiter-CRM gefunden.');
      line('CRM erfolgreich: echte interne Testadresse sichtbar, LAB-Buchung korrekt zugeordnet.','success');
    } catch (error) {
      line(error?.message || 'Unerwarteter LAB-Testfehler.','error');
    } finally {
      if (created && !signed) {
        line('WICHTIG: Testbuchung erstellt, aber kein gültiger Stornotoken vorhanden. Bitte intern prüfen und manuell stornieren.','error');
      }
      if (created && signed) {
        try {
          var result = await request('POST','/api/admin/cancel',jwt,{
            uid:signed.uid,confirm:true,
            reason:'Interner Mitarbeiter-LAB-Test erfolgreich beendet'
          });
          cancelled = result.status === 'cancelled' || result.status === 'canceled';
          line(cancelled ? 'LAB-Termin automatisch storniert.' :
            'Die automatische Stornierung konnte nicht bestätigt werden! Bitte melden. ',
            cancelled?'success':'error');
        } catch {
          line('WICHTIG: Die automatische Stornierung ist fehlgeschlagen. Der interne LAB-Termin muss geprüft und storniert werden.','error');
        }
      }
      // Cal.com cancellation webhooks can arrive after the API confirms a
      // cancellation. Give the signed Resend webhook a delivery window BEFORE
      // removing the alias lookup used for the branded cancellation email.
      // Local browser CI runs against 127.0.0.1 and does not send real mail.
      if (cancelled && signed && jwt) {
        line('Stornierung bestätigt. Interne Zustellreserve für die Stornierungsmail läuft.');
        if (location.hostname !== '127.0.0.1') await delay(45000);
        for (var attempt=0;attempt<4 && !aliasCleaned;attempt++) {
          if (attempt>0) await delay(1500);
          try {
            var cleanup=await request('POST','/api/lab/cleanup',jwt,{uid:signed.uid});
            aliasCleaned=cleanup.cleaned===true;
          } catch { /* Cal.com may need a moment to reflect cancellation. */ }
        }
        line(aliasCleaned ? 'Stornierte LAB-Aliaszuordnung aus Supabase entfernt.' :
          'WICHTIG: Die stornierte LAB-Aliaszuordnung konnte nicht bereinigt werden. Bitte melden.',
          aliasCleaned?'success':'error');
      }
      line(crmMatches && cancelled && aliasCleaned ?
        'GESAMTER MITARBEITER-LAB-TEST BESTANDEN. Bitte das Ergebnis an LocalBoost zurückmelden.' :
        'LAB-TEST NOCH NICHT VOLLSTÄNDIG BESTANDEN. Bitte die Ergebnisanzeige zurückmelden.',
        crmMatches && cancelled && aliasCleaned?'success':'error');
      testActive = false;
      runButton.disabled = false;
    }
  }
  runButton.addEventListener('click',run);
  ready().then(function(ok) { runButton.disabled = !ok; });
})();

/* NoLimits Notfallmodus: gemeinsam für Kundenbuchung, Terminverwaltung und Mitarbeiterportal.
   Grundregel gegen falsche Bestätigungen und Doppelbuchungen:
   - Erfolg nur, wenn der Worker den neuen Zustand ausdrücklich bestätigt.
   - «Sicher nicht ausgeführt» nur bei bekannten Fehlercodes oder wenn nichts gesendet wurde.
   - Alles andere ist «Status unklar»: nicht wiederholen, nachfragen. */
(function () {
  'use strict';
  // Isen ist ausschliesslich über WhatsApp erreichbar (Nachricht oder WhatsApp-Anruf): keine Links für normale Anrufe.
  // Geschützte Leerzeichen: Die Nummer bricht nie in der Mitte um.
  var PHONE_TEXT = '076\u00a0801\u00a093\u00a040', WHATSAPP = 'https://wa.me/41768019340';
  var WHATSAPP_NOTE = 'Nur über WhatsApp erreichbar – per Nachricht oder WhatsApp-Anruf.';
  var ICON = '<svg class="nl-wa-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var HOURS = 'Öffnungszeiten: Di 09–12 und 13–19 Uhr, Sa 08–12 und 13–17 Uhr.';
  var UNREACHABLE = 'Das Buchungssystem ist gerade nicht erreichbar.';
  var TIMEOUT = { read: 8000, write: 30000, probe: 6000 };
  // Bei diesen Antworten hat der Worker nachweislich nichts gebucht, verschoben oder storniert.
  // Nicht aufgeführt (also unklar): upstream_unreachable, upstream_error, not_confirmed,
  // unavailable, internal, series_partial und jede Antwort ohne verwertbaren Inhalt.
  var NOTHING_CHANGED = ['offline', 'rate_limited', 'too_large', 'request_too_large', 'invalid_json', 'rejected',
    'too_fast', 'too_soon', 'terms_required', 'confirmation_required', 'invalid_service', 'invalid_name',
    'invalid_email', 'invalid_phone', 'invalid_customer', 'invalid_count', 'invalid_start', 'invalid_booking',
    'invalid_link', 'slot_unavailable', 'booking_rejected', 'series_conflict', 'slots_unavailable', 'alias_unavailable',
    'not_configured', 'not_found', 'not_active', 'cancellation_deadline', 'reschedule_deadline',
    'forbidden_origin', 'forbidden', 'login_required', 'session_invalid', 'auth_unavailable',
    'admin_not_configured', 'staging_admin_disabled', 'staging_series_disabled', 'staging_test_email_only'];
  var PENDING_KEY = 'nl-booking-unklar', PENDING_MS = 24 * 60 * 60 * 1000;

  function failure(message, code, status, unavailable) {
    var e = new Error(message);
    e.code = code; e.status = status || 0; e.unavailable = !!unavailable;
    return e;
  }

  // Anfrage mit Zeitlimit. e.unavailable: keine verwertbare Antwort (Netz, Zeitlimit, 5xx).
  async function request(url, init, timeout) {
    var control = new AbortController();
    var limit = timeout || (init && init.method === 'POST' ? TIMEOUT.write : TIMEOUT.read);
    var timer = setTimeout(function () { control.abort(); }, limit);
    var response, data = null;
    try {
      response = await fetch(url, Object.assign({}, init, { signal: control.signal }));
      try { data = await response.json(); } catch (e) { if (control.signal.aborted) throw e; }
    } catch (e) {
      throw failure(UNREACHABLE, 'network', 0, true);
    } finally { clearTimeout(timer); }
    if (!response.ok || !data || data.ok === false) {
      var error = (data && data.error) || {};
      throw failure(error.message || UNREACHABLE, error.code, response.status, !error.message || response.status >= 500);
    }
    return data;
  }

  // Kurze Prüfung unmittelbar vor einer Änderung: Ist der Dienst nicht erreichbar,
  // wird gar nicht erst gesendet, und es ist sicher nichts passiert.
  async function reachable(api) {
    try { await request(api + '/api/health', { cache: 'no-store' }, TIMEOUT.probe); return true; }
    catch (e) { return e.status > 0 && e.status < 500; }
  }

  function confirmed(booking) {
    return !!booking && booking.status === 'accepted' && typeof booking.uid === 'string' && !!booking.uid &&
      Number.isFinite(Date.parse(booking.start));
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // WhatsApp-Link (Text standardmässig die Nummer), öffnet in einem neuen Fenster.
  function whatsappLink(cls, text) {
    var a = el('a', cls, text || PHONE_TEXT);
    a.href = WHATSAPP; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  function whatsappButton() {
    var a = whatsappLink('btn btn-gold nl-wa nl-notfall-call', '');
    a.innerHTML = ICON; a.appendChild(el('span', null, 'Über WhatsApp buchen'));
    return a;
  }

  // options: title, lines[], retry (Funktion, optional)
  function panel(options) {
    var box = el('div', 'nl-notfall'); box.setAttribute('role', 'alert');
    box.appendChild(el('h3', 'nl-notfall-title', options.title));
    (options.lines || []).forEach(function (line) { box.appendChild(el('p', null, line)); });
    var actions = el('div', 'nl-notfall-actions');
    actions.appendChild(whatsappButton());
    if (options.retry) {
      var again = el('button', 'bk-back', 'Erneut versuchen'); again.type = 'button';
      again.addEventListener('click', options.retry);
      actions.appendChild(again);
    }
    box.appendChild(actions);
    box.appendChild(el('p', 'nl-wa-note', 'WhatsApp ' + PHONE_TEXT + ' · ' + WHATSAPP_NOTE));
    box.appendChild(el('p', 'nl-notfall-hours', HOURS));
    return box;
  }

  // Gemerkt wird nur Leistung und Zeit, keine Personendaten.
  var pending = {
    save: function (record) {
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ service: record.service, start: record.start, at: Date.now() })); }
      catch (e) { /* privater Modus: Schutz gilt dann nur bis zum Neuladen */ }
    },
    read: function () {
      try {
        var r = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
        if (r && Date.now() - r.at < PENDING_MS && Date.parse(r.start) > Date.now()) return r;
        if (r) localStorage.removeItem(PENDING_KEY);
      } catch (e) { /* kein Speicher */ }
      return null;
    },
    clear: function () { try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* kein Speicher */ } },
  };

  window.NOLIMITS_NOTFALL = {
    PHONE_TEXT: PHONE_TEXT, WHATSAPP: WHATSAPP, WHATSAPP_NOTE: WHATSAPP_NOTE, UNREACHABLE: UNREACHABLE,
    request: request, reachable: reachable, confirmed: confirmed, failure: failure,
    notExecuted: function (error) { return NOTHING_CHANGED.indexOf(error && error.code) > -1; },
    whatsappLink: whatsappLink, phoneLink: whatsappLink, panel: panel, pending: pending,
  };
})();

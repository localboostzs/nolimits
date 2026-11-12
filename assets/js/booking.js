(function () {
  'use strict';
  var cfg = window.NOLIMITS_BOOKING || {};
  var API = (cfg.API_BASE || '').replace(/\/$/, '');
  // Nur lokal darf die API per ?api=... überschrieben werden (Tests).
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
    var q = new URLSearchParams(location.search).get('api');
    if (q) API = q.replace(/\/$/, '');
  }
  var TERMS = 'Ich habe zur Kenntnis genommen, dass Termine bei Nichterscheinen oder bei einer Absage weniger als 24 Stunden vor Terminbeginn trotzdem verrechnet werden.';
  var MAX_MONTHS = 3;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };

  var fmtLong = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });
  var fmtMonth = new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  var STEP_NAMES = ['Leistung', 'Datum', 'Uhrzeit', 'Angaben'];

  var root = $('#bk');
  if (!root) return;
  var state = { services: [], service: null, month: null, cache: {}, date: null, slot: null, step: 0, formShown: 0, busy: false };

  var stepsEl = $('#bk-steps'), panels = [$('#p-service'), $('#p-date'), $('#p-form')], okEl = $('#bk-ok');
  var sumEl = $('#bk-summary');

  function setup(msg) {
    var box = $('#p-service');
    box.innerHTML = '';
    var d = el('div', 'bk-setup'); d.appendChild(el('p', null, msg)); box.appendChild(d);
    box.classList.add('is-active');
  }

  async function api(path, init) {
    var res = await fetch(API + path, init);
    var data = null;
    try { data = await res.json(); } catch (e) { /* leer */ }
    if (!res.ok || !data || data.ok === false) {
      var err = new Error((data && data.error && data.error.message) || 'Anfrage fehlgeschlagen.');
      err.code = data && data.error && data.error.code; err.status = res.status; throw err;
    }
    return data;
  }

  /* ---------- Fortschritt ---------- */
  function renderSteps() {
    stepsEl.innerHTML = '';
    var shown = [0, 1, 2, 3];
    shown.forEach(function (i) {
      var li = el('li', i < logical() ? 'is-done' : (i === logical() ? 'is-current' : ''));
      var b = el('button', null, STEP_NAMES[i]); b.type = 'button';
      b.disabled = !(i < logical());
      if (i === logical()) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', function () { goto(i); });
      li.appendChild(b); stepsEl.appendChild(li);
    });
  }
  // logische Schritte: 0 Leistung, 1 Datum, 2 Uhrzeit, 3 Angaben
  function logical() { return state.step; }

  function showPanel(step) {
    state.step = step;
    var map = [0, 1, 1, 2];
    panels.forEach(function (p, i) { p.classList.toggle('is-active', i === map[step]); });
    okEl.classList.remove('is-active');
    $('#bk-main').hidden = false;
    renderSteps(); renderSummary();
    $('#slots-wrap').hidden = !(state.date);
  }
  function goto(step) {
    if (step <= 0) { state.date = null; state.slot = null; }
    else if (step === 1) { state.slot = null; }
    showPanel(step);
    var h = panels[[0, 1, 1, 2][step]].querySelector('.bk-h'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    scrollTop();
  }
  function scrollTop() { var t = $('#bk-main'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }

  /* ---------- Zusammenfassung ---------- */
  function renderSummary() {
    sumEl.innerHTML = '';
    var dl = el('dl');
    function row(k, v, muted) { var w = el('div'); w.appendChild(el('dt', null, k)); w.appendChild(el('dd', muted ? 'muted' : null, v)); dl.appendChild(w); }
    row('Leistung', state.service ? state.service.name : 'Noch nicht gewählt', !state.service);
    if (state.service) row('Dauer', state.service.minutes + ' Minuten');
    if (state.service && Number.isFinite(state.service.price)) row('Preis (Zahlung vor Ort)', 'CHF ' + state.service.price);
    row('Datum', state.date ? fmtLong.format(new Date(state.date + 'T12:00:00Z')) : 'Noch nicht gewählt', !state.date);
    row('Uhrzeit', state.slot ? state.slot.slice(11, 16) + ' Uhr' : 'Noch nicht gewählt', !state.slot);
    sumEl.appendChild(dl);
    var a = el('p', 'addr', 'NoLimits Barbershop, Schmiedgasse 94, 6438 Ibach');
    sumEl.appendChild(a);
  }

  /* ---------- Schritt 1: Leistungen ---------- */
  function renderServices() {
    var box = $('#services'); box.innerHTML = '';
    state.services.forEach(function (s) {
      var b = el('button', 'bk-service'); b.type = 'button'; b.setAttribute('aria-pressed', state.service && state.service.key === s.key ? 'true' : 'false');
      b.appendChild(el('span', 'n', s.name));
      b.appendChild(el('span', 'd', s.minutes + ' Minuten' + (Number.isFinite(s.price) ? ' · CHF ' + s.price : '')));
      var go = el('span', 'go'); go.setAttribute('aria-hidden', 'true'); go.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'; b.appendChild(go);
      b.addEventListener('click', function () { state.service = s; state.cache = {}; state.date = null; state.slot = null; var n = new Date(); state.month = { y: Number(fmtYM(n).y), m: Number(fmtYM(n).m) - 1 }; showPanel(1); loadMonth(); var h = $('#p-date .bk-h'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); scrollTop(); });
      box.appendChild(b);
    });
  }
  function fmtYM(d) { var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-'); return { y: p[0], m: p[1], d: p[2] }; }

  /* ---------- Schritt 2/3: Kalender und Zeiten ---------- */
  function monthKey() { return state.month.y + '-' + pad(state.month.m + 1); }
  async function loadMonth() {
    var key = monthKey();
    renderCalendar(true);
    if (!state.cache[key]) {
      var last = new Date(Date.UTC(state.month.y, state.month.m + 1, 0)).getUTCDate();
      try {
        var d = await api('/api/slots?service=' + encodeURIComponent(state.service.key) + '&start=' + iso(state.month.y, state.month.m, 1) + '&end=' + iso(state.month.y, state.month.m, last));
        state.cache[key] = d.days;
      } catch (e) { renderCalendarError(e); return; }
    }
    renderCalendar(false);
  }
  function renderCalendarError(e) {
    var g = $('#cal'); g.innerHTML = '';
    var m = el('div', 'bk-msg', e.message + ' '); var r = el('button', 'bk-back', 'Erneut versuchen'); r.type = 'button'; r.addEventListener('click', loadMonth); m.appendChild(r); g.appendChild(m);
  }
  function renderCalendar(loading) {
    var y = state.month.y, m = state.month.m;
    $('#cal-title').textContent = fmtMonth.format(new Date(Date.UTC(y, m, 1)));
    var now = fmtYM(new Date());
    var cy = Number(now.y), cm = Number(now.m) - 1;
    var idx = (y - cy) * 12 + (m - cm);
    $('#cal-prev').disabled = idx <= 0; $('#cal-next').disabled = idx >= MAX_MONTHS;
    var g = $('#cal'); g.innerHTML = '';
    if (loading) { var l = el('div', 'bk-loading'); l.setAttribute('role', 'status'); l.appendChild(el('span', 'bk-spin')); l.appendChild(el('span', 'sr-only', 'Termine werden geladen')); g.appendChild(l); return; }
    var grid = el('div', 'bk-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', fmtMonth.format(new Date(Date.UTC(y, m, 1))));
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(function (d) { var c = el('div', 'bk-dow', d); c.setAttribute('aria-hidden', 'true'); grid.appendChild(c); });
    var first = new Date(Date.UTC(y, m, 1)).getUTCDay(); var offset = (first + 6) % 7;
    for (var i = 0; i < offset; i++) grid.appendChild(el('div'));
    var days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); var data = state.cache[monthKey()] || {};
    for (var d = 1; d <= days; d++) {
      (function (d) {
        var key = iso(y, m, d); var free = !!data[key];
        var b = el('button', 'bk-day' + (free ? ' is-free' : '') + (key === iso(cy, cm, Number(now.d)) ? ' is-today' : ''), String(d)); b.type = 'button';
        b.setAttribute('aria-label', fmtLong.format(new Date(key + 'T12:00:00Z')) + (free ? ', Termine frei' : ', keine freien Termine'));
        if (!free) b.disabled = true; else {
          b.setAttribute('aria-pressed', state.date === key ? 'true' : 'false');
          b.addEventListener('click', function () { state.date = key; state.slot = null; renderCalendar(false); renderSlots(); renderSummary(); showSteps(2); });
        }
        grid.appendChild(b);
      })(d);
    }
    g.appendChild(grid);
    var any = Object.keys(data).length;
    $('#cal-note').textContent = any ? '' : 'In diesem Monat sind aktuell keine freien Termine verfügbar.';
  }
  function showSteps(s) { state.step = s; renderSteps(); $('#slots-wrap').hidden = !state.date; }
  function renderSlots() {
    var data = state.cache[monthKey()] || {}; var list = data[state.date] || [];
    $('#slots-title').textContent = fmtLong.format(new Date(state.date + 'T12:00:00Z'));
    var box = $('#slots'); box.innerHTML = '';
    if (!list.length) { box.appendChild(el('p', 'bk-empty', 'Für diesen Tag sind keine freien Zeiten mehr verfügbar.')); return; }
    list.forEach(function (s) {
      var b = el('button', 'bk-slot', s.slice(11, 16)); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', s.slice(11, 16) + ' Uhr');
      b.addEventListener('click', function () { state.slot = s; Array.prototype.forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); }); renderSummary(); setTimeout(function () { showPanel(3); state.formShown = Date.now(); var h = $('#p-form .bk-h'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); scrollTop(); }, 260); });
      box.appendChild(b);
    });
    $('#slots-wrap').scrollIntoView && setTimeout(function () { var w = $('#slots-wrap'); if (w.getBoundingClientRect().bottom > innerHeight) w.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }, 60);
  }

  /* ---------- Schritt 4: Formular ---------- */
  function fieldError(id, msg) { var i = $('#' + id); var e = $('#' + id + '-err'); if (msg) { i.setAttribute('aria-invalid', 'true'); e.textContent = msg; } else { i.removeAttribute('aria-invalid'); e.textContent = ''; } return !msg; }
  function validate() {
    var f = $('#bk-form'); var ok = true;
    ok = fieldError('f-name', f.name.value.trim().length < 2 ? 'Bitte Namen angeben.' : '') && ok;
    ok = fieldError('f-email', !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(f.email.value.trim()) ? 'Bitte gültige E-Mail-Adresse angeben.' : '') && ok;
    ok = fieldError('f-phone', !/^\+?[0-9 ()\/.-]{7,25}$/.test(f.phone.value.trim()) ? 'Bitte gültige Telefonnummer angeben.' : '') && ok;
    ok = fieldError('f-address', f.address.value.trim().length < 5 ? 'Bitte vollständige Adresse angeben.' : '') && ok;
    var t = $('#f-terms'); var te = $('#f-terms-err'); if (!t.checked) { t.setAttribute('aria-invalid', 'true'); te.textContent = 'Bitte bestätigen, um fortzufahren.'; ok = false; } else { t.removeAttribute('aria-invalid'); te.textContent = ''; }
    return ok;
  }
  function formMsg(msg) { var m = $('#bk-formmsg'); m.textContent = msg || ''; m.hidden = !msg; if (msg) m.focus(); }
  async function submit(ev) {
    ev.preventDefault(); if (state.busy) return; formMsg('');
    if (!validate()) { var bad = $('#bk-form [aria-invalid="true"]'); if (bad) bad.focus(); return; }
    var f = ev.target; var btn = $('#bk-submit'); state.busy = true; btn.disabled = true; var old = btn.textContent; btn.textContent = 'Wird gebucht …';
    try {
      var r = await api('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: state.service.key, start: state.slot, name: f.name.value, email: f.email.value, phone: f.phone.value, notes: ('Adresse: ' + f.address.value.trim() + (f.notes.value.trim() ? '\nNotiz: ' + f.notes.value.trim() : '')).slice(0, 500), accepted: $('#f-terms').checked, website: f.website.value, elapsedMs: Date.now() - state.formShown }) });
      showSuccess(r.booking);
    } catch (e) {
      if (e.code === 'slot_unavailable') {
        delete state.cache[monthKey()]; state.slot = null; formMsg(e.message); showPanel(2); state.step = 1; renderSteps();
        await loadMonth(); if (state.cache[monthKey()] && state.cache[monthKey()][state.date]) renderSlots(); else { state.date = null; $('#slots-wrap').hidden = true; }
        showPanel(1); $('#slots-wrap').hidden = !state.date;
        var m = $('#cal-note'); m.textContent = e.message;
      } else if (e.code === 'invalid_email') { fieldError('f-email', e.message); $('#f-email').focus(); }
      else formMsg(e.message || 'Die Buchung konnte nicht abgeschlossen werden. Bitte erneut versuchen.');
    } finally { state.busy = false; btn.disabled = false; btn.textContent = old; }
  }

  /* ---------- Erfolg ---------- */
  function showSuccess(b) {
    $('#bk-main').hidden = true; sumEl.parentElement.hidden = true; $('#bk-steps').parentElement.hidden = true;
    var dl = $('#ok-list'); dl.innerHTML = '';
    function row(k, v) { var w = el('div'); w.appendChild(el('dt', null, k)); w.appendChild(el('dd', null, v)); dl.appendChild(w); }
    var start = new Date(b.start);
    row('Leistung', b.service);
    row('Datum', fmtLong.format(start));
    row('Uhrzeit', new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(start) + ' Uhr');
    row('Ort', 'NoLimits Barbershop, Schmiedgasse 94, 6438 Ibach');
    okEl.classList.add('is-active'); okEl.hidden = false;
    var h = okEl.querySelector('h2'); h.setAttribute('tabindex', '-1'); h.focus();
    okEl.scrollIntoView({ block: 'start' });
  }

  /* ---------- Start ---------- */
  async function init() {
    $('#f-terms-label').textContent = TERMS;
    $('#cal-prev').addEventListener('click', function () { state.month.m--; if (state.month.m < 0) { state.month.m = 11; state.month.y--; } state.date = null; $('#slots-wrap').hidden = true; loadMonth(); });
    $('#cal-next').addEventListener('click', function () { state.month.m++; if (state.month.m > 11) { state.month.m = 0; state.month.y++; } state.date = null; $('#slots-wrap').hidden = true; loadMonth(); });
    ['f-name', 'f-email', 'f-phone', 'f-address'].forEach(function (id) { $('#' + id).addEventListener('input', function () { fieldError(id, ''); }); });
    $('#f-terms').addEventListener('change', function () { this.removeAttribute('aria-invalid'); $('#f-terms-err').textContent = ''; });
    $('#bk-form').addEventListener('submit', submit);
    $('#bk-back-date').addEventListener('click', function () { goto(1); });
    $('#bk-back-svc').addEventListener('click', function () { goto(0); });
    $('#bk-again').addEventListener('click', function () { location.reload(); });
    if (!API) { renderSteps(); renderSummary(); setup('Die Verbindung zum Buchungssystem ist noch nicht eingerichtet. Sobald der Buchungsdienst aktiv ist, können Termine hier gebucht werden.'); return; }
    renderSteps(); renderSummary();
    $('#services').innerHTML = ''; var l = el('div', 'bk-loading'); l.appendChild(el('span', 'bk-spin')); $('#services').appendChild(l);
    panels[0].classList.add('is-active');
    try {
      var d = await api('/api/services'); state.services = d.services; renderServices();
    } catch (e) { $('#services').innerHTML = ''; var m = el('div', 'bk-msg', 'Die Leistungen konnten nicht geladen werden. Bitte später erneut versuchen.'); $('#services').appendChild(m); }
  }
  init();
})();

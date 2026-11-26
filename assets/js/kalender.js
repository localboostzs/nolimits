/* NoLimits Terminwahl: Monatskalender und freie Uhrzeiten im Design der Kundenbuchung
   (Klassen bk-cal-head, bk-grid, bk-day, bk-slots aus booking.css). Wird im Mitarbeiterportal
   für neue Termine und für Verschiebungen verwendet. Zeigt nur Zeiten, die der Worker liefert;
   verbindlich prüft der Worker bzw. Cal.com beim Absenden. */
(function () {
  'use strict';
  var TZ = 'Europe/Zurich';
  var dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  var timeFmt = new Intl.DateTimeFormat('de-CH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  var longFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var monthFmt = new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  var ARROW = { prev: 'M15 6l-6 6 6 6', next: 'M9 6l6 6-6 6' };
  var seq = 0;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function zurichDay(value) { return dayFmt.format(new Date(value)); }
  function time(value) { return timeFmt.format(new Date(value)); }
  function arrow(dir, label) {
    var b = el('button', 'bk-nav'); b.type = 'button'; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="' + ARROW[dir] + '"/></svg>';
    return b;
  }

  // options: load(firstDay, lastDay) -> Promise<{day: [isoStart, ...]}>, onChange(start|null),
  //          maxMonths (Standard 12), label (Name für Screenreader)
  function create(container, options) {
    var id = 'nl-cal-' + (++seq);
    var today = zurichDay(Date.now());
    var now = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 };
    var maxMonths = options.maxMonths == null ? 12 : options.maxMonths;
    var state = { month: { y: now.y, m: now.m }, days: {}, day: '', start: '', request: 0, enabled: false };

    container.classList.add('nl-picker');
    var head = el('div', 'bk-cal-head');
    var prev = arrow('prev', 'Vorheriger Monat'), next = arrow('next', 'Nächster Monat');
    var title = el('h3', 'bk-month'); title.id = id + '-month'; title.setAttribute('aria-live', 'polite');
    head.append(prev, title, next);
    var grid = el('div', 'nl-picker-grid');
    var note = el('p', 'bk-empty nl-picker-note'); note.setAttribute('role', 'status');
    var slotsWrap = el('div', 'bk-slots-wrap'); slotsWrap.hidden = true;
    var slotsTitle = el('h4', 'bk-slots-title'); slotsTitle.id = id + '-slots';
    var slots = el('div', 'bk-slots'); slots.setAttribute('role', 'group'); slots.setAttribute('aria-labelledby', slotsTitle.id);
    slotsWrap.append(slotsTitle, slots);
    container.replaceChildren(head, grid, note, slotsWrap);

    function index() { return (state.month.y - now.y) * 12 + (state.month.m - now.m); }
    function key(d) { return state.month.y + '-' + pad(state.month.m + 1) + '-' + pad(d); }
    function changed() { if (options.onChange) options.onChange(state.start || null); }
    function clearChoice(silent) {
      state.day = ''; state.start = '';
      slots.replaceChildren(); slotsWrap.hidden = true;
      if (!silent) changed();
    }
    function paintHead() {
      title.textContent = monthFmt.format(new Date(Date.UTC(state.month.y, state.month.m, 1)));
      prev.disabled = !state.enabled || index() <= 0;
      next.disabled = !state.enabled || index() >= maxMonths;
    }
    function paint(mode, error) {
      paintHead();
      grid.replaceChildren();
      grid.setAttribute('aria-busy', String(mode === 'loading'));
      note.textContent = '';
      if (mode === 'idle') { note.textContent = options.idleText || 'Bitte zuerst eine Leistung wählen.'; return; }
      if (mode === 'loading') {
        var l = el('div', 'bk-loading'); l.setAttribute('role', 'status');
        l.append(el('span', 'bk-spin'), el('span', 'sr-only', 'Freie Termine werden geladen'));
        grid.appendChild(l); return;
      }
      if (mode === 'error') {
        var m = el('div', 'bk-msg', (error && error.message ? error.message : 'Freie Termine konnten nicht geladen werden.') + ' ');
        var retry = el('button', 'bk-back', 'Erneut versuchen'); retry.type = 'button';
        retry.addEventListener('click', load); m.appendChild(retry); grid.appendChild(m); return;
      }
      var g = el('div', 'bk-grid'); g.setAttribute('role', 'group');
      g.setAttribute('aria-label', options.label || title.textContent);
      ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(function (d) { var c = el('div', 'bk-dow', d); c.setAttribute('aria-hidden', 'true'); g.appendChild(c); });
      var offset = (new Date(Date.UTC(state.month.y, state.month.m, 1)).getUTCDay() + 6) % 7;
      for (var i = 0; i < offset; i++) g.appendChild(el('div'));
      var last = new Date(Date.UTC(state.month.y, state.month.m + 1, 0)).getUTCDate();
      for (var d = 1; d <= last; d++) {
        (function (k, n) {
          var free = k >= today && (state.days[k] || []).length > 0;
          var b = el('button', 'bk-day' + (free ? ' is-free' : '') + (k === today ? ' is-today' : ''), String(n));
          b.type = 'button'; b.dataset.day = k;
          b.setAttribute('aria-label', longFmt.format(new Date(k + 'T12:00:00Z')) + (free ? ', Termine frei' : k < today ? ', vergangen' : ', keine freien Termine'));
          if (!free) b.disabled = true;
          else {
            b.setAttribute('aria-pressed', String(state.day === k));
            b.addEventListener('click', function () { choose(k); });
          }
          g.appendChild(b);
        })(key(d), d);
      }
      grid.appendChild(g);
      if (!Object.keys(state.days).length) note.textContent = 'In diesem Monat sind keine freien Termine verfügbar.';
    }
    function choose(k) {
      state.day = k; state.start = '';
      Array.prototype.forEach.call(grid.querySelectorAll('.bk-day.is-free'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.day === k)); });
      slotsTitle.textContent = longFmt.format(new Date(k + 'T12:00:00Z'));
      slots.replaceChildren();
      (state.days[k] || []).forEach(function (start) {
        var b = el('button', 'bk-slot', time(start)); b.type = 'button';
        b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', time(start) + ' Uhr');
        b.dataset.start = start;
        b.addEventListener('click', function () {
          state.start = start;
          Array.prototype.forEach.call(slots.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
          changed();
        });
        slots.appendChild(b);
      });
      slotsWrap.hidden = false;
      changed();
    }
    async function load() {
      var request = ++state.request;
      clearChoice(true); changed();
      state.days = {};
      if (!state.enabled) { paint('idle'); return; }
      paint('loading');
      var first = key(1), last = key(new Date(Date.UTC(state.month.y, state.month.m + 1, 0)).getUTCDate());
      try {
        var raw = await options.load(first, last);
        if (request !== state.request) return; // veraltete Antwort nach Monats- oder Leistungswechsel
        var days = {};
        Object.keys(raw || {}).forEach(function (k) {
          if (k < first || k > last || k < today || !Array.isArray(raw[k])) return;
          var list = raw[k].filter(function (s) { var t = Date.parse(s); return Number.isFinite(t) && t > Date.now() && zurichDay(t) === k; });
          if (list.length) days[k] = Array.from(new Set(list)).sort(function (a, b) { return Date.parse(a) - Date.parse(b); });
        });
        state.days = days;
        paint('ready');
      } catch (e) {
        if (request === state.request) paint('error', e);
      }
    }
    prev.addEventListener('click', function () { if (index() > 0) { var d = new Date(Date.UTC(state.month.y, state.month.m - 1, 1)); state.month = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; load(); } });
    next.addEventListener('click', function () { if (index() < maxMonths) { var d = new Date(Date.UTC(state.month.y, state.month.m + 1, 1)); state.month = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; load(); } });

    var api = {
      // Neue Leistung o. Ä.: Auswahl verwerfen und den Monat neu laden.
      reset: function (enabled, month) {
        state.enabled = !!enabled;
        if (month) state.month = { y: month.y, m: month.m }; else state.month = { y: now.y, m: now.m };
        return load();
      },
      reload: function () { return load(); },
      selected: function () { return state.start || null; },
      day: function () { return state.day || null; },
      // Prüft vor dem Absenden, ob die gewählte Zeit laut Worker noch frei ist.
      stillFree: async function () {
        if (!state.start) return false;
        var raw = await options.load(state.day, state.day);
        return (raw && raw[state.day] || []).some(function (s) { return Date.parse(s) === Date.parse(state.start); });
      }
    };
    paint('idle');
    return api;
  }
  window.NOLIMITS_KALENDER = { create: create, zurichDay: zurichDay, time: time };
})();

/* NoLimits Preisanpassung: Termine ab 01.01.2027 (Zürcher Zeit) kosten CHF 5 mehr.
   Massgebend ist das Termindatum, nicht das Buchungsdatum. Verbindlich rechnet der
   Worker (priceAt in worker/src/index.js); hier wird nur angezeigt. */
(function () {
  'use strict';
  var FROM = '2027-01-01', AMOUNT = 5;
  var zurich = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
  // Zeitpunkt -> Kalendertag JJJJ-MM-TT in Zürich.
  function day(value) { return zurich.format(new Date(value)); }
  function german(date) { return date.split('-').reverse().join('.'); }
  // service: Antwort des Workers {price, priceChange?: {from, price}}; date: JJJJ-MM-TT.
  function on(service, date) {
    var change = service.priceChange;
    return change && date >= change.from ? change.price : service.price;
  }
  // Ohne Datum werden beide Preise genannt, mit Datum nur der gültige.
  function label(service, date) {
    var change = service.priceChange;
    if (date || !change) return 'CHF ' + on(service, date || '');
    return 'CHF ' + service.price + ' (ab ' + german(change.from) + ': CHF ' + change.price + ')';
  }
  window.NOLIMITS_PREISE = { FROM: FROM, day: day, on: on, label: label };

  // Feste Preisangaben der Website: bis Ende 2026 zeigt das HTML beide Preise.
  // Ab dem Stichtag bleibt nur der neue Preis stehen, Hinweise verschwinden.
  function updateStatic() {
    if (day(Date.now()) < FROM) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-nl-price]'), function (node) {
      node.textContent = (node.getAttribute('data-nl-prefix') || '') + 'CHF\u00a0' + (Number(node.getAttribute('data-nl-price')) + AMOUNT);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nl-price-note]'), function (node) { node.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateStatic);
  else updateStatic();
})();

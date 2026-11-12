(function () {
  'use strict';
  var root = document.documentElement;

  /* 1 u = 1 % der Seitenbreite (ohne Scrollbalken), maximal 1920 px – wie im Original. */
  function setUnit() {
    var w = Math.min(root.clientWidth || window.innerWidth, 1920);
    root.style.setProperty('--u', (w / 100) + 'px');
  }
  setUnit();
  window.addEventListener('resize', setUnit);

  /* Alle Buchungs-Buttons zeigen auf die zentrale BOOKING_URL (assets/js/config.js). */
  function applyBooking() {
    var cfg = window.NOLIMITS_CONFIG || {};
    if (!cfg.BOOKING_URL) return;
    var links = document.querySelectorAll('a[data-booking]');
    for (var i = 0; i < links.length; i++) links[i].setAttribute('href', cfg.BOOKING_URL);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBooking);
  else applyBooking();
})();

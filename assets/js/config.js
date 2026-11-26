/* Buchungs-URL. Sie liegt immer in derselben Website wie diese Datei, egal ob diese
   unter der eigenen Domain, unter *.pages.dev, unter einem Unterpfad oder lokal läuft.
   Massgebend ist der Speicherort des Skripts, nicht eine fest eingetragene Adresse. */
(function () {
  'use strict';
  var script = document.currentScript;
  var base = script && script.src
    ? new URL('../../', script.src)
    : new URL('/', window.location.href);
  window.NOLIMITS_CONFIG = { BOOKING_URL: new URL('booking-test/', base).href };
})();

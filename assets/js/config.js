/* Zentrale, sichere Buchungs-URL für die Demo und die spätere NoLimits-Domain.
   Beide öffentlich zulässigen Produktions-Hosts benutzen /booking-test/ am Root.
   Alle anderen Hosts (einschliesslich der GitHub-Demo) führen zur bekannten Demo-URL.
   Die Umstellung ist zunächst NUR auf dem Feature-Branch vorbereitet.
   Es werden KEINE Domain-, DNS-, Worker- oder Cal.com-Einstellungen geändert. */
(function () {
  'use strict';
  var host = String(window.location.hostname || '').toLowerCase();
  var productionHost = host === 'www.nolimits-barber.ch' || host === 'nolimits-barber.ch';
  var destination = productionHost
    ? window.location.origin + '/booking-test/'
    : 'https://localboostzs.github.io/nolimits/booking-test/';
  window.NOLIMITS_CONFIG = { BOOKING_URL: destination };
})();

# NoLimits – Umsetzung nach Isen-Treffen (23.11.2026)

## Entscheidungen, noch KEIN Go-live
- Gentleman Rasur: öffentlich als zehnte Leistung, 30 Minuten, CHF 30, Beschreibung genau «Bart formen, gefolgt von einer Gesichtsmassage und Heißkompresse». Vorläufig bestehendes Rasur-Foto.
- Buchungsvorlauf: strikt mehr als 60 Minuten, so dass 15:00 um 13:59 möglich ist und um 14:00 nicht.
- Online-Storno: nur bis mindestens 24 Stunden vor dem Termin, serverseitig erzwungen.
- Umbuchung: eigener NoLimits-Monatskalender mit freien Tagen und Uhrzeiten, statt nativer iOS-Datumseingabe; neue Zeit mehr als eine Stunde im Voraus.
- Mitarbeiter-Serientermine: 4, 8 oder 12 wöchentliche Termine, mit Prüfung der Cal.com-Verfügbarkeit VOR jeglicher Erstellung. Bei einem nachträglichen API-Fehler können bereits einige Termine gebucht sein, diese sind ausdrücklich zu kontrollieren.
- Zielkalender: Isens Google-Kalender; er verbindet ihn selbst über OAuth im vorhandenen Cal.com-Konto.
- Isens Kundenkonto muss im Supabase-Auth-System nachgewiesen werden, bevor die Mitarbeiterrolle eingerichtet wird.
- Gewünschtes Go-live-Fenster: Woche 23.–29.11.2026, keine automatische Produktionsfreigabe.

## Geänderte Dateien im vorbereiteten Feature-Branch
- worker/src/services.js: Gentleman Rasur öffentlich
- worker/src/index.js: Cutoffs, getrennte Online-Aktionsberechtigungen und geschützter Wochenserien-Endpunkt
- assets/js/booking.js; leistungen/index.html: Dienstleistung, Bild und Stornotext
- termin-verwalten/index.html; assets/js/manage.js; assets/css/manage.css: mobiler Monatskalender
- verwaltung/index.html; assets/js/admin.js: staff-only Serientermin-Steuerung
- tests/NoLimits_MeetingEntscheide_20261123.mjs: neue isolierte Integrationstests
- tests/NoLimits_ManageBrowser_E2E_20261119.mjs: Browser-Test auf Monatskalender umgestellt

## Tests
Node-Syntaxchecks der betroffenen JS-Dateien bestanden. Mock-Tests für Kunden-Termin, Alias-CRM und Alias-Buchung bestanden. Neuer Mock-Test für zehn öffentliche Leistungen, Vorlauf, staff-only Serientermine inklusive Konfliktvorprüfung und serverseitige 24h-Stornos bestanden. Ein echter iPhone-/Playwright-Browsertest und alle GitHub Actions stehen zur Schlussprüfung aus.

## Notwendige nächste Schritte vor Go-live
1. Google-Kalender auf Cal.com selbst über Google-OAuth verbinden, als Zielkalender einstellen, als Busy-Kalender auswählen und Konflikte mit Wix-Buchungen testen; bestehender LocalBoost-Kalender bleibt bis zur Bestätigung erhalten.
2. Isen meldet sich im NoLimits-Kundenkonto an; nach Auth-UID-Nachweis Rolle owner bzw. staff in der RLS-geschützten nl_staff-Tabelle freischalten.
3. Test aller zehn Dienstleistungen, tatsächlicher Öffnungszeiten, Buchungsregeln, Mails, CRM und Kundenkonto am Desktop und iPhone; Datenschutzerklärung/Supportadresse abnehmen.
4. Vor dem Cutover frischen Wix-Export zukünftiger Termine plus Kontakte erstellen, sicher lagern, prüfen, Testmigration und Dublettenschutz durchführen; während finaler Übernahme Wix-Neubuchungen kontrolliert stoppen, Delta-Abgleich und keine verlorenen Termine.
5. Backup mit verschlüsselter Offsite-Kopie und Restore prüfen, Worker/Alias-Konfiguration und Supabase-Auth-Redirects für echte Domain vorbereiten. NL_ICS_ENABLED=false belassen.
6. Nach dokumentiertem Go-live-GO PR #3 und Backend kontrolliert freigeben, Wix-DNS Domain mit GitHub Pages verbinden, HTTPS/Mail und sämtliche Abläufe testen. Wix erst danach deaktivieren.

Serien bis 12 Wochen, nicht unendlich; bei Teilfehlern niemals ungeprüft die gesamte Serie erneut buchen. Die aktuellen Cal EventType-IDs bleiben bestehen, LAB Event 7982460 bleibt isoliert.

**Nicht erfolgt:** kein Merge in main, kein produktiver Worker-/Alias-Deploy, keine DNS- oder Wix-Änderungen, keine echten Kundentermine importiert.

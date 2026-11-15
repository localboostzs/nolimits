# NoLimits – Cookie-Banner und Abnahmeplan
Stand: 15.11.2026

## Umsetzung
- Einwilligungs-Banner auf allen 8 Website-Seiten, mobile-first, schwarz-gold.
- Kategorien: optionale dauerhafte Kundenanmeldung und externes Google Maps.
- Alle ablehnen: Keine dauerhafte Supabase-Session auf diesem Gerät.
  Eine neue Anmeldung bleibt nur im aktuellen Browser-Tab (sessionStorage)
  verfügbar; beim Schliessen des Tabs endet die lokale Sitzung.
- Alle akzeptieren: Supabase-Session darf im localStorage gespeichert bleiben.
- Anpassen: Beide optionalen Kategorien getrennt ein- oder ausschalten.
- Footer-Link «Cookie-Einstellungen» auf jeder Seite zum Widerruf.
- Google-Maps-iframe auf Start/Kontakt wird ohne Einwilligung NICHT geladen.
  «Karte einmalig laden» erlaubt die Karte nur für diese Seitenansicht,
  ohne dauerhafte Zustimmung für weitere Besuche.
- Die Auswahl wird ausschliesslich als notwendige Einstellung im
  localStorage unter nl_privacy_options_v1 gespeichert.
- Supabase Auth nutzt einen consent-gesteuerten Storage-Adapter. Die
  frühere lokale Supabase-Anmeldung wird vor der Ersteinwilligung entfernt.
- Datenschutzerklärung hinsichtlich der neuen Browser-Speicherfunktionen,
  optionalem Google Maps und NoLimits-Kundenkonto ergänzt.

## Automatisierte Tests
- tests/NoLimits_CookieBanner_Tests_20261115.mjs
- Befehl: node tests/NoLimits_CookieBanner_Tests_20261115.mjs
- Deckt Erstbesuch, keine Google-Maps-Verbindung vor Einwilligung,
  Consent-Speicherung, Login-Token-Speicherung, temporäre Session,
  Akzeptieren/Ablehnen, Präferenzwechsel, Speicherauswahl, neuen Tab,
  Abmeldung und individuell auswählbare Google Maps ab.

## Test im Browser (Chrome und iPhone Safari)
1. Website im privaten Fenster öffnen: Banner erscheint.
2. «Alle ablehnen» anklicken. Website und 9 Leistungen normal sichtbar.
   Auf Start/Kontakt muss stattdessen ein Google-Maps-Platzhalter sichtbar sein.
3. In den Footer scrollen, «Cookie-Einstellungen» öffnen.
4. «Anpassen» wählen; nur Google Maps einschalten. Karten sollten
   funktionieren; Login darf NICHT dauerhaft im localStorage stehen.
5. Anmeldung auf /konto/ testen (mit erlaubter Supabase-Testadresse).
   Nach dem Schliessen des Browser-Tabs muss ein neuer Tab abgemeldet sein.
6. Im Footer «Alle akzeptieren» wählen, danach anmelden.
   Tab schliessen und neu öffnen: Anmeldung soll bleiben.
7. «Alle ablehnen» wählen, Tab schliessen, neue Seite öffnen:
   dauerhaft gespeicherter Login muss entfernt sein.
8. Karte «einmalig laden» im Ablehnen-Modus testen; bei neuer
   Seitenansicht darf sie ohne erneute Zustimmung nicht automatisch laden.
9. Ausloggen und Prüfen, dass die Anmeldung auch bei Akzeptieren verschwindet.
10. Cookie-Banner auf Mobile auf Überlappung, Lesbarkeit und Tastaturbedienung
    prüfen. Einwilligung nicht von optionalen Diensten abhängig machen.

## Noch offen für die Produktivfreigabe
- Eigener E-Mail-Absender: in Resend Isens Domain verifizieren,
  eigenes SMTP in Supabase konfigurieren und Testmail senden.
- E-Mail-Templates «Confirm signup» und «Magic Link» noch im
  Supabase Dashboard einfügen und speichern (Dateien unter emails/).
- Mitarbeiter-Admin-API mit Supabase Auth hat noch einen offenen
  HTTP-503-Aufruf: GitHub Issue #1; daher keine Live-Abnahme der
  Kundenverwaltung.
- Isen muss Cal.com, Kalender und Wix-Export freigeben.
- Domain erst nach vollständigem Test und Terminmigration umstellen.

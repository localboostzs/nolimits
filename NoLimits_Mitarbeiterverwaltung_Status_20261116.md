# NoLimits – Mitarbeiterverwaltung und Teststatus (16.11.2026)

## Technisch erledigt
- Cloudflare-Admin-API 503-Fehler behoben: Workers unterstützt redirect: error
  nicht, jetzt redirect: manual und nur 2xx-Antworten zugelassen.
- Anonyme und manipulierte Anmeldungen liefern 401; inaktive Mitarbeitende 403.
- Hidden Gentleman Rasur (30 Minuten, CHF 30) nur in Staff-Services.
- Kundenkonten: E-Mail wird automatisch aus verifizierter Auth-Identität
  übernommen und in NoLimits-Datenbank gespeichert.
- Aktive Mitarbeitende können Kundenkontaktdaten über RLS lesen; Kunden
  sehen ausschliesslich ihre eigenen Profile.
- Importierte Wix-Kontakte (auch ohne E-Mail, nur Telefonnummer) in Staff-Liste.
- Ohne Cal.com-API-Schlüssel bleibt die Kundenliste benutzbar; fehlende
  zukünftige/vergangene Termine werden ausdrücklich als unvollständig
  angezeigt. Keine Termine erfunden.
- Kontakte aus fremden Cal.com-Event-Types werden niemals aufgenommen.
- Temporäre Test-Mitarbeiterrolle (staff, aktiv) für das bestätigte
  LocalBoost-Testkonto eingerichtet, kein Besitzer- oder Isen-Konto angelegt.
  Vor Übergabe nur mit Isens Zustimmung beibehalten, sonst deaktivieren.
- SQL-Migration supabase/migrations/20261116_nolimits_customer_crm.sql aktiv.

## Sofortiger Nutzertest (mit bereits bestätigtem LocalBoost-Testkonto)
1. https://localboostzs.github.io/nolimits/konto/ öffnen.
2. Mit der bekannten LocalBoost-Test-E-Mail anmelden.
3. https://localboostzs.github.io/nolimits/verwaltung/ öffnen.
4. Die Mitarbeiter-Services inklusive Gentleman-Rasur sollten sichtbar sein.
5. Die eigene bestätigte NoLimits-Kundenkarte sollte in der Kontaktliste
   erscheinen. Keine Wix- oder anderen echten Kundendaten importieren.
6. Hinweis "Terminübersicht noch nicht synchronisiert" ist korrekt.
7. Freie Gentleman-Rasur-Zeiten prüfen, aber keine echten Testbuchungen
   anlegen, solange nicht klar ist, ob ein echter Kunde bestätigt würde.
8. Kundenprofil, gespeicherte Telefonnummer/Adresse und Wiederbuchung
   unter /konto/ und /booking-test/ kontrollieren.

## Noch offen
- Cal.com API-Key ist im Test-Worker nicht verbunden. Echte kommende und
  vergangene Cal-Termine werden deshalb noch nicht gezeigt.
- Echte interne Gentleman-Rasur/Terminbuchung und Benachrichtigungen
  müssen nach Isens Cal.com-Konto-Verbindung end-to-end geprüft werden.
- Wix-CSV und bestehende Termine dürfen nur nach Isens Zustimmung
  übernommen werden. Insbesondere künftige Wix-Termine vor Launch abgleichen.
- Isens eigene Admin-Rolle erst bei persönlichem Treffen nach bestätigtem
  Kundenkonto freischalten.
- Cookie- und Login-Tests auf iPhone abschliessen.
- Domain noch nicht umstellen; Wix-Buchungssystem aktiv lassen.
- Vor Live-Betrieb gemeinsam Datenverarbeitung, SMTP-Eigentümerschaft,
  Datenschutzhinweise und Betreuungsrechte von LocalBoost abstimmen.

## Wiederholbare Tests
- node tests/NoLimits_CRM_Regression_20261116.mjs
- node tests/NoLimits_Systemtest_20261115.mjs
- node tests/NoLimits_CookieBanner_Tests_20261115.mjs

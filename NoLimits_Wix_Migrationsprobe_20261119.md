# NoLimits – Wix-Kontakt- und Terminmigration: Testplan ohne Kundendaten

**Stand:** 19.11.2026 · **Status:** Phase 1 / Trockenlauf. `main`, Wix und produktive Cal.com-Termine bleiben unverändert.

## 1. Was bereits vorbereitet und simuliert wurde

- `assets/js/wix-csv.js`: CSV-Dateien bis 5 MB und 2000 Zeilen lokal einlesen, Semikolon/Komma, Anführungszeichen, Umlaute und Zeilenumbrüche verarbeiten. Ungültige E-Mails und Dubletten zählen. **Kein Netzwerkverkehr während der Vorschau.**
- `verwaltung/index.html` + `assets/js/admin.js`: Neues Feld **Import-Vorschau prüfen**. Erst nach erfolgreicher Vorschau und ausdrücklich angekreuzter Einwilligung von Isen wird **Geprüfte Kontakte importieren** freigeschaltet. Eine neue Dateiauswahl sperrt den alten Import wieder. Ein expliziter Bestätigungsdialog ist vor dem Datenbankschreiben Pflicht.
- Datenbank-Import mit `nl_legacy_contacts.upsert(..., {onConflict:'external_id'})` in Blöcken von 50 Kontakten: wiederholter Export darf nach identischer Wix-ID keine Dublette erzeugen. Bei Teilfehlern wird auf möglichen Teilimport hingewiesen.
- `tools/NoLimits_WixBookingPlan_20261119.mjs`: *rein lokales* Termin-Dry-Run-Werkzeug, das keine externen Aufrufe enthält. Prüft zukünftige bestätigte Termine, UTC-/Offset-Eindeutigkeit, Leistungszuordnung, Wix-IDs, Kontaktdaten und Zeitüberschneidungen.
- Tests: `NoLimits_WixCSV_Probeimport_20261119.mjs`, `NoLimits_WixBookingPlan_Test_20261119.mjs` sowie Playwright-CI-Screenshots zur CSV-Vorschau. Ausschliesslich erfundene Testkontakte.

## 2. Keine echten Wix-Kundendaten bis zu Isens Freigabe

Erst **nach** erfolgreicher Phase 1, während des persönlichen Treffens mit Isen:
1. Isen über den Wechsel, die Datenverwendung, Verantwortlichkeiten und notwendige Kundenkommunikation informieren und seine ausdrückliche Zustimmung einholen.
2. Kontakte aus Wix exportieren oder autorisierte Wix-API-Verbindung unter Isens eigenem Konto herstellen. Den Export nur in einem sicheren lokalen Ordner aufbewahren – **nicht GitHub, Google-Drive-Freigabelinks oder Chatnachrichten mit echten Kundendaten**.
3. Eine Export-/Sicherungskopie des bestehenden Wix-Terminkalenders erstellen. Bestehende Anmelde-/Buchungspflichten, Servicezeiten, Puffer und Abwesenheiten prüfen.
4. Isens echtes Cal.com-/Google-Kalenderkonto verbinden und live verfügbare Termine abgleichen; es dürfen keine Doppelbuchungen entstehen.

## 3. Offline-Probe für bestehende Wix-Termine (vor Isen nur Testdaten)

Das Migrationstool akzeptiert ein standardisiertes JSON-Array. Dieses **Beispiel enthält keine echten Kunden**:

```json
[
  {
    "wixId": "WIX-DEMO-001",
    "status": "CONFIRMED",
    "serviceKey": "haarschnitt",
    "startIso": "2026-12-03T09:00:00+01:00",
    "customerName": "Testkunde Beispiel",
    "customerEmail": "kunde@example.invalid",
    "customerPhone": "+41790000000"
  }
]
```

Die Formatumwandlung des zukünftigen *tatsächlichen* Wix-Exports in dieses Schema muss **noch** an dessen reale Feldstruktur angepasst und mit anonymisierten Stichproben bestätigt werden. Keine Annahme über noch unbekannte Wix-Datenfelder.

```bash
node tools/NoLimits_WixBookingPlan_20261119.mjs /pfad/zu/anonymisierten-testterminen.json
```

Das Tool schreibt keine Termine zu Cal.com, sendet keine E-Mails, ändert weder Wix noch Supabase, und gibt ausschliesslich Wix-IDs, Service-Schlüssel, UTC-Zeiten, Konflikte und zusammengefasste Prüfzahlen aus. Solange `ready=false`, **keine** Migration starten.

### Besonderheiten der Wix→Cal.com-Übernahme

- In den bereits vorbereiteten `SERVICES` stehen noch **Test-Cal.com-Event-Type-IDs**, nicht die späteren IDs in Isens Account. Vor dem Umstellen zwingend mappen und vergleichen.
- Cal.com Free versendet eigene Buchungsmails an die intern genutzten Adressen; die eigenen NoLimits-Mails müssen während der Migration und des Rollouts bewusst koordiniert werden, damit Kunden keine falschen/neuen Zusagen bekommen.
- Migration von bestehenden Terminen muss aus dem Wix-Bestand und dem neuen Cal.com-Kalender *abgeglichen* werden. Der Offline-Plan kann externe Belegungszustände nicht sehen und ist daher kein endgültiger Überschneidungsnachweis.
- Jeder Wix-Termin braucht für eine sichere Übernahme eine rückverfolgbare Wix-ID, eine gültige E-Mail und eindeutige Zeitzonenangaben. Unklare Datensätze werden gestoppt und nicht geraten.
- Keine Datenmigration und **keine Kündigung der Wix-Aboverlängerung**, bis Isen zugestimmt hat und die neue Lösung bereits produktiv geprüft ist.

## 4. Noch ausstehende technische Freigabepunkte

- Im Browser mit echter Mitarbeiter-Testanmeldung alle Funktionen von Preview, CRM, Profil und Importbestätigung prüfen; **keine echten Wix-Kontakte importieren**.
- Technische Migration von echten Wix-Buchungen und deren Slots erst nach Isens Datenzugang und Kalenderfestlegung endtesten.
- Cloudflare-Worker-Produktivnamen `nolimits-booking-test` vs. `wrangler.toml:name=nolimits-booking` auflösen und vollständig reversible Bereitstellung vorbereiten.
- Fehlermonitoring und Backup für Produktivschaltung.
- **Manuelle Mobile-Abnahme ganz am Schluss vor dem Treffen**, wie vom Auftraggeber festgelegt.

**Phasenregel:** Vollständige Testversion → erst danach Treffen mit Isen (Produktvorführung, Go-live-Zustimmung und gemeinsame Zugangserstellung) → Migration/Produktivstart zuhause mit ChatGPT → erst nach erfolgreichem Livebetrieb Wix kündigen.

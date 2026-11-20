# NoLimits – Phase-1-Technikabnahme und Übergabe-Gates

**Projekt:** LocalBoost Zentralschweiz / NoLimits Barbershop  
**Stand:** 20.11.2026, nach Bestätigung des ntfy-Alarmempfangs.  
**Status:** Testsystem weitgehend bereit; **keine Freigabe für Isens Termin und keine Produktivumschaltung**, solange die ausdrücklich offenen Phase-1-Punkte nicht erledigt sind.

## A. Von echten Quellen oder Tests bestätigte Nachweise

| Gebiet | Ergebnis | Nachweis |
|---|---|---|
| Mitarbeiterverwaltung mit realem Login | **PASS** | Nutzer-Screenshot: intern buchbarer Cal.com-LAB-Typ `7982460`, CRM-Aliasauflösung, automatisches Storno, DB-Aliasbereinigung; [Abnahmematrix](NoLimits_Abnahmematrix_20261119.md) |
| Kunde/Google-/E-Mail-Anmeldung & Profil | **PASS** | Frühere manuelle Konto-/Profiltests und automatisierte Browserregression |
| Supabase-RLS/Anonymzugriff | **PASS für geprüfte Fälle** | Reale read-only Postgres-Rollensimulation, geschütztes CRM; [RLS-Protokoll](NoLimits_RLS_Rollenprobe_20261120.md) |
| NoLimits-E-Mails | **PASS für LAB-Fälle** | Resend-Buchungs-, Umbuchungs- und Stornomeldungen zugestellt |
| Cal.com HMAC-Webhook | **PASS in isoliertem realem Staging** | Signierte LAB-Webhooks verarbeitet; gefälschter Webhook mit ungültigem HMAC **401**, anonymes Staff-CRM **401**, Gesundheitscheck **200** [GitHub Actions](https://github.com/localboostzs/nolimits/actions/runs/44833356012) |
| Cloudflare-LAB-Trennung | **PASS** | Workers.dev und Preview nach Sicherheitstests wieder deaktiviert; eigene Secrets und Event-ID |
| Wix-Import ohne Zustimmung | **PASS für Sperre/Preview** | Button deaktiviert; synthetische Vorschau, echte Wix-Daten **nicht** importiert |
| Produktionsbuchungs-API Read-only | **PASS** | Health, neun Services/Preis/Dauer und anonyme Staff-Auth-Sperre; [Monitor 20.11.](https://github.com/localboostzs/nolimits/actions/runs/44832986825) |
| Backup und technischer Restore | **PASS mit Einschränkungen** | Echter Home-Server-Restic-Dump; separater Restore im Supabase-Postgres-Image, **0 Restore-Fehler**; Quell-/Restore-Strukturen und Tabellenzeilenanzahlen gleich; [Bericht](NoLimits_Backup_Restore_20261120.md) |
| Backup-Fehlermeldung | **PASS** | Synthetischer systemd-Fehleralarm ausgelöst, Nutzer bestätigt tatsächlichen ntfy-Empfang auf dem iPhone |
| Synthetischer Inhalts-Fingerprint-Test | **PASS** | Identischer PostgreSQL-Restore akzeptiert; absichtlich geänderte Zeile trotz identischer Zeilenzahl erkannt [CI](https://github.com/localboostzs/nolimits/actions/runs/44832698968) |
| Vollständige Browser-/Mobile-Simulation | **Automatisierte Regression** | [Playwright-Workflow](https://github.com/localboostzs/nolimits/actions/workflows/NoLimits_UI_Test_20261119.yml); **reale iPhone-Abnahme ausdrücklich noch offen** |

## B. Noch VOR dem Treffen mit Isen erledigen

**B1 – Dateninhalt-Integritätsprobe (technisch offen).** Auf dem privaten Home Server einen **frischen** Restic-Snapshot der echten NoLimits-Datenbank erstellen; in einen eigenen, kurzlebigen `supabase/postgres`-Container zurückspielen; mit [NoLimits_RestoreInhaltsvergleich_20261120.mjs](tools/NoLimits_RestoreInhaltsvergleich_20261120.mjs) Tabelleninventar, Zeilenzahlen und SHA-256-Fingerprints für `public/auth/storage/vault` prüfen. [Exakte interne Anleitung](NoLimits_Inhaltsabgleich_Anleitung_20261120.md). Nur PASS/FAIL in Chat, **keine** Tabelleninhalte, Hashes oder Passwörter.

**B2 – Abschliessender Release-/Rollback-Review (automatisierbar, ohne Live-Deploy).** Die bestehenden GitHub-Regressionen, Wrangler-Dry-Runs, Rate-Limits und Produktionsziel `nolimits-booking-test` überprüfen; Wix-Kontakt-/Termin-Migrationswerkzeuge, gesperrte Realimporte, CORS, signed Managementlinks und ICS-Deaktivierung nochmals kontrollieren. Domain-/DNS-Werte und Isens echte Eventtypen **nur dokumentieren**, nicht verändern. Wenn eine weitere Korrektur nötig ist, erneut testen.

**B3 – Letzte Anwender- und Mobile-Abnahme.** Erst **nach B1 und B2** auf dem iPhone die öffentliche GitHub-Testwebsite `https://localboostzs.github.io/nolimits/`, Konto-/Login und Buchungsablauf visuell kontrollieren. Nur interne Testdaten verwenden; keine echten zahlenden Kunden oder produktiven Wix-Termine buchen. Auf 320–390 px Bildbreite insbesondere Navigation, Preis- und Leistungslisten, Datum/Zeiten, CTA, Überlagerungen und Kundenkonto prüfen. Ergebnisse dokumentieren. Die Testseite ist **nicht** Wix-Live.

**B4 – Abschliessende Freigabeentscheidung für Isens Treffen.** Die technische Abnahmematrix überprüfen: kein unkontrolliert offenes LAB, kein falscher Status `PASS`, keine aktiven synthetischen Testtermine, PR #3 bleibt DRAFT. Nur eindeutig Phase-2/3-abhängige Aufgaben dürfen nach Isens Freigabe erfolgen.

## C. Mit Isen in Phase 2 und vor Go-live in Phase 3 klären

- Tatsächliche Wix-Kontakte, aktuelle/kommende Buchungen, Erlaubnis zum Export, Datenimport und Kundenkommunikation.
- Zugänge, Besitz und korrekte Einbindung seines Cal.com-/Kalenderkontos; verbindliche Service-IDs, Preise, Dauer und Öffnungszeiten; wer eigene Mitarbeiterrechte erhält.
- Verantwortlichkeiten/Datenschutz, Lösch-/Aufbewahrungsfristen, Resend und externe Anbieter, Auslandsdatenbearbeitung, gültige Support-E-Mail, korrektes Impressum.
- **Kalenderanhänge derzeit bewusst aus:** Die Google-Kalender-ICS-Importe erzeugten bei Umbuchung einen Doppeltermin. Isen muss den E-Mail-only-Prozess akzeptieren oder eine *neue* echte Kalendereinladungsfunktion separat beauftragen. Kein ungetestetes iCalendar-Versprechen.
- Echte Domain-, DNS- und E-Mail-Routen, Cutoverzeitplan, gebuchte Bestandskunden, Rollback sowie sichere parallele Weiterführung von Wix. **Kein vorzeitiges Kündigen oder Verstellen der Wix-Abo-Verlängerung.**
- Zweite räumlich getrennte **verschlüsselte** Backupkopie: vor echter Kundendatenmigration/Produktivstart dringend empfohlen; Provider, Zugangsschutz und Aufbewahrungsdauer müssen festgelegt sein. Die USB beim Home Server schützt nicht vor gemeinsamem Standortverlust. `forget`/`prune` ohne Restic-Repository-/Tagkonzept verboten.

## D. Release- und Sicherheitsgrenzen

- Öffentliches `main` enthält nur bereits genehmigte Testseiten/Read-only-Workflowverbesserungen. Das Alias-Backend bleibt auf `feature/NoLimits_Aliasbuchung_20261119` und **Draft-PR #3**.
- Produktiv-Worker `nolimits-booking-test` **nicht** mit der historischen `worker/wrangler.toml` deployen. Nur der dokumentierte Kandidat `worker/wrangler.production-candidate.toml` mit sicherem `NL_ALIAS_MODE=off` und `NL_ICS_ENABLED=false` für einen **später freigegebenen** Release.
- **Keine** Cloudflare-Domainumschaltung, Wix-Änderung, Kundenimporte, aktiven Live-Cal-Buchungstests oder geheimen Zugangsdaten in GitHub.
- Backup-Hashvergleich ist noch **NICHT echt bestanden**, nur synthetisch; integrierte Supabase-Free-Backups/PITR sind nicht vorhanden. Aktuelle Supabase-Storage-Buckets, Storage-Objekte und Vault-Secrets = jeweils **0**, bei künftiger Nutzung neu prüfen.

**Nächster externer Arbeitsschritt:** Den Home-Server-Claude-Code-Agenten B1 durchführen lassen. Danach ist B2 (technisch und weitgehend autonom) und zuletzt B3 (iPhone-Bedienprüfung) an der Reihe. Isen erst kontaktieren, wenn die dokumentierten Phase-1-Gates erfüllt sind.

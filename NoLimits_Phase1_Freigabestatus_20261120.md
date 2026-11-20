# NoLimits – Phase-1-Technikabnahme und Übergabe-Gates

**Projekt:** LocalBoost Zentralschweiz / NoLimits Barbershop  
**Stand:** 21.11.2026, nach frischem echten NoLimits-Supabase-Backup, isoliertem Inhaltsvergleich und abschliessendem Release-Review.  
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
| Backup und technischer Restore | **PASS** | Frischer Snapshot `d91b6a3e`, isolierter Restore im Supabase-Postgres-Image 0 Fehler, **42 Tabellen per SHA-256-Inhaltsvergleich identisch (0 Abweichungen)**; Restic/Timer PASS, laut privatem Home-Server-Agent-Bericht. [Bericht](NoLimits_Backup_Restore_20261120.md) |
| Backup-Fehlermeldung | **PASS** | Synthetischer systemd-Fehleralarm ausgelöst, Nutzer bestätigt tatsächlichen ntfy-Empfang auf dem iPhone |
| Synthetischer Inhalts-Fingerprint-Test | **PASS** | Zusätzlich zur echten Restore-Prüfung wurde das Tool gegen manipulierte synthetische Daten in [CI](https://github.com/localboostzs/nolimits/actions/runs/44832698968) erfolgreich getestet |
| Vollständige Browser-/Mobile-Simulation | **Automatisierte Regression** | [Playwright-Workflow](https://github.com/localboostzs/nolimits/actions/workflows/NoLimits_UI_Test_20261119.yml); **reale iPhone-Abnahme ausdrücklich noch offen** |

## B. Noch VOR dem Treffen mit Isen erledigen

**B1 – Dateninhalt-Integritätsprobe: PASS (21.11.2026).** Home Server sicherte einen frischen Restic-Snapshot `d91b6a3e` und stellte diesen in einen isolierten `supabase/postgres:17.6.1.136`-Container wieder her. Der [private SHA-256-Inhaltsabgleich](NoLimits_Inhaltsabgleich_Anleitung_20261120.md) ergab **42 Tabellen, 0 Abweichungen**. Der Nutzer übermittelte den Agent-Abschlussbericht; kein direkter Zugriff der Chat-Umgebung auf den Server. Offsite-Kopie und Langzeitretention bleiben separat offen.

**B2 – Abschliessender Release-/Rollback-Review: PASS für alle ohne Isen und ohne Live-Änderung durchführbaren Punkte (21.11.2026).** Alias-/CRM-/Termin-/Wix-/Domain-Rollback-Mocktests [PASS](https://github.com/localboostzs/nolimits/actions/runs/44833810695), automatisierte Kunden- und Mobile-UI-Tests [PASS](https://github.com/localboostzs/nolimits/actions/runs/44833543244), Live-Produktions-Read-only-Monitor [PASS](https://github.com/localboostzs/nolimits/actions/runs/44834069603), realer isolierter falscher HMAC mit 401 [PASS](https://github.com/localboostzs/nolimits/actions/runs/44833356012). Github-Pages-Build `built`; PR #3 weiterhin **DRAFT**, Worker `nolimits-alias-staging` abgeschaltet; Produktionskandidat zielt auf bestehenden Worker `nolimits-booking-test` mit `NL_ALIAS_MODE=off`, `NL_ICS_ENABLED=false`, korrekten Rate-Limits. **Live-Deployment, realer Alias-Rollback mit produktiven Terminen, Isens echte Kalender-/DNS-Konfiguration und Wix-Datenmigration bleiben nach Freigabe/Termin gesperrt.**

**B3 – Letzte Anwender- und Mobile-Abnahme: OFFEN, jetzt als letzter Phase-1-Schritt durch den Nutzer.** [Konkrete iPhone-Schritt-für-Schritt-Anleitung](NoLimits_Mobile_Abnahme_20261121.md). Nach bestandenem B1 und B2 auf dem iPhone die öffentliche GitHub-Testwebsite `https://localboostzs.github.io/nolimits/`, Konto-/Login und Buchungsablauf visuell kontrollieren. Nur interne Testdaten verwenden; keine echten zahlenden Kunden oder produktiven Wix-Termine buchen. Auf 320–390 px Bildbreite insbesondere Navigation, Preis- und Leistungslisten, Datum/Zeiten, CTA, Überlagerungen und Kundenkonto prüfen. Ergebnisse dokumentieren. Die Testseite ist **nicht** Wix-Live.

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
- Backup-Hashvergleich **echt PASS** laut vom Nutzer übermitteltem Home-Server-Agent-Bericht (frischer Snapshot `d91b6a3e`, 42 Tabellen, 0 Unterschiede); integrierte Supabase-Free-Backups/PITR sind nicht vorhanden. Aktuelle Supabase-Storage-Buckets, Storage-Objekte und Vault-Secrets = jeweils **0**, bei künftiger Nutzung neu prüfen. Offsite und Aufbewahrung vor echtem Produktivbetrieb klären.

**Nächster externer Arbeitsschritt:** **B3 manuelle iPhone-Bedienprüfung** anhand [dieser Abnahmeanleitung](NoLimits_Mobile_Abnahme_20261121.md) der GitHub-Testsite (ohne echte Buchung oder Wix-Eingriff). B1 und B2 sind bestanden. Nach gemeldeter B3-Abnahme die Phase-1-Freigabeentscheidung B4 dokumentieren; **Isen vorher nicht kontaktieren**. Das zusätzliche Offsite-Backup und die Aufbewahrungspolitik bleiben wichtige Produktiv-Voraussetzungen, jedoch keine ungeprüften angeblichen Live-Funktionen.

## Echte Inhaltsprüfung und technischer Release-Review vom 21.11.2026

- **B1 PASS laut Home-Server-Claude-Code-Abschlussbericht:** Snapshot `d91b6a3e`; isolierte `supabase/postgres:17.6.1.136`-Rückspeicherung `0 Fehler`; 42 Tabellen via SHA-256 gegen Quelle geprüft und alle identisch; 0 Unterschiede; Testcontainer/Credentials entfernt, 87 Restic-Snapshots, bestehende Sicherungen gesund. Der erste temporäre PGPASS-Setupfehler wurde behoben.
- **B2 PASS für vor Isens Freigabe gefahrlos testbare Bereiche:** GitHub-Feature-Regressionsworkflow [44833810695](https://github.com/localboostzs/nolimits/actions/runs/44833810695) **SUCCESS**, UI-/Mobile-Playwright [44833543244](https://github.com/localboostzs/nolimits/actions/runs/44833543244) **SUCCESS**, produktiver GET-Only-Betriebsmonitor [44834069603](https://github.com/localboostzs/nolimits/actions/runs/44834069603) **SUCCESS**, Cloudflare-LAB-Routen disabled, GitHub Pages jüngster Build **built**, NoLimits-Backend Draft-PR #3 weiterhin offen und `draft=true`.
- **Verbleibend:** Nur die **manuelle Mobile-Bedienabnahme B3** plus B4 Freigabeentscheidung als **Nutzer-Aufgabe vor der Isen-Terminvereinbarung**. Echte Wix-Daten, Isens Kalender und produktive Domain/Worker dürfen weiterhin erst nach seiner Mitwirkung angebunden werden. Offsite-Backup/Retention spätestens vor echten Kundendaten und Produktivbetrieb umsetzen.

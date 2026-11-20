# NoLimits – privater Inhaltsvergleich einer echten Supabase-Sicherung

**Datum:** 20.11.2026  
**Status:** Vergleichswerkzeug und synthetischer GitHub-Test **PASS**. **Echter Quelldatenbank-/Restore-Inhaltsvergleich am Home Server noch offen.**

## Zweck und getesteter Umfang

Das bisher erfolgreich abgeschlossene Home-Server-Recovery mit `supabase/postgres:17.6.1.136` stellt einen echten Datenbankdump ohne Fehler wieder her. Es hat 41 Tabellen, 8 Policies, 30 RLS-Tabellen, 13 Trigger und gleiche Zeilenzahlen nachgewiesen. **Gleiche Zeilenanzahlen beweisen keine gleichen Datensatzinhalte.** Der neue Vergleich schliesst diese Lücke, ohne personenbezogene Daten oder Hashes zu veröffentlichen.

Datei: [`tools/NoLimits_RestoreInhaltsvergleich_20261120.mjs`](tools/NoLimits_RestoreInhaltsvergleich_20261120.mjs)

- Verbindet sich **lesend** mit der explizit festgelegten NoLimits-Supabase-Datenbank über verified TLS und einem bereits privaten `PGPASSFILE`.
- Verbindet sich zusätzlich nur mit einem **separaten wegwerfbaren Restore-Postgres-Container** auf `127.0.0.1` an einem hohen Port; der Agent muss die Trennung bestätigen.
- Vergleicht alle normalen/partitionierten Tabellen der Schemata `public`, `auth`, `storage`, `vault`; zuerst Inventar, danach Zeilenzahlen und **Inhalts-Fingerprints**.
- Die Fingerprints werden in der jeweiligen Datenbank aus `to_jsonb(zeile)::text` per PostgreSQL-`sha256` gebildet, geordnet und pro Tabelle erneut SHA-256-gehasht. Der Client vergleicht diese Digest-Werte nur im Arbeitsspeicher.
- Die Ausgabe enthält **nur PASS/FAIL und ggf. Tabellennamen** – keine Zeilen, Passwörter, E-Mails, Einzel- oder Gesamthashes.
- Alle SQL-Transaktionen laufen mit `default_transaction_read_only=on`. Das Tool verändert keinerlei Original- oder Restore-Daten und startet weder einen Dump noch ein Restic-Backup.

Die Regression hat in einem synthetischen PostgreSQL-17-Container zuerst identische Datensätze erfolgreich verglichen und anschliessend eine **veränderte Zeile bei gleicher Zeilenzahl** nachweislich als Fehler erkannt: [GitHub Actions PASS](https://github.com/localboostzs/nolimits/actions/runs/44832698968).

## Sichere Vorgehensweise für den Home-Server-Claude-Code-Agenten

1. GitHub-Featurebranch `feature/NoLimits_Aliasbuchung_20261119` nur lesen/aktualisieren, neue Vergleichsdatei prüfen. Keine Quell-IP, Datenbankkennwörter, Tokens oder echten Kundendatensätze ins öffentliche Repo senden.
2. Bestehendes Restic-Repo und den täglichen `nolimits-supabase-backup.timer` **nicht verändern**. Ein manuell ausgelöster **frischer** Restic-Snapshot ist für die Gegenprobe besser, um inzwischen geänderte Login-/Kundendaten nicht fälschlich als Korruption zu melden.
3. Frischen verschlüsselten Dump in einen neuen isolierten `supabase/postgres:17.6.1.136`-Testcontainer zurückspielen, ausschliesslich über `127.0.0.1:<hoher-port>`, am besten tmpfs und eindeutiger temporärer Containername; **niemals** in das ursprüngliche Supabase-Projekt oder einen bestehenden produktiven Container restoren.
4. Vor dem Vergleich SSL, Rolle, Host und Datenbank explizit bestätigen: `PGHOST=db.jcctdjjunxmxaphjkrsz.supabase.co`, `PGPORT=5432`, `PGUSER=postgres`, `PGDATABASE=postgres`, `PGSSLMODE=verify-full`, `PGSSLROOTCERT`, `PGPASSFILE`. Für den Restore **separate** private Einstellungen `NL_RESTORE_HOST=127.0.0.1`, `NL_RESTORE_PORT=<hoher-port>`, `NL_RESTORE_USER`, `NL_RESTORE_DATABASE`, `NL_RESTORE_PGPASSFILE`. Beide PGPASSFILE-Dateien müssen Modus 0600 haben. Erforderlich ist `NL_RESTORE_ISOLATED_ACK=YES`.
5. Erst nach diesen Sicherheitskontrollen `node tools/NoLimits_RestoreInhaltsvergleich_20261120.mjs` mit geschützter Umgebung ausführen. **Niemals** `set -x`, `env`, vollständige `psql`-Abfragen oder `pgpass`-Inhalte in Logs ausgeben. Den Home-Server-Agenten die nötige Ausführung selbst vorbereiten lassen, anstatt Zugangsdaten in Chattexte zu kopieren.
6. Ergebnis `PASS` nur bei **vollständig identischem Tabelleninventar, identischen Zeilenzahlen und identischen SHA-256-Fingerprints aller verglichenen Tabellen**. Bei Abweichungen keine automatisch korrupten Daten behaupten: zunächst prüfen, ob die Quelldatenbank **nach dem Snapshot** legitimerweise geändert wurde. Für den definitiven Nachweis möglichst unmittelbar nach einem neuen Snapshot und Restore vergleichen, ohne Testbuchungen parallel.
7. Bei Fehler die Quelle unverändert lassen, nur im gesonderten Restore-Container weiter untersuchen. Entferne anschliessend Testcontainer, temporäre Passwortdateien und potenziell sensible Klartext-Dumps. Private Restic-Verschlüsselungsdateien und bestehende Backup-Timer nicht löschen oder überschreiben.
8. Dem Nutzer und ChatGPT ausschliesslich eine **anonymisierte Abschlussmeldung** geben: Vergleich PASS/FAIL, Anzahl Tabellen, Anzahl Abweichungen (ohne Hashes), Vermerk über unabhängigen Restore, aufgeräumte Testressourcen und bestehende Restic-/Timer-Gesundheit.

## Grenzen des Nachweises

- Der Vergleich ist nur eine Momentaufnahme. Laufende Änderungen zwischen Quellabfrage und Sicherungszeitpunkt können legitime Abweichungen verursachen.
- Er prüft die **Datensätze**, nicht alle globalen Datenbankrollen, Passwörter, Cloudflare-Secrets, Supabase-Dashboard-Einstellungen oder **physische Storage-Dateibytes**. Letztere wurden in der aktuellen NoLimits-DB mit 0 Buckets / 0 Objekten direkt geprüft.
- Auch ein bestandener Hashvergleich ersetzt keine separate Rücksicherung in einem komplexen produktiven Supabase-Stack. Der tatsächliche Restore im Supabase-Image wurde bereits gesondert ohne Fehler bestanden.
- Es werden weder ein Offsite-Backup noch eine Aufbewahrungsrichtlinie dadurch eingerichtet.

**Wichtig:** Der ausführende Home-Server-Agent muss die Ergebnisse **eigenständig** prüfen und dokumentieren. Der Chat hat keinen SSH-Zugriff auf den Home Server und kann den echten Container nicht selbst ausführen.

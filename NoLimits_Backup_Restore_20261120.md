# NoLimits – Backup- und Wiederherstellungsprüfung (ohne Zusatzkosten)

**Stand:** 20.11.2026  
**Projekt:** NoLimits / LocalBoost Zentralschweiz  
**Status (21.11.2026):** **Vollständiges NoLimits-Datenbankbackup, isolierter Restore und per-Tabellen-SHA-256-Inhaltsvergleich technisch PASS (gemäss dem vom Nutzer übermittelten Home-Server-Agent-Bericht).** Frischer Snapshot `d91b6a3e`: alle 42 geprüften Tabellen in `public/auth/storage/vault` ohne Abweichung. **ntfy-Testwarnung auf dem iPhone empfangen (PASS).** Offsite-Kopie und langfristige Aufbewahrung bleiben offen. Die früheren synthetischen Tests bleiben als unabhängige CI-Nachweise dokumentiert.

## 1. Derzeit bestätigte Supabase-Situation

Über den verbundenen Supabase-Managementzugriff wurden Backups ausschliesslich **lesend** abgefragt:
- Projekt: `jcctdjjunxmxaphjkrsz`; Region `eu-west-1`.
- Verwaltete Backup-Liste: **leer** (`backups: []`).
- `pitr_enabled: false`.
- Abfrage eines Backupzeitplans: HTTP **402**; diese Funktion steht über den aktuellen Zugriff nicht kostenlos bereit.

**Schlussfolgerung:** Wir dürfen uns nicht auf vermeintlich automatische, wiederherstellbare Supabase-Backups verlassen. Ich habe weder einen kostenpflichtigen Tarif aktiviert noch einen Restore auf der tatsächlichen Datenbank gestartet.

## 2. Tatsächlich bestandener technischer Test

Ein eigener GitHub-Actions-Test startet `postgres:17` in einem **wegwerfbaren lokalen Docker-Container** mit einem vollständig erfundenen Alias-Kundendatensatz:
1. In der leeren PostgreSQL-Instanz werden die Rollen `anon`, `authenticated`, `service_role` ohne Login erstellt.
2. Die gespeicherte Schema-Migration `supabase/migrations/NoLimits_AliasMapping_20261119.sql` erzeugt die Alias-Tabelle, E-Mail-/UID-Constraints, eindeutige Indizes und die benötigten Berechtigungen.
3. Ein rein erfundener Termin wird eingefügt.
4. `pg_dump --format=custom` erstellt ein binäres Backup dieser Testtabelle.
5. Die Tabelle wird im **synthetischen Testcontainer** vollständig gelöscht.
6. `pg_restore` erstellt sie samt Datensatz wieder.
7. Der Test prüft den exakten Datensatzbestand, aktives RLS, serverseitige SELECT/INSERT/UPDATE/**DELETE**-Berechtigungen und gesperrte Tabellenleserechte für `anon` und `authenticated`.
8. Der Container und das Testdump werden automatisch gelöscht. **Keinerlei Verbindung zum echten Supabase-Projekt.**

**Ergebnis:** [GitHub Actions – bestandener synthetischer Backup-/Restore-Test](https://github.com/localboostzs/nolimits/actions/runs/44654486754).

Die Migration wurde dabei ergänzt: `service_role` benötigt neben SELECT/INSERT/UPDATE auch DELETE, um definitiv abgelehnte und stornierte Aliaszuordnungen bereinigen zu können. Die bestehende NoLimits-Supabase-Tabelle besass dieses Recht bereits; der Fix betrifft insbesondere neue Installationen/Wiederherstellungen.

## 3. Was vor dem Produktivwechsel tatsächlich noch geschehen muss

**Kein Go-live, bevor diese Bedingungen erfüllt und nachgewiesen sind:**

- Eine kostenlose, automatisierte Export-/Backupstrategie für **Supabase-Kundenprofile, Mitarbeiterzuordnungen, importierte Wix-Kontakte und die Alias-Tabelle** definieren. Mögliche Umsetzung auf dem bestehenden privaten Home Server via `pg_dump` und `restic`, aber nur nach Prüfung von Verbindung, Version, Erreichbarkeit, Datenschutz und geschütztem Backupziel.
- Alle benötigten Tabellen/Schemaelemente sichern, nicht nur `nl_booking_email_aliases`. Auch Auth-Benutzerdaten und Storage-Verweise müssen bezüglich tatsächlicher Recovery-Anforderungen berücksichtigt werden.
- Backups müssen **verschlüsselt**, zugriffsbeschränkt und ausserhalb der laufenden Supabase-Instanz gespeichert werden. **Niemals** Kundeninformationen, SQL-Dumps oder Datenbankkennwörter in das öffentliche Repo `localboostzs/nolimits` hochladen.
- Echte Export- und Wiederherstellbarkeit mit ausdrücklich genehmigten und nichtproduktiven Daten in einer separaten Testumgebung nachweisen. Keine `DROP TABLE`-, `TRUNCATE`- oder `pg_restore --clean`-Befehle gegen das echte Supabase-Projekt ausführen.
- Im späteren Isen-Termin Wix-Kontakt- und Terminexporte nur mit seiner ausdrücklichen Freigabe durchführen, anschliessend revisionssicher und getrennt von der Website sichern. Das bestehende Wix-Abonnement **nicht** vor erfolgreichem Cutover deaktivieren.
- Wiederherstellungsverantwortung, Aufbewahrung und manuelle Fallback-Buchung vereinbaren.

## 4. Bestehende, sichere technische Vorarbeit

- [Synthetisches Backup-/Restore-Skript](tools/NoLimits_Synthetische_BackupProbe_20261120.sh)
- [Testworkflow](.github/workflows/NoLimits_BackupRestore_Test_20261120.yml)
- [RLS/Rollenprüfung](NoLimits_RLS_Rollenprobe_20261120.md)
- [Go-live- und Rollback-Plan](NoLimits_GoLive_Rollback_20261119.md)

Die verbleibende echte Backup-Einrichtung ist eine **bewusste Release-Sperre** und darf nicht als bereits abgeschlossen dargestellt werden. Die manuelle Mobile-Abnahme bleibt wie vereinbart ganz am Schluss vor dem Treffen mit Isen.

## 5. Echte Home-Server-Sicherung und Restore mit Supabase-Image (20.11.2026)

**Quelle:** Vom Nutzer übermittelter Abschlussbericht des Home-Server-Claude-Code-Agenten vom 20.11.2026. Der Agent-Bericht liegt lokal unter `/home/leon/nolimits-backup-work/results/Abschlussbericht_20261120.md`; der Chat hat keine direkte Verbindung zum Home Server und konnte den Container/Restic-Snapshot daher **nicht unabhängig öffnen**. Davon zu unterscheiden ist die separate direkte Supabase-SQL-Metadatenprüfung weiter unten.

### Backupbetrieb laut Agent

- Home Server: `pg_dump 18.6`, Supabase-Datenbank PostgreSQL **17.11**, direkte TLS-Verbindung mit `verify-full`.
- Geschützter, gestreamter Datenbankdump in das bestehende verschlüsselte Restic-Repository `/mnt/backup/restic`. Kein persistenter Klartext-SQL-Dump auf dem Host.
- **Zwei bestätigte Restic-Snapshots laut Agent:** `d6e62ef9` (manuell) und `b094749f` (systemd-Service), jeweils 322 KiB. `pg_restore --list` zeigt 480 Einträge.
- Eigenständiger `nolimits-supabase-backup.timer` täglich **14:30 Europe/Zurich**, `Persistent=true`. Bestehende `homeserver-backup`- und `second-brain-backup`-Dienste unangetastet. Kein `forget`, kein `prune`.
- Eigener ntfy-Fehleralarm; **synthetische Fehlersimulation wurde ausgelöst und Meldung versendet (Agent-Bericht)**. **Empfang auf dem iPhone durch den Nutzer am 20.11.2026 bestätigt (PASS)**.

### Echte Wiederherstellungsprobe (ohne Änderung der Supabase-Quelldaten)

- Separater, wegwerfbarer Testcontainer `supabase/postgres:17.6.1.136` auf `127.0.0.1` mit `tmpfs`; **0 Restore-Fehler**, `supabase_vault`-Extension vorhanden. Frühere drei Extension-Fehler im einfachen `postgres:17`-Image damit **behoben**.
- Quelle und Restore laut Agent gleich: **41 Tabellen, 8 RLS-Policies, 30 Tabellen mit aktivem RLS, 13 Trigger, 2 `public`-Funktionen; `auth.users` 2, `auth.identities` 3, gleiche Zeilenzahlen sämtlicher `public`-Tabellen**.
- `vault.secrets`: 0 Zeilen in Quelle und Restore. Ein nichtleerer Vault wurde deshalb **nicht inhaltsbezogen getestet**.
- Die Restore-Gegenprobe vergleicht **Strukturen und Zeilenzahlen**, aber **nicht** zeilenweise Inhalte bzw. Hashes; daher kein Anspruch auf vollständig nachgewiesene Datenidentität.
- Temporärer Container, Klartext-Restore-Dump und Testpasswort wurden laut Agent gelöscht.

### Direkt über Supabase verifiziert (unabhängig vom Home-Server-Bericht)

Read-only-Abfrage von `storage.buckets`, `storage.objects` und `vault.secrets`: **0 Storage-Buckets, 0 Storage-Objekte, 0 Vault-Geheimnisse** im aktuellen NoLimits-Projekt. Damit derzeit keine zusätzlichen externen Supabase-Storage-Dateien zu sichern. **Bei zukünftigem Hochladen von Dateien ist ein eigenständiges Storage-Objektbackup zwingend zu ergänzen**, denn `pg_dump` sichert keine Storage-Dateibytes.

### Noch offene Risiken und sinnvolle Nacharbeiten

1. **ntfy-Push auf dem Nutzergerät bestätigt (PASS):** Der Nutzer hat den Empfang der synthetischen Fehlermeldung «NoLimits Supabase-Backup fehlgeschlagen» auf dem iPhone ausdrücklich bestätigt.
2. **Zweite, verschlüsselte, räumlich getrennte Kopie**: die jetzige USB bleibt im selben Haus, damit bei Brand/Diebstahl ein gemeinsamer Ausfallpunkt. Vor der Produktivfreigabe mit dem Auftraggeber eine realistische Offsite-Strategie definieren.
3. **Wiederherstellung gegen Dateninhalte testen**, z. B. mit geschützten deterministischen Hashes ausgewählter Testdatensätze/Tabellen auf Quelle und Restore. Keine personenbezogenen Zeilen oder Hashes in öffentliches GitHub, Logs oder Chat exportieren; private Hashvergleiche statt Datenexport bevorzugen.
4. **Aufbewahrung kontrolliert planen**, bevor die USB voll wird. Agent meldet **11.8 GB frei**; wegen geteilter Restic-Instanz niemals unkontrolliert `forget`/`prune` einsetzen.
5. **Bei Einführung von Storage-Objekten/Vault-Geheimnissen** Recovery-Plan erweitern und gesondert testen.
6. Der lokale Agent-Bericht kann nach Bereinigung von Geheimnissen/sensiblen Logzeilen im Feature-Branch zusammengefasst werden. `restore.log` aus dem privaten Home-Server-Verzeichnis **nicht ungeprüft** in das öffentliche Repo kopieren.

**Release-Einstufung:** **Backup+Restore-Schema- und Mengencheck PASS**; **dauerhafter Betrieb eingerichtet (gemäss Agent)**. Offsite-Resilienz und tatsächliche Inhaltsgleichheit bleiben offen; **ntfy-Empfang PASS**. **Kein** Eingriff in Wix, Produktiv-Worker oder bestehende Termine.

## 6. Echter Inhaltsvergleich auf Home Server – PASS (21.11.2026)

Vom Nutzer übermittelter Abschlussbericht des privaten Claude-Code-Agenten, kontrollierter Lauf nach frischem Snapshot:

- **Verschlüsseltes Backup:** Restic-Snapshot `d91b6a3e` erfolgreich erstellt, bestehendes Repository und separater Timer funktionsfähig.
- **Isolierter Restore:** `supabase/postgres:17.6.1.136`, ausschliesslich Loopback `127.0.0.1`, temporärer `tmpfs`, **0 Restore-Fehler beim finalen Durchlauf**.
- **Echter SHA-256-Datensatzinhaltsvergleich:** **PASS – 42 Tabellen aus `public`, `auth`, `storage`, `vault`; 0 Abweichungen**. Das vorher in CI mit fiktiven Datensätzen positiv und negativ getestete Vergleichswerkzeug wurde nun auch auf Quelle/Restore angewendet. Einzelne Inhalte und Hashwerte wurden nicht in den Chat übertragen.
- **Betrieb:** `nolimits-supabase-backup.timer` aktiv, täglich **14:30 Europe/Zurich**. Restic-Repository gesund, laut Agent **87 Snapshots**, `homeserver-backup` und `second-brain-backup` unverändert aktiv; die letzten NoLimits-/Home-Server-Backups erfolgreich.
- **Cleanup:** Testcontainer, temporärer Klartext-Dump und temporäre Test-Passwortdateien entfernt, kein offener Test-Port verblieben. Der Agent installierte hierfür Node.js v22.
- **Transparenter Fehlerverlauf:** Beim ersten Restoreversuch fehlte der Datenbankname im **temporären** `pgpass`-Eintrag, weshalb die Testanmeldung scheiterte. Nach Korrektur wurde der Restore vollständig und ohne Fehler neu ausgeführt. **Kein Beleg für eine Beschädigung der Quelldaten oder Sicherung.**
- **Grenzen:** Der Vergleich ist eine Momentaufnahme (Quelle kann später geändert werden). Aktuelle Storage-Tabellen und `vault.secrets` sind leer; Nichtleerfälle dieser Dienste wurden deshalb nicht verifiziert. Postgres-Clusterrollen, Rollenpasswörter und externe Cloud-Konfiguration sind nicht Teil des Inhaltsvergleichs.
- **Nach wie vor offen:** Die USB mit dem Restic-Repository befindet sich im selben Haus (keine Offsite-Kopie), noch keine festgelegte Aufbewahrung bzw. kontrollierte Tag-Retention; laut Agent **11.8 GB frei**. **Kein unkontrolliertes `forget`/`prune` im gemeinsam genutzten Repository ausführen.** Vor Datenmigration/Livebetrieb Second-Site-Backup und Restore-Verfahren verbindlich festlegen.

**Status:** Echte Backup-Datenintegritätsprüfung **PASS**. Diese Feststellung beruht auf dem konkreten Home-Server-Agent-Abschlussbericht des Nutzers, nicht auf direktem SSH-Zugriff durch ChatGPT. Keine NoLimits-Live-/Wix-/DNS-Veränderung durchgeführt.

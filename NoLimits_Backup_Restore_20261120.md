# NoLimits – Backup- und Wiederherstellungsprüfung (ohne Zusatzkosten)

**Stand:** 20.11.2026  
**Projekt:** NoLimits / LocalBoost Zentralschweiz  
**Status:** Synthetischer Wiederherstellungstest **PASS**. Tatsächliche produktive Supabase-Datenbank ist dadurch **NOCH NICHT** gesichert oder wiederherstellungserprobt.

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

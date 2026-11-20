# NoLimits – kostenloses Backup auf dem Home Server (Vorbereitung)

**Stand:** 20.11.2026. **Installiert und aktiv (laut Home-Server-Agent-Bericht).** Der echte Datenbank-Restore in einer isolierten Supabase-Postgres-Testumgebung ist erfolgreich (0 Fehler). Diese Anleitung dokumentiert weiterhin den ursprünglichen Installationsplan und die noch offenen Betriebsanforderungen. Keine Passwörter, Tokens, Kundendaten, Server-IP-Adressen oder Restic-Repositories werden ins GitHub-Repo aufgenommen.

## Aktueller Stand und Begründung

- Supabase Free bietet laut offizieller Dokumentation keine integrierten täglichen Wiederherstellungsbackups. Empfohlen werden regelmässige CLI-Dumps mit separater Sicherung.
- NoLimits Supabase-Projekt: `jcctdjjunxmxaphjkrsz`, Postgres **17.11** (read-only geprüft).
- Verknüpfter Supabase-Backup-Status: verwaltete Backups **leer**, PITR aus.
- Das bereits erfolgreich geprüfte **synthetische** `pg_dump`/`pg_restore`-Experiment ist [hier](NoLimits_Backup_Restore_20261120.md) dokumentiert. **Ein echter isolierter Datenbank-Restore wurde nach dem synthetischen Test inzwischen bestanden; Inhalte wurden bislang nur über Strukturen und Zeilenzahlen abgeglichen.**
- Eigene Staging-LAB- und Wix-Daten müssen erst nach Freigabe importiert werden. Es sind aktuell nur NoLimits-Testprofile vorhanden.

Offizielle Quellen:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Sicherer Implementierungsplan für den Home-Server-Agenten

1. Server und bisherige Restic-Konfiguration **nur lesend** inventarisieren: installierte Versionen, Repository, USB-Laufwerk und Entschlüsselbarkeit. Bestehende Backups/Timer niemals ersetzen, rotieren oder löschen.
2. Prüfen, ob `pg_dump` **Version 17 oder neuer** installiert ist. Keine unkontrollierten Upgrades von Ubuntu oder bestehenden Supabase-Containern.
3. Im Supabase-Dashboard des **NoLimits-Projekts** oben `Connect` öffnen. Direkte Postgres-Verbindung `db.jcctdjjunxmxaphjkrsz.supabase.co:5432` verwenden, wenn Home Server IPv6 kann. Sonst den im Dashboard **tatsächlich angezeigten Session-Pooler-Host mit Port 5432** verwenden. Transaktionspooler (Port 6543) nicht für diesen Backupjob verwenden. Keine Hostnamen erraten.
4. Die Datenbank-Zugangsdaten über **Bitwarden und eine private root-lesbare Datei auf dem Home Server** hinterlegen, niemals in Chat/GitHub/Logs. `PGPASSFILE` mit Modus `0600`; `PGSSLMODE=verify-full` mit geprüftem Root-CA-Zertifikat, ggf. `PGSSLROOTCERT` konfigurieren. Keine Datenbank-Passwortrücksetzung allein zum Backup, falls bestehende Systeme das Passwort nutzen.
5. Bestehende Restic-Einstellungen beibehalten. Die Datei `RESTIC_PASSWORD_FILE` muss geschützt sein, bereits initialisiertes Repository verwenden. **Keine Verschlüsselungspassphrase erneuern**, solange die bisherigen Snapshots nicht unabhängig geprüft wurden. Bei USB-Betrieb bedenken: USB im selben Haus ist **kein** Offsite-Backup.
6. Nach Code-Review das Skript [NoLimits_SupabaseResticBackup_20261120.sh](ops/NoLimits_SupabaseResticBackup_20261120.sh) als root-lesbares, ausführbares Skript auf dem Server installieren. Es validiert Projekt/Host, Nutzer, Version, TLS, geheime Dateien und Restic-Repository; dann wird `pg_dump -Fc` über `stdin` **ohne lokale Klartext-SQL-Datei** direkt an Restic gegeben. `set -o pipefail` meldet Fehler in beiden Teilen.
7. **Ersten Lauf manuell starten**, Snapshots mit Tag `nolimits-supabase` und den jeweiligen Zeitstempeln kontrollieren. Fehlermeldungen dürfen keine echten Passwörter, URLs mit eingebetteten Kennwörtern oder Kundeninformationen enthalten.
8. Zur **echten Wiederherstellungsprobe** den verschlüsselten Dump ausschliesslich auf dem Home Server oder einer zugangsbeschränkten Testumgebung aus Restic lesen und eine **andere, isolierte PostgreSQL-17-/Supabase-kompatible Testdatenbank** verwenden. Original-NoLimits-Supabase-Projekt streng read-only halten. Besonders `auth`-Schema, RLS, Trigger und sensible PostgreSQL-Rollen müssen kontrolliert werden. Ohne erfolgreichen Restore **kein Release-Gate freigeben**.
9. Erst dann einen eigenen `systemd`-Service/Timer z. B. täglich am Nachmittag mit `Persistent=true` anlegen, ohne bestehende Zeitpläne zu überschreiben. Monitor/ntfy-Benachrichtigung bei Fehlschlag einschalten und eine Fehlersimulation mit **synthetischer** Datenbankverbindung durchführen.
10. Später eine **zweite, räumlich getrennte, verschlüsselte Kopie** ergänzen. Automatische `restic forget/prune`-Bereinigung für gemeinsam genutzte Repositorys **nicht** ohne genaue Tag-/Snapshot-Trennung aktivieren; sonst könnten andere Backups gelöscht werden.

## Private Laufzeit-Konfiguration (nur Platzhalter, NIEMALS in GitHub befüllen)

Privater Pfad als Vorschlag: `/etc/nolimits/supabase-backup.env`, Modus `0600`, Eigentümer root.

```bash
PGHOST=<aus dem NoLimits-Supabase-Dashboard, NICHT hier eintragen>
PGPORT=5432
PGUSER=<postgres oder postgres.jcctdjjunxmxaphjkrsz>
PGDATABASE=postgres
PGSSLMODE=verify-full
PGSSLROOTCERT=<lokaler geprüfter CA-Dateipfad>
PGPASSFILE=<lokaler geheimer Passwortdateipfad>
RESTIC_REPOSITORY=<bereits geprüftes verschlüsseltes Repository>
RESTIC_PASSWORD_FILE=<lokaler geheimer Passwortdateipfad>
```

`PGPASSFILE` enthält das private PostgreSQL-Passwort als `host:port:database:user:password`. Darauf achten, dass Doppelpunkte oder Backslashes im Passwort nach libpq-`.pgpass`-Konvention korrekt escaped werden. Alternativ kann der Server-Agent eine geeignetere private Credential-Verwaltung nutzen, muss dann jedoch die Skriptvorgaben vor Einsatz anpassen und testen.

## Erlaubt und verboten

**Erlaubt:** GitHub-Featurebranch auslesen, Skript prüfen, privates Backupverzeichnis vorbereiten, localhost-/synthetische Tests, Home-Server-Agent beauftragen.

**Verboten ohne separate Freigabe:** Supabase-Daten löschen oder wiederherstellen, neue kostenpflichtige Cloudleistungen aktivieren, Passwörter in Chat/GitHub eintragen, unangekündigte Änderungen an bestehenden Server-/Restic-Jobs vornehmen, reale Kunden-Dumps in GitHub ablegen, Wix kündigen oder die NoLimits-Produktivseite umschalten.

**Abschlussstatus, aktualisiert 20.11.2026:** Skript auf dem Home Server installiert, zwei echte verschlüsselte Restic-Snapshots erstellt, separater Restore im `supabase/postgres:17.6.1.136`-Testcontainer **ohne Fehler** bestanden. Eigener täglicher Timer um 14:30 Europe/Zurich und ntfy-Fehleralarm eingerichtet. Siehe [verifizierte Ergebnisse und Einschränkungen](NoLimits_Backup_Restore_20261120.md). Offsite-Kopie, Dateninhaltsabgleich und kontrollierte Aufbewahrung bleiben **OFFEN**. **ntfy-Fehlerwarnung auf iPhone bestätigt (PASS).** Die untenstehenden Schritte sind historische Installationsanweisungen und müssen nicht erneut durchgeführt werden.

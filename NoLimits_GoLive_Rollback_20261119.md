# NoLimits – Produktivwechsel, Rollback und Betriebsprüfung

**Stand:** 20.11.2026. **Status:** Vorbereitung, KEINE Produktivfreigabe. Gilt für `localboostzs/nolimits` (GitHub), Wix-Livesystem, Cal.com, Cloudflare und Supabase. Die technische Ausführung ist nach ausdrücklicher Freigabe durch Isen und Auftraggeber vorgesehen.

## 0. Verbindliche Sperren

- Bis zum vollständig erfolgreichen Testsystem **keine Einladung/Terminvereinbarung mit Isen**; manuelle Mobile-Abnahme erst unmittelbar vor dem Treffen.
- Bis zur erfolgreichen produktiven Migration **Wix-Website, Wix-Buchungen, Wix-Kalender, Domain/DNS, Abo und automatische Wix-Verlängerung unverändert lassen**. Erwartete Verlängerung am 30.11.2026 ist kein Grund für ein riskantes Abschalten.
- `main` enthält lediglich geprüfte GitHub-Testseiten-Frontendverbesserungen; Backend-Aliascode bleibt im **Draft-PR #3**. Nicht ungeprüft mergen.
- Geheimnisse/Tokens nie in GitHub, Markdown, Screenshots, Kalenderdaten oder Chatnachrichten kopieren.
- Der separate Worker `nolimits-alias-staging` und Cal.com-LAB-Event `7982460` gehören **nicht** zum Livebetrieb.

## 1. Bestätigter technischer Ist-Stand (19.11.2026, read-only)

| Objekt | Aktuelle Referenz | Hinweis |
|---|---|---|
| Live-Wix-Seite | `www.nolimits-barber.ch` | Bis Ende von Phase 3 als laufendes Kundenprodukt schützen |
| GitHub-Testseite | `https://localboostzs.github.io/nolimits/` | Nicht mit Wix-Live verwechseln |
| GitHub-Repo | `localboostzs/nolimits` | Draft-PR #3 `feature/NoLimits_Aliasbuchung_20261119` |
| Öffentliche Buchungs-API der GitHub-Testseite | `nolimits-booking-test.broken-haze-6cad.workers.dev` | Trotz `test` im Namen nicht unkontrolliert neu deployen |
| Aktueller produktrelevanter Worker-Name | `nolimits-booking-test` | **Nicht** `nolimits-booking` aus `worker/wrangler.toml` |
| Aktueller Worker-Deployment-ID-Snapshot | `7c4e3a55-d3c4-406b-b464-4c756b80a865` | 100 % auf Version `2ed271b7-812f-489b-81a8-535644d837cc`, Quelle Cloudflare, 17.11.2026 |
| Aktuelle Rate-Limits | `RL_BOOK`: Namespace 1001, 5/60 s; `RL_SLOTS`: Namespace 1002, 60/60 s | Bestehende Bindings beim Wechsel erhalten |
| Bereits vorhandene Secrets | `CAL_API_KEY`, `CAL_WEBHOOK_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `NL_EMAIL_ENABLED`, `NL_MANAGE_SECRET`, `NL_SUPABASE_PUBLISHABLE_KEY`, `NL_SUPABASE_URL`, `RESEND_API_KEY` | Werte nicht auslesen/dokumentieren |
| Neue Alias-Secretbindung später | `NL_SUPABASE_SECRET_KEY` | **Fehlt am bestehenden Live-Worker**; erst bei freigegebener Umstellung |
| Staging und Kalenderdateien | `nolimits-alias-staging`; `NL_ICS_ENABLED=false` nach echter Google-Kalender-Abnahme | Ein manuell importierter Umbuchungstermin erzeugte ein Duplikat; ICS für Kunden NICHT freigegeben |
| Öffentliche Buchungs-Services | 9 | Read-only `GET /api/health` 200, `GET /api/services` 200, 9 Services |

**WICHTIG:** Der frühere `worker/wrangler.toml` würde mit `name = "nolimits-booking"` einen anderen Worker betreffen. **Nicht** in dieser Form auf die vorhandene API deployen. Vor jeder Freigabe korrekte Ziel-ID, Scripts, Eventtyp-Zuordnungen, Bindings und Secrets prüfen.

## 2. Phase 1 – technische Abnahme ohne Isen

1. GitHub-Browser- und Worker-Regressionen vollständig `PASS`. Insbesondere angemeldete Konten, Mitarbeiter-CRM, gültige/ungültige signierte Links, Umbuchung, Storno, Alias-Privacy, E-Mail und ICS.
2. Stage-Buchung nur an internen Testempfänger; Cal.com empfängt über `info+…@localboost-zs.ch`, Resend an die originale interne Adresse. Nach Test Cal.com `CANCELLED`, Aliaszuordnung gelöscht, Workers.dev wieder **disabled**.
3. Staging-CI: versteckter Cal-LAB-Typ `7982460`, `NL_ALIAS_STAGING_ONLY=true`, nie die produktiven Event-IDs. Neues ICS nur per `NL_ICS_ENABLED=true`.
4. Echte Browserprofile und CRM-Funktionen mit zugelassenen internen Testkonten, ohne kundenbezogene Änderungen.
5. Monitor-/Recovery-Plan, Backup-Strategie, aktuelle Worker-/GitHub-Version und Rollback-Pfade dokumentieren; unterstützte E-Mail-Kalenderdateien mit internen Testempfängern kontrollieren.
6. Ganz am Schluss: Auftraggeber prüft komplette **Mobile-Darstellung** und alle wesentlichen Abläufe auf dem iPhone. Erst danach gegebenenfalls Isen-Termin.

**Stopper:** Fehlgeschlagene Zustellung, falsche Domain, neue ungeklärte Doppelbuchung, offen erreichbarer Stage-Worker, fehlende RLS, unsicherer Alias-Rollback oder falsche Service-IDs → kein Kontakt mit Isen.


### Nachtrag 20.11.2026 – Bereits erledigte technische Release-Sicherungen

1. **Erreichbarkeit und Datenschutz:** Zweimal täglich via GitHub Actions auf `main` ausschliesslich lesende Prüfung der bisherigen Buchungs-API `/api/health`, der neun öffentlichen Leistungen inkl. Preis/Dauer und des **verweigerten anonymen Zugriffs auf `/api/admin/contacts` (HTTP 401)**. Die ersten manuell gestarteten Läufe sind erfolgreich. Fehlgeschlagene GitHub-Actions-Jobs sind sichtbar; automatische Benutzerbenachrichtigungen hängen von den GitHub-Notification-Einstellungen ab. Das Monitoring versendet keine Testbuchungen und kontrolliert **nicht** E-Mail-Zustellung oder Cal.com-Schreibfähigkeit.
2. **Eindeutiges Veröffentlichungsziel:** `worker/wrangler.production-candidate.toml` referenziert den wirklich vorhandenen Worker `nolimits-booking-test`, erhält beide Rate-Limits und deaktiviert Alias + Kalender-ICS. Über GitHub CI nur `wrangler deploy --dry-run`, **nie produktiv deployed**.
3. **Domain-Umschaltung ohne erneute Codeänderung:** `NL_PUBLIC_SITE_BASE` als serverseitig konfigurierte, explizit beschränkte Website-Basis. Bis zur Freigabe Standard `https://localboostzs.github.io/nolimits`; nach Isens Einverständnis auf `https://nolimits-barber.ch` (oder bestätigtes `www`) setzen. Nur diese Hostnamen sind im Worker erlaubt. Buchungslinks, Umbuchungslinks, E-Mail-Logo sowie Impressum-/Website-Links verwenden dieselbe validierte Basis. **Gleichzeitig** `ALLOWED_ORIGINS` für den späteren echten Browser-Origin konfigurieren; vorher darf die Wix-Domain nicht auf neue Buchungen umgestellt werden.
4. **Minimierung gespeicherter E-Mail-Zuordnungen:** Bei eindeutigen Cal.com-Ablehnungen (HTTP 400/409/422) wird das noch nicht gebundene Alias aus Supabase entfernt. Bei Timeout/5xx/unklarer Annahme bleibt die Zuordnung bewusst bestehen, damit mögliche bestätigte Termine/Mails nicht verloren gehen. Mock-Tests `PASS`; Feature-Branch noch nicht live.
5. **Anwenderbefund iCalendar:** Bestätigung, Umbuchung, Storno als eigene Mails jeweils `delivered`. Manueller Google-ICS-Import hinterliess den ursprünglichen Termin trotz Umbuchung/Storno. [Exakter Befund](NoLimits_Kalenderimport_Befund_20261120.md). Kalenderdatei **deaktiviert**, keine falschen Synchronisationsversprechen.
6. **Supabase-Audit:** Alle vier NoLimits-Tabellen mit RLS; Alias-Mapping hat keine `anon`/`authenticated`-Tabellenprivilegien. Am 20.11.2026: 0 Aliaszuordnungen, 0 importierte Legacy-Kontakte, 2 Test-/Kundenprofile, 1 Mitarbeiterkonto (nur aggregiert; keine Identitäten ausgelesen). Supabase-Sicherheitsadvisor meldet unter anderem optionalen Schutz gegen geleakte Passwörter deaktiviert; die derzeitige Anmeldung ist passwortlos. Nicht blind Auth-Optionen ändern.

## 3. Phase 2 – Gespräch mit Isen, erst nach Freigabe

Kurz und ohne technische Implementierungsdetails Website, Terminbuchungsablauf, NoLimits-Mails, Kalenderintegration und sein Konto zeigen. **Erst nach seinem Go** gemeinsam:
- Richtige Cal.com-Organisation bzw. persönliches Cal.com-Konto und verbundene Kalender festlegen; hinterlegte Buchungszeiten, Puffer, Feiertage, Preise und Service-Dauern bestätigen.
- Wix-Kunden und bestehende Termine mit seiner ausdrücklichen Freigabe exportieren/sichern, erforderliche Datenschutzhinweise prüfen.
- Seine Mitarbeiterberechtigung mit eigener Identität und dem minimal nötigen Zugriff konfigurieren.
- Zuständigkeit für Stornos, Kundenrückfragen, E-Mail-Supportadresse, rechtliche Informationen und Aufbewahrung vereinbaren.
- Domain-/Go-live-Fenster und Kundenkommunikation vereinbaren. **Wix weiterhin live lassen.**

## 4. Phase 3 – zu Hause: technischer Cutover, mit Freigabe-Gates

### Vor einem Deploy (kein Code ohne Snapshot)
- GitHub `main`-Commit und Deploymentversion archivieren. Vorhandene Worker-Bindings, Secrets **nur Namen**, Cal.com-Webhook-IDs und Config-Snapshot erfassen.
- Wenn die aktive Cloudflare-Version von `2ed271b7-812f-489b-81a8-535644d837cc` abweicht, neu inventarisieren; niemals blind auf eine alte Version zurücksetzen.
- Vorhandene 9 Services und interne Rasur mit späteren **Isen**-Eventtyp-IDs (inklusive Zeitzone, Dauer, Preis) vergleichen. Änderungen zwingend versioniert.
- Separaten Recovery-Weg offenhalten (Cloudflare-Web-Dashboard/Versionen und Repo-Tag).
- Supabase-Alias-Migration und Rechte/Policies prüfen. Vor Import ein verschlüsseltes, wiederherstellbares Backup anfertigen; Wiederherstellung mit Testdaten verifizieren.

### Worker-Deployment
- Ausschliesslich bestehendes Worker-Ziel `nolimits-booking-test` identifizieren; nicht den abweichenden `wrangler.toml`-Namen verwenden.
- Nur den geprüften **`worker/wrangler.production-candidate.toml`** für das bestehende Worker-Ziel verwenden, nicht den abweichenden historischen `wrangler.toml`. Vor einem echten Deploy **explizite Freigabe** und aktuelle Version/Bindings/Secrets sichern. Der Kandidat wurde bisher ausschliesslich trocken kompiliert. Alias zunächst **aus** (`NL_ALIAS_MODE=off`), Kalender-ICS aus (`NL_ICS_ENABLED=false`). Vor/nach Read-only Health/Services und Mitarbeiterzugriff vergleichen.
- Live-Webhooks nur einmal konfigurieren und Signatur prüfen; keine doppelten Kundennachrichten auslösen.
- Geheimnis `NL_SUPABASE_SECRET_KEY` **nur serverseitig** hinzufügen. `NL_ALIAS_DOMAIN=localboost-zs.ch`, `NL_ALIAS_PREFIX=info`, `NL_ALIAS_SEPARATOR=+` und die geprüfte Empfängerweiterleitung setzen.
- Alias erst nach End-to-End-Staging und mindestens einer internen, ausdrücklich autorisierten Live-Probe aktivieren (`NL_ALIAS_MODE=enabled`). `NL_ICS_ENABLED=false` **beibehalten**, bis eine neu konzipierte Einladung mit echter Kalender-App erfolgreich getestet ist; manuelle ICS-Importe haben in Google Kalender Duplikate verursacht.
- Vor der tatsächlichen Domain-/CTA-Umschaltung: Mailprüfung, Terminmanagement, Doppelbuchungsabwehr, CRM und Kalenderzugriff mit Isens Identität vollständig prüfen.

### Wix-Kunden und Termine
- Kontaktimport ausschliesslich mit Isens ausdrücklicher Einwilligung und geprüfter CSV-Vorschau; keine Direktimporte aus fremden Wix-Konten.
- Bestehende Wix-Termine zunächst offline validieren und gegen den verbundenen Cal.com-Kalender spiegeln; unklare Zeiten, fehlende Kontakte und Kollisionen **nicht** automatisch übernehmen.
- Erst nach freigegebenem Plan, Sicherung und vollständiger Konfliktbereinigung terminweise migrieren; Wix- und Cal.com-Termine bis zum Cutover zählen/abgleichen.
- Während beider Systeme Buchungszugänge koordinieren, damit kein Zeitfenster doppelt vergeben wird.

### Go-live
- Definiertes Zeitfenster mit Low-Traffic wählen, alle Verantwortlichen informiert.
- Neue NoLimits-Website und Buchungs-CTA bewusst auf die genehmigte Domain umstellen. DNS-/MX-/SPF-/DKIM-Einträge für E-Mail niemals pauschal ersetzen.
- Test: echtes Website-Formular, erfolgreiche Buchung, genau eine personalisierte NoLimits-E-Mail an Endkunden, Kunden-Verwaltungslink, Mitarbeiter-CRM, Isens Kalender, Stornierung/Umbuchung; überall Verfügbarkeit und Rückgängigmachung.
- Nur nach erfolgreichem Go-live und beobachteter Stabilität: **separat** Wix-Verlängerung/Kündigung mit dem Nutzer abstimmen. Eine mögliche zusätzliche Wix-Zahlung schützt vor Totalausfall.

## 5. Rollback-Plan – Stoppkriterien

**Sofort zurücksetzen bei:** fehlgeschlagenen Kundennachrichten, leeren Kalendern, nicht erreichbarem Terminmanagement, fehlendem CRM-Zugriff, falschem Empfänger, Doppelbuchungen, Fehlern in Supabase-Alias-Auflösung, unbeabsichtigter Domainänderung oder offenen Sicherheitsrisiken.

1. Neue Buchungen über den fehlerhaften Pfad sofort pausieren, ohne bestehende Termine zu löschen. Zustand/Fehlermeldung ohne persönliche Daten dokumentieren.
2. Für reine **Alias-Probleme** `NL_ALIAS_MODE=disabled` setzen, **aber** `NL_ALIAS_DOMAIN`, `NL_ALIAS_PREFIX`, `NL_ALIAS_SEPARATOR`, `NL_SUPABASE_SECRET_KEY` und die Aliasdatenbank **behalten**. Sonst gehen E-Mails/Verwaltungslinks bereits gebuchter Alias-Termine verloren.
3. Für Code-Probleme auf die **zuvor unmittelbar protokollierte** Cloudflare-Worker-Version zurückrollen. Vorher muss klar sein, ob diese Aliasbuchungen weiterhin lesen kann; sonst alte Aliasbuchungen gezielt unterstützen, nicht blind den alten Code aktivieren.
4. Falls Domain-/CTA bereits auf neu umgestellt wurde, kontrolliert auf die weiterhin funktionsfähige Wix-Buchungsseite zurückstellen. Keine MX- oder SPF-Änderung.
5. Synchronisation beider Systeme: Neue Termine seit Umschaltung vergleichen, manuell auf Doppelbuchungen prüfen und mit Isen korrigieren.
6. Fehler beheben, Sicherheits-/Buchungs- und Zustelltests komplett wiederholen. Erneutes Go-live nur nach neuer ausdrücklicher Freigabe.

## 6. Monitoring und Wiederanlauf

- Vor Umschaltung prüfen: `GET /api/health` → 200, `GET /api/services` → HTTP 200 und erwartete 9 Services. Diese zwei Endpunkte prüfen **nicht** die Erreichbarkeit von Resend, Cal-Bookings oder Supabase; ein grüner Health-Status alleine ist keine Freigabe.
- Zusätzlich synthetische interne End-to-End-Buchung mit eigener Testadresse, danach kontrollierte Stornierung und Versandnachweise; nicht automatisiert Kundenbuchungen erzeugen.
- Resend-Bounces/Fehler, Cal.com-Webhook-Fehlzustellungen und Cloudflare-Worker-Fehlerrate mit Alarmierung überwachen, sobald die echten Zugangsdaten/Monitoring-Entscheide feststehen.
- Supabase-Alias-Mappings, Vorhandensein neuer Einträge und fehlgeschlagene Alias-Lookups prüfen, aber keine Kundenadresse in Logs schreiben.
- Backups für Wix-Exporte, Cal-Eventtyp-Liste, Supabase-Zuordnung und Cloudflare-Konfiguration geschützt aufbewahren; dokumentierte Wiederherstellung an Testdaten probieren.
- Bei externen Ausfällen: Buchungs-CTA mit ehrlicher Meldung und Supportkontakt; kein stilles Annehmen einer nicht bestätigten Buchung.

**Aktueller Status:** Dieses Dokument ist ein Freigabeprotokoll und keine Aufforderung zum sofortigen Produktivwechsel. Isen wird erst nach abgeschlossener Phase 1 kontaktiert. Wix-Abonnement bleibt aktiv.

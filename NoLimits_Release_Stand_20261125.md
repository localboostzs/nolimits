# NoLimits – Release-Stand, Testbericht und Rollback (25.11.2026)

Status: **Vorbereitung, keine Produktionsfreigabe.** Kein Deployment, kein Merge in `main`, keine echten Buchungen, keine Änderung an Wix oder DNS. Dieses Dokument ersetzt die Versions- und Rollback-Angaben in den Dokumenten vom 19.–24.11.

## 1. Versionen (Worker `nolimits-booking-test`)

| Nr. | Versions-ID | Bedeutung | Verwenden? |
|---|---|---|---|
| 36 | `ed522b6a-d9b8-4de8-a208-91e49e6cb746` | **Release-Kandidat** (Commit `5740668`), Alias `off`, ICS `false`, Demo-Domain; zugleich neueste Version | ja, nach Freigabe |
| 35 | `65d9b7d8-3e0c-431b-923b-7edfde9c4553` | **Alias-Fallback** (Commit `5740668`), Alias `disabled` mit `localboost-zs.ch` / `info` / `+` | nur Rollback nach Alias-Aktivierung |
| 34 | `7d6401e0-392d-4679-a597-d48818e9a3ad` | früherer Kandidat (`8ed4c8b`) | überholt, nicht deployen |
| 33 | `93b39a98-45d8-4c3a-a625-3b7c95c010b2` | alter Code plus `NL_SUPABASE_SECRET_KEY` | nicht deployen |
| 32 | `2ed271b7-812f-489b-81a8-535644d837cc` | **aktuell live, 100 %** (Deployment `7c4e3a55-d3c4-406b-b464-4c756b80a865`) | Rollback vor Alias-Aktivierung |
| 31 | `561f51bf-0f76-4b92-a151-6d7a49fd4588` | Vorgänger, gleicher Code wie 32 | – |

Git: Code-Stand `57406688bcbaf611dd17458d6e90b97d90b03853`, vorher `8ed4c8b928e9aea45da9eb40f1b7d70c255f2908`, `main` `c70fc168c2e5778cd7f8496732117d83deed8558`, Draft-PR #3.

Versionen 35 und 36: je 9 Secret-Bindings, `RL_BOOK` (1001, 5/60 s), `RL_SLOTS` (1002, 60/60 s); Quelldateien per Git-Blob-Hash mit dem Commit abgeglichen. workers.dev aktiv, Preview-URLs aus.

**Warnung:** Bis zum Go-live im Cloudflare-Dashboard keine Secrets oder Variablen mit «Deploy» ändern – das könnte die neueste Version live schalten.

## 2. Änderungen in diesem Stand
1. **Rollback-Fehler behoben:** Die neue Terminverwaltungsseite blendete mit dem alten Worker Umbuchen **und** Stornieren aus (Felder `canCancel`/`canReschedule` fehlen dort). Jetzt wird nur bei ausdrücklichem `false` ausgeblendet.
2. **Mitarbeiter-Verwaltung:** Die Erfolgsmeldung nach einer Buchung wurde sofort gelöscht (auch auf `main`; Risiko doppelter Buchungen). Im Feature-Stand behoben.
3. **Nachweis Stornierungsbedingungen:** Cal.com-`metadata` mit Quelle, Textfassung und Serverzeit (Abschnitt 5).
4. **Fallback-Konfiguration** `worker/wrangler.alias-fallback.toml`.
5. **Login-Test** an die tatsächliche Meldung angepasst; neue Tests; alle Tests in der CI.

## 3. Testergebnisse (lokal, Node 24, Chrome)
| Prüfung | Ergebnis |
|---|---|
| Syntaxprüfung | bestanden |
| Offline-Testdateien | 26/26 |
| Browsertests inklusive Kompatibilitätsmatrix | 5/5 |
| Wix-Plan-CLI (synthetisch) | bestanden |
| Wrangler-Dry-Run Kandidat, Fallback, Staging | bestanden; Staging ohne produktive Event-ID 7888953 |
| Live-API nur lesend | Health ok, 9 Dienste, anonymes CRM abgewiesen |

CI (Node 22) auf Commit `5740668`: [alias-tests](https://github.com/localboostzs/nolimits/actions/runs/45574777426) und [browser-audit](https://github.com/localboostzs/nolimits/actions/runs/45574777757) erfolgreich.

Login: Erfolgsmeldung verrät kein Konto, 10 s Sperre, Server-Wartezeit bis 120 s, keine Rohfehler. Bei erreichtem Mail-Kontingent gibt es keine lokale Sperre; Schutz leistet Supabase serverseitig (dessen Limits waren nicht auslesbar). Der alte Testtext war seit 16.11. überholt.

### Kompatibilitätsmatrix (echte Frontend- und Worker-Dateien, simulierte Dienste; Desktop und Mobile)
| Frontend / Worker | Buchen, Umbuchen, Stornieren | Storno-Knopf < 24 h | Mitarbeiterbuchung |
|---|---|---|---|
| main / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert am Pflichtfeld (angenommen) |
| main / Kandidat, Fallback | ok | sichtbar, Server lehnt mit Meldung ab | ok, Erfolgsmeldung verschwindet |
| Feature / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert (angenommen); Serien: «nicht gefunden», nichts gebucht |
| Feature / Kandidat, Fallback | ok | ausgeblendet | ok, inklusive 4er-Serie |

Mit `main`-Frontend fehlt im Nachweis die Textfassung (`nicht_uebermittelt`); dort steht zudem ein anderer Stornotext.

## 4. Alias-Fallback
Offline geprüft (`tests/NoLimits_AliasFallback_Tests_20261125.mjs`): Buchungen aus der Zeit mit aktivem Alias – Bestätigung, Verwaltungslink, Umbuchung, Storno, Webhooks ohne Teilnehmerangaben, CRM – laufen mit der Fallback-Konfiguration; Mails gehen an die echte Adresse. Neue Buchungen nutzen die echte Adresse. Ohne Secret-Key: HTTP 503, kein Versand. Ohne `NL_ALIAS_DOMAIN`: Mail an den Alias.

Nur lesend bestätigt: Tabelle `nl_booking_email_aliases` vorhanden (0 Zeilen), RLS aktiv, `service_role` darf lesen/schreiben/löschen, `anon`/`authenticated` nicht lesen; Cal.com-Webhook aktiv auf diesen Worker (created, cancelled, rescheduled); Resend-Domain `nolimits-barber.ch` verifiziert.

**Nicht beweisbar ohne echte Buchung:** tatsächliche Mailzustellung, Gültigkeit und Übereinstimmung der Secret-Werte. Schlägt die Alias-Abfrage fehl, antwortet der Worker mit 503; ob Cal.com den Webhook wiederholt, ist ungeprüft.

## 5. Buchungsfeld `stornierungsbedingungen_akzeptiert`
- Cal.com: Bei **Gentleman Rasur (7912905)** ist das Feld jetzt als **Boolean, Pflicht, sichtbar** konfiguriert (Label «Ich akzeptiere die Stornierungsbedingungen.»). Die übrigen neun Leistungen haben es nicht.
- Worker: akzeptiert nur das boolesche `accepted: true` (Kunde, Mitarbeiter, Serie); sendet das Feld als `true`.
- `metadata`: `nlTermsSource` = `customer_checkbox` oder `staff_attestation`, `nlTermsVersion` (Feature-Frontend: `2026-11-23-online-24h`), `nlTermsRecordedAt`. Der Client kann Quelle und Zeit nicht setzen.
- Textfassung `2026-11-23-online-24h`: «Ich habe zur Kenntnis genommen, dass Online-Stornierungen nur bis spätestens 24 Stunden vor Terminbeginn möglich sind. Bei Nichterscheinen können gemäss den vereinbarten Bedingungen Kosten entstehen.»
- **Grenzen:** Bei Mitarbeiter- und Serienterminen steht das Feld wie bisher auf `true`, ist aber **keine Kundenzustimmung**, sondern eine Mitarbeiterangabe. Der Nachweis belegt die übermittelte Zustimmung, nicht die Identität der Person. Speicherung von `metadata` in Cal.com und Verhalten beim Umbuchen sind nur nach Dokumentation angenommen, nicht live geprüft.
- **Offen (Entscheidung):** Genügt für Mitarbeitertermine die Mitarbeiterangabe? Soll das Feld bei den anderen Leistungen ergänzt werden? Das LAB-Event ohne Feld lassen (der LAB-Pfad sendet es nicht).
- **Wirkt schon jetzt:** Der Live-Worker lässt das Feld bei Mitarbeiterbuchungen für Gentleman Rasur weg. Solche Buchungen dürfte Cal.com bis zum Deployment (und nach einem Rollback auf 32) ablehnen.

## 6. Befund 24-Stunden-Frist (keine Regel geändert)
1. **Bestätigt (offline):** Kandidat sperrt das Storno 3 h vor dem Termin, erlaubt aber das Umbuchen auf einen späteren Tag; danach ist das Storno möglich.
2. **Aus der Konfiguration abgeleitet, nicht ausprobiert:** Alle zehn Cal.com-Leistungen erlauben Storno und Umbuchung. Bei Alias `off` kann Cal.com Teilnehmermails mit eigenen Links an Kunden senden; für diese gilt die Worker-Frist nicht.
3. Der Live-Worker (32) hat gar keine 24-Stunden-Sperre.

Mit Isen zu klären: Soll die Frist auch für Umbuchungen gelten, und wie sollen die Cal.com-eigenen Wege behandelt werden?

## 7. Ablauf und Rollback (nur nach ausdrücklicher Freigabe)
Reihenfolge: zuerst Worker 36, danach zeitnah das Frontend.

```
npx wrangler versions deploy ed522b6a-d9b8-4de8-a208-91e49e6cb746@100% --name nolimits-booking-test
node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://nolimits-booking-test.broken-haze-6cad.workers.dev candidate
```
Erst bei Erfolg `NOLIMITS_MONITOR_BASELINE=candidate` setzen.

**Rollback A – Alias nie aktiviert:**
```
npx wrangler versions deploy 2ed271b7-812f-489b-81a8-535644d837cc@100% --name nolimits-booking-test
```
Preflight `legacy`, Monitor zurücksetzen. Folgen: keine Serien, keine 24-h-Sperre, Gentleman Rasur nicht öffentlich (bereits gebuchte Termine prüfen).

**Rollback B – Alias war aktiv:**
```
npx wrangler versions deploy 65d9b7d8-3e0c-431b-923b-7edfde9c4553@100% --name nolimits-booking-test
```
Versionen 32, 33, 34 und 36 sind dann **nicht** sicher (36 enthält keine Alias-Variablen). Tabelle, Secret-Key, Mailweiterleitung und Webhook behalten.

Version 35 gilt nur für die **Demo-Domain**. Vor einem Domainwechsel `ALLOWED_ORIGINS` und `NL_PUBLIC_SITE_BASE` anpassen, Fallback neu hochladen und die neue ID hier eintragen. Die Rollbacks sind offline getestet, nicht durch ein echtes Umschalten.

## 8. Offene Punkte vor Go-live
Interne End-to-End-Buchung mit Mailprüfung (nur mit Freigabe); Entscheidungen aus Abschnitt 5 und 6; Isens Kalender und Mitarbeiter-Login; Wix-Export; Offsite-Backup; Datenschutz; Domain und Auth-Redirects.

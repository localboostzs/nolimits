# NoLimits – Release-Stand, Testbericht und Rollback (25.11.2026)

Status: **Vorbereitung, keine Produktionsfreigabe.** Kein Deployment, kein Merge in `main`, keine echten Buchungen, keine Änderung an Wix oder DNS. Dieses Dokument ersetzt die Versions- und Rollback-Angaben in den Dokumenten vom 19.–24.11.

## 1. Versionen (Worker `nolimits-booking-test`)

Stand 25.11.2026 nach Erneuerung des Webhook-Signatur-Secrets. Die Versionen 37–39 haben denselben Code wie 32, 35 und 36.

| Nr. | Versions-ID | Bedeutung | Verwenden? |
|---|---|---|---|
| 39 | `95a07dfc-6611-4879-be7d-50b1251069f4` | Kandidat Stand `5740668`, Alias `off`, ICS `false`, Demo-Domain; neueste Version | nein: ohne die Änderungen aus Abschnitt 9, vorher neu hochladen |
| 38 | `18cf4a49-a4a1-494a-bdfe-f65132b56eed` | Alias-Fallback Stand `5740668` | nur Rollback nach Alias-Aktivierung |
| 37 | `da2c8307-6aa8-41e5-8c37-e9a4ad282407` | **aktuell live, 100 %** (Deployment `b85afd54-5ec1-4a71-9a82-d09fbbe062ef`) | Rollback vor Alias-Aktivierung |
| 22–36 | – | frühere Versionen | **nicht mehr aktivieren** |

Git: `main` `c70fc168c2e5778cd7f8496732117d83deed8558`, Draft-PR #3. workers.dev aktiv, Preview-URLs aus.

**Warnung:** Bis zum Go-live im Cloudflare-Dashboard keine Secrets oder Variablen mit «Deploy» ändern – das könnte die neueste Version live schalten. Versionen vor 37 auch nicht über das Dashboard zurückrollen.

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
1. Neuen Fallback und danach neuen Kandidaten aus dem geprüften Commit **ohne Deployment** hochladen; Bindings prüfen (je 9 Secrets, beide Limits) und die IDs hier eintragen.
2. Kandidat deployen, zeitnah das Frontend veröffentlichen.

```
npx wrangler versions deploy <neue-Kandidaten-ID>@100% --name nolimits-booking-test
node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://nolimits-booking-test.broken-haze-6cad.workers.dev candidate
```
Erst bei Erfolg `NOLIMITS_MONITOR_BASELINE=candidate` setzen.

**Rollback A – Alias nie aktiviert:**
```
npx wrangler versions deploy da2c8307-6aa8-41e5-8c37-e9a4ad282407@100% --name nolimits-booking-test
```
Preflight `legacy`, Monitor zurücksetzen. Folgen: keine Serien, keine 24-h-Sperre, keine Mitarbeiter-Verwaltung, Gentleman Rasur nicht öffentlich (bereits gebuchte Termine prüfen).

**Rollback B – Alias war aktiv:** den neuen Fallback aus Schritt 1 deployen (bis dahin `18cf4a49-a4a1-494a-bdfe-f65132b56eed`, ohne die Änderungen aus Abschnitt 9). Tabelle, Secret-Key, Mailweiterleitung und Webhook behalten.

Der Fallback gilt nur für die **Demo-Domain**. Vor einem Domainwechsel `ALLOWED_ORIGINS` und `NL_PUBLIC_SITE_BASE` anpassen und neu hochladen. Die Rollbacks sind offline getestet, nicht durch ein echtes Umschalten.

## 8. Offene Punkte vor Go-live
Interne End-to-End-Buchung mit Mailprüfung (nur mit Freigabe); Entscheidungen aus Abschnitt 5 und 6; Isens Kalender und Mitarbeiter-Login; Wix-Export; Offsite-Backup; Datenschutz; Domain und Auth-Redirects.

## 9. Nachtrag: im Code vorbereitet, noch nicht deployt
- Kunden können nur bis mindestens 24 Stunden vor Beginn stornieren **und** umbuchen. Damit ist die Entscheidung zu Abschnitt 6 getroffen; die Cal.com-eigenen Wege bleiben zu klären.
- Mitarbeiter verschieben und stornieren in der Verwaltung auch kurzfristig; bei Mitarbeiterbuchungen wird die Information des Kunden bestätigt und mit der Mitarbeiter-ID protokolliert.
- Buchungsbenachrichtigungen verwenden serverseitig gelesene Buchungsdaten.
- Tests: `node tests/run-offline.mjs` (ohne Netzwerk); Live-Prüfung getrennt unter `tests/live/`.

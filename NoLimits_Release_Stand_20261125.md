# NoLimits – Release-Stand, Testbericht und Rollback (25.11.2026)

Status: **zum Push vorbereitet, keine Produktionsfreigabe.** Kein Deployment des neuen Stands, kein Merge in `main`, keine Änderung an Wix oder DNS. Dieses Dokument ersetzt die Versions-, Rollback- und Alias-Vorgaben in den Dokumenten vom 19.–24.11. (dort steht noch Alias `off`).

## 1. Versionen (Worker `nolimits-booking-test`)

| Nr. | Versions-ID | Bedeutung | Verwenden? |
|---|---|---|---|
| 41 | `889c21bb-3802-4455-b764-4d5d6415ea6d` | **neuer Kandidat** (Commit `45aa9a6`), Alias `enabled`; neueste Version; nicht deployt | nur nach DEPLOYMENT-Freigabe |
| 40 | `26011d9f-2712-4f2b-82ce-cbc0e4285a17` | **neuer Fallback** (Commit `45aa9a6`), Alias `disabled`; nicht deployt | Rollback nach Alias-Aktivierung |
| 39 | `95a07dfc-6611-4879-be7d-50b1251069f4` | früherer Kandidat (Stand `5740668`), Alias `off` | nein |
| 38 | `18cf4a49-a4a1-494a-bdfe-f65132b56eed` | früherer Fallback (Stand `5740668`) | nur falls 40 ausfällt |
| 37 | `da2c8307-6aa8-41e5-8c37-e9a4ad282407` | **live, 100 %** (Deployment `b85afd54-5ec1-4a71-9a82-d09fbbe062ef`) | Rollback nur vor Alias-Aktivierung |
| 1–21 | – | ältere Versionen ohne Webhook-Prüfung | nicht aktivieren |

**Upload 25.11.2026, 22:09 UTC (ohne Deployment):** 40 und 41 über die Cloudflare-API aus Commit `45aa9a6` erzeugt. Nur lesend geprüft: je 9 Secret-Bindings (von Version 39 geerbt, Werte nicht lesbar), beide Rate-Limits, Variablen wie in den `wrangler`-Dateien, Code per Git-Hash gleich dem Commit; Preview-URLs aus; Version 37 unverändert aktiv.

**Bereinigung 25.11.2026 (abgeschlossen):** Das Webhook-Signatur-Secret wurde erneuert, die Zustellung mit einer internen Testbuchung (Buchung, Umbuchung, Stornierung) bestätigt. Anschliessend wurden die Versionen 22–36 und der abgelöste Cal.com-Webhook gelöscht. Nachprüfung (nur lesend): 24 Versionen vorhanden (1–21, 37–39), Version 37 zu 100 % aktiv. Die Löschung des Webhooks ist durch die Ausgabe des Werkzeugs belegt (HTTP 200).

Bis zum Go-live im Cloudflare-Dashboard keine Secrets oder Variablen mit «Deploy» ändern – das könnte die neueste Version live schalten.

## 2. Inhalt dieses Stands
- **24-Stunden-Regel:** Kunden stornieren **und** buchen nur bis mindestens 24 Stunden vor Beginn um (serverseitig geprüft). Mitarbeiter verschieben und stornieren auch kurzfristig.
- **Härtung:** Buchungsbenachrichtigungen verwenden serverseitig aus Cal.com gelesene Daten; veraltete Meldungen werden verworfen.
- **Umbuchungskalender** im Design der Erstbuchung (Commit `a6a4cc2`): nur freie Tage wählbar, Auswahl wird beim Monatswechsel verworfen, Bestätigen erst mit Uhrzeit und Häkchen.
- **Alias-Buchungen im Kandidaten eingeschaltet** (Abschnitt 4).
- **Nachweis Stornierungsbedingungen** in Cal.com-`metadata`; bei Mitarbeiterbuchungen mit Mitarbeiter-ID.
- **Betrieb:** Offline-Testlauf ohne Netzwerk, Live-Prüfung getrennt (`tests/live/`), Werkzeuge für Webhook-Erneuerung (Löschen auf eine feste Versionsliste begrenzt, mit Dry-Run `plan`) und LAB.

## 3. Testergebnisse (lokal, Node 24, Chrome, ohne Netzwerk)
| Prüfung | Ergebnis |
|---|---|
| `node tests/run-offline.mjs all` | **37/37** (31 Node-Suiten, 5 Browsersuiten, 1 CLI) |
| Wrangler-Dry-Run Kandidat, Fallback, Staging | bestanden; Staging-Bundle ohne produktive Event-ID |
| Cal.com-Mailschutz (`NoLimits_KeineCalMails_Tests_20261125.mjs`) | bestanden; schlägt mit Alias `off` fehl |

GitHub Actions auf Commit `45aa9a6` erfolgreich: [Offline-Tests](https://github.com/localboostzs/nolimits/actions/runs/45709191148) 32/32, [Browsertests](https://github.com/localboostzs/nolimits/actions/runs/45709191845) 5/5, [Live-Systemtest nur lesend](https://github.com/localboostzs/nolimits/actions/runs/45709191204) 18/18 gegen Version 37.

## 4. Keine Cal.com-Mails an Kunden
Cal.com lässt Teilnehmermails im Einzelkonto nicht abschalten (Versuch im LAB: HTTP 400, Organisation nötig). Deshalb erhält Cal.com im Kandidaten statt der Kundenadresse einen Alias `info+…@localboost-zs.ch`:
- Cal.com-Mails samt Cal.com-eigenen Storno-/Umbuchungslinks und Kalendereinladungen gehen an das LocalBoost-Postfach, nicht an Kunden. **Wer dieses Postfach liest, kann diese Links benutzen; für sie gilt die 24-Stunden-Frist nicht.**
- Kunden erhalten ausschliesslich NoLimits-Mails mit NoLimits-Verwaltungslink.
- Ohne speicherbaren Alias wird die Buchung abgelehnt (HTTP 503); die echte Adresse geht nicht ersatzweise an Cal.com.
- Es gilt nur für Buchungen, die der neue Kandidat anlegt. Ältere Buchungen mit echter Adresse behalten sie; vor dem Deployment darf keine solche offen sein (25.11.: 0 offene Buchungen).
- Direkt in Cal.com oder durch einen Import angelegte Termine sind nicht geschützt. Das gilt auch für den Wix-Import.
- Telefonnummer und Name gehen weiterhin an Cal.com. SMS-Abläufe in Cal.com wurden nicht geprüft.
- Der Kunde erhält keine Kalendereinladung (`NL_ICS_ENABLED=false`).

Nur lesend bestätigt (25.11.): Tabelle `nl_booking_email_aliases` vorhanden, 0 Zeilen, RLS aktiv, `anon`/`authenticated` ohne Lesezugriff, `service_role` darf schreiben; Secret-Bindings `NL_SUPABASE_SECRET_KEY` und `NL_SUPABASE_URL` in Version 39 vorhanden. Mit der Produktivkonfiguration noch nicht live erprobt.

## 5. Kompatibilität Frontend / Worker (offline, simulierte Dienste)
| Frontend / Worker | Buchen, Umbuchen, Stornieren | < 24 h | Mitarbeiterbuchung |
|---|---|---|---|
| main / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert am Pflichtfeld (angenommen) |
| main / Kandidat, Fallback | ok | sichtbar, Server lehnt mit Meldung ab | ok, Erfolgsmeldung verschwindet |
| Feature / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert (angenommen); Serien: «nicht gefunden» |
| Feature / Kandidat, Fallback | ok | ausgeblendet | ok, inklusive Serie |

## 6. Buchungsfeld `stornierungsbedingungen_akzeptiert`
- In Cal.com nur bei **Gentleman Rasur (7912905)** als Pflichtfeld angelegt; die übrigen neun Leistungen haben es nicht.
- Bei Mitarbeiter- und Serienterminen ist `true` eine Mitarbeiterangabe, keine Kundenzustimmung.
- Speicherung von `metadata` in Cal.com ist nach Dokumentation angenommen; Version 37 sendet keinen Nachweis.

## 7. Ablauf und Rollback (jeder Schritt nur nach ausdrücklicher Freigabe)
1. Erledigt: Push, CI erfolgreich.
2. Erledigt: Versionen 40 und 41 hochgeladen und geprüft.
3. LAB erneuern und testen.
4. Kandidat 41 deployen, Preflight, zeitnah das Frontend veröffentlichen.

```
npx wrangler versions deploy 889c21bb-3802-4455-b764-4d5d6415ea6d@100% --name nolimits-booking-test
node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://nolimits-booking-test.broken-haze-6cad.workers.dev candidate
```
Erst bei Erfolg `NOLIMITS_MONITOR_BASELINE=candidate` setzen. Danach sofort eine interne Testbuchung: Alias in Cal.com, genau eine NoLimits-Mail, keine Cal.com-Mail an die Testadresse.

**Rollback A – noch keine Buchung mit dem neuen Kandidaten:**
```
npx wrangler versions deploy da2c8307-6aa8-41e5-8c37-e9a4ad282407@100% --name nolimits-booking-test
```
Folgen: keine 24-Stunden-Sperre, keine Härtung, keine Serien, keine Mitarbeiter-Verwaltung; Cal.com-Mails gehen wieder an Kunden.

**Rollback B – es gibt Alias-Buchungen:** Fallback 40 `26011d9f-2712-4f2b-82ce-cbc0e4285a17` (nur falls dieser ausfällt 38, ohne die Neuerungen). **Nie 37 oder 39:** Sie kennen die Aliasse nicht und würden NoLimits-Mails an den Alias senden. Im Fallback nutzen **neue** Buchungen wieder die echte Adresse; Cal.com-Mails erreichen diese Kunden. Bei Bedarf Buchungen pausieren. Tabelle, Secret-Key, Mailweiterleitung und Webhook behalten.

Beide Konfigurationen gelten für die Demo-Domain. Vor einem Domainwechsel `ALLOWED_ORIGINS` und `NL_PUBLIC_SITE_BASE` anpassen.

## 8. Offene Punkte vor Go-live
Isens Mitarbeiter-Login; Isens Kalender; interne End-to-End-Buchung mit dem neuen Kandidaten; Zugriff und Aufbewahrung im Postfach der Aliasmails (Datenschutz); Preise ab 01.01.2027 (nicht umgesetzt); neun Cal.com-Pflichtfelder; Wix-Import über einen Alias-fähigen Weg; Offsite-Backup; Domain und Auth-Redirects.

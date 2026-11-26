# NoLimits – Release-Stand, Testbericht und Rollback (Stand 26.11.2026)

Status: **Stand vom 26.11.2026, in `main` übernommen.** Der laufende Betriebs- und Freigabestand wird intern geführt; die Angaben unten beschreiben den Stand vor der Freigabe. Keine Änderung an Wix oder DNS. Dieses Dokument ersetzt die Versions-, Rollback- und Alias-Vorgaben in den Dokumenten vom 19.–24.11. (dort steht noch Alias `off`).

## 1. Versionen (Worker `nolimits-booking-test`)

| Nr. | Versions-ID | Bedeutung | Verwenden? |
|---|---|---|---|
| neu | noch nicht hochgeladen | Kandidat und Fallback aus dem Stand mit Preisumstellung | erst hochladen (eigene Freigabe), dann deployen |
| 41 | `889c21bb-3802-4455-b764-4d5d6415ea6d` | Kandidat aus `45aa9a6`, Alias `enabled`; **ohne Preisumstellung**, überholt; nicht deployt | nicht deployen |
| 40 | `26011d9f-2712-4f2b-82ce-cbc0e4285a17` | Fallback aus `45aa9a6`, Alias `disabled`; ohne Preisumstellung; nicht deployt | nur Notfall-Rückfall, bis der neue Fallback hochgeladen ist |
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
- **Preisumstellung 2027** nach Termindatum auf allen Oberflächen, Preis-Popup vorbereitet (Abschnitt 4a).
- **Nachweis Stornierungsbedingungen** in Cal.com-`metadata`; bei Mitarbeiterbuchungen mit Mitarbeiter-ID.
- **Betrieb:** Offline-Testlauf ohne Netzwerk, Live-Prüfung getrennt (`tests/live/`), Werkzeuge für Webhook-Erneuerung (Löschen auf eine feste Versionsliste begrenzt, mit Dry-Run `plan`) und LAB.

## 3. Testergebnisse

### Offline (lokal, Node 24, Chrome, ohne Netzwerk, 26.11.2026)
| Prüfung | Ergebnis |
|---|---|
| `node tests/run-offline.mjs all` | **39/39** (32 Node-Suiten, 6 Browsersuiten, 1 CLI) |
| Node-Suiten mit auf den 15.01.2027 gestellter Uhr | 32/32 |
| Cal.com-Mailschutz (`NoLimits_KeineCalMails_Tests_20261125.mjs`) | bestanden |

### Isoliertes LAB (26.11.2026, Code aus `45aa9a6`)
| Prüfung | Ergebnis |
|---|---|
| Webhook-Secret des LAB erneuert, Rauchtest (Health 200, CRM anonym 401, gefälschter Webhook 401) | bestanden |
| Mitarbeiter-LAB-Testseite: Anmeldung, Isolation, freie Zeiten, Buchung, CRM, Stornierung, Aliasbereinigung | alle neun Schritte erfolgreich |
| Cal.com erhält nur den 32-stelligen Alias; Nachweisfelder gespeichert | bestätigt |
| Cal.com-Mails kommen im Alias-Postfach an; NoLimits-Stornierungsmail zugestellt | bestätigt |
| Nachher: Testtermin storniert, 0 offene Buchungen, 0 Aliaszeilen, Testfenster automatisch geschlossen | bestätigt |

**Nicht belegt:** Die Testseite storniert wenige Sekunden nach der Buchung; für einen bereits stornierten Termin verschickt der Worker absichtlich keine Bestätigung (offline nachgestellt). Bestätigungs- und Umbuchungsmail, Umbuchungskalender, 24-Stunden-Sperre, die Preisumstellung und die Produktivkonfiguration sind noch **nicht** live erprobt.

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

## 4a. Preise ab 01.01.2027
Termine ab dem 01.01.2027, 00:00 Uhr Zürcher Zeit, kosten CHF 5 mehr. **Massgebend ist der Terminbeginn, nicht das Buchungsdatum**, auch für schon gebuchte und für über den Jahreswechsel verschobene Termine.

| Oberfläche | Verhalten bis 31.12.2026 | ab 01.01.2027 |
|---|---|---|
| Startseite | Hinweiszeile; Popup vorbereitet, **ausgeschaltet** | Hinweis und Popup verschwinden |
| Leistungsseite | beide Preise und Hinweis | nur neuer Preis |
| Buchung | Liste mit beiden Preisen; Zusammenfassung und Bestätigung nach gewähltem Datum | neuer Preis |
| Verwaltungslink | Preis des Termins; beim Umbuchen Preis des neuen Datums | neuer Preis |
| Mitarbeiteransicht | Preis nach Datum, bei Serien je Anzahl, Rückfrage beim Verschieben | neuer Preis |
| E-Mails | Preis nach Terminbeginn | ebenso |

- Verbindlich rechnet der Worker (`priceAt`); die Website zeigt über `assets/js/preise.js` an. Leistungen ohne Preis oder mit Preis 0 (intern, LAB) bleiben unverändert.
- Popup einschalten: in `index.html` `priceNoticeEnabled=true` – erst nach dem Deployment des neuen Workers. Vorschau jederzeit: Startseite mit `?preisvorschau=1`. Es erscheint einmal je Browsersitzung.
- `priceRange` in den strukturierten Daten: «CHF 15 - CHF 65» (deckt beide Jahre). Anfang 2027 auf «CHF 20 - CHF 65» ändern.
- **Reihenfolge:** zuerst Worker deployen, dann die Website veröffentlichen. Mit Version 37 nennen Mails und Verwaltung für 2027 noch die alten Preise.

## 5. Kompatibilität Frontend / Worker (offline, simulierte Dienste)
| Frontend / Worker | Buchen, Umbuchen, Stornieren | < 24 h | Mitarbeiterbuchung |
|---|---|---|---|
| main / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert am Pflichtfeld (angenommen) |
| main / Kandidat, Fallback | ok | sichtbar, Server lehnt mit Meldung ab | ok, Erfolgsmeldung verschwindet |
| Feature / live | ok | Storno wird ausgeführt | Gentleman Rasur scheitert (angenommen); Serien: «nicht gefunden» |
| Feature / Kandidat, Fallback | ok | ausgeblendet | ok, inklusive Serie |

## 6. Buchungsfeld `stornierungsbedingungen_akzeptiert`
- Seit 26.11.2026 bei **allen zehn Leistungen** als sichtbares Pflichtfeld angelegt und zurückgelesen (neun neu; Gentleman Rasur seit 25.11.). Andere Einstellungen der Leistungen und der LAB-Eventtyp sind unverändert.
- Version 37 und der neue Stand senden den Wert (im Code geprüft). Dass Cal.com Buchungen ohne Wert ablehnt, ist aus der Einstellung angenommen.
- Direkt in Cal.com erfasste oder importierte Termine brauchen den Haken ebenfalls.
- Bei Mitarbeiter- und Serienterminen ist `true` eine Mitarbeiterangabe, keine Kundenzustimmung.
- Speicherung von `metadata` in Cal.com ist im LAB bestätigt (Mitarbeiterbuchung); Version 37 sendet keinen Nachweis.
- Rückweg: Feld in der jeweiligen Leistung entfernen (für den Rollback nicht nötig).

## 7. Ablauf und Rollback (jeder Schritt nur nach ausdrücklicher Freigabe)
1. Erledigt: Push, CI, LAB erneuert und getestet, Pflichtfelder angelegt.
2. Neue Versionen aus diesem Stand hochladen, **ohne Deployment**: zuerst Fallback (`worker/wrangler.alias-fallback.toml`), danach Kandidat (`worker/wrangler.production-candidate.toml`). Code, Bindings und Variablen nur lesend vergleichen; IDs hier eintragen.
3. Kandidat deployen, Preflight, interne Testbuchung. Erst bei Erfolg `NOLIMITS_MONITOR_BASELINE=candidate`.
4. Website veröffentlichen, danach Preis-Popup einschalten.

```
npx wrangler versions deploy <KANDIDAT-ID>@100% --name nolimits-booking-test
node tools/NoLimits_ReadonlyPreflight_20261119.mjs https://nolimits-booking-test.broken-haze-6cad.workers.dev candidate
```

**Interne Testbuchung (nach dem Deployment):** Termin mindestens 48 Stunden voraus; Alias in Cal.com; **auf die Bestätigungsmail warten**, bevor etwas geändert wird; umbuchen auf ein Datum ab 2027 und Preis in Mail und Verwaltung prüfen; danach stornieren. Genau je eine NoLimits-Mail, keine Cal.com-Mail an die Testadresse; Aliaszeile bereinigt.

**Abbruch und Rollback, wenn** Preflight fehlschlägt, eine Buchung 503 liefert, eine Mail fehlt oder an den Alias geht oder ein falscher Preis erscheint.

| Lage | Zurück auf | Folge |
|---|---|---|
| Noch **keine** Buchung mit dem neuen Kandidaten (Alias-Tabelle leer, kein offener Alias-Termin) | 37 `da2c8307-6aa8-41e5-8c37-e9a4ad282407` | keine 24-Stunden-Sperre, alte Preise, keine Härtung, keine Serien; Cal.com mailt wieder Kunden |
| Es gibt Alias-Buchungen | **neuer Fallback** | Preise und 24-Stunden-Regel bleiben; **neue** Buchungen nutzen die echte Adresse, Cal.com mailt diese Kunden |
| Neuer Fallback noch nicht oder nicht nutzbar | 40 `26011d9f-2712-4f2b-82ce-cbc0e4285a17`, danach 38 | alte Preise: Preise vor Ort richtigstellen, Buchungen ab 2027 prüfen |
| Nach Alias-Buchungen **nie** | 37, 39 | kennen die Aliasse nicht und würden NoLimits-Mails an den Alias senden |
| **Nie** | 1–21 | ohne Webhook-Prüfung |

```
npx wrangler versions deploy <ZIEL-ID>@100% --name nolimits-booking-test
```
- Tabelle, Secret-Key, Mailweiterleitung und Webhook behalten. Bei Bedarf Buchungen pausieren.
- Website nur zurücksetzen, wenn der Fehler dort liegt; die neue Website funktioniert auch mit Version 37 (offline getestet), zeigt dann aber keine datumsabhängigen Preise in der Verwaltung.
- Bis zum Go-live im Cloudflare-Dashboard keine Secrets oder Variablen mit «Deploy» ändern – das könnte die neueste Version live schalten.

Beide Konfigurationen gelten für die Demo-Domain. Vor einem Domainwechsel `ALLOWED_ORIGINS` und `NL_PUBLIC_SITE_BASE` anpassen.

## 8. Offene Punkte vor Go-live
Upload der neuen Versionen; interne End-to-End-Buchung mit dem neuen Kandidaten; Isens Mitarbeiter-Login und Kalender; Wix-Import über einen Alias-fähigen Weg (sonst Doppelbuchungen); Zugriff und Aufbewahrung im Postfach der Aliasmails (Datenschutz); DMARC-Eintrag der Absenderdomain; Offsite-Backup; Domain und Auth-Redirects.

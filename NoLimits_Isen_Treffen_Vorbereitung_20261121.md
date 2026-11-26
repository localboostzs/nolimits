# NoLimits – Vorbereitung des Gesprächs mit Isen

**Datum:** 21.11.2026  
**Projekt:** LocalBoost Zentralschweiz · NoLimits Barbershop  
**Status:** **Phase 1 technisch bestanden**, inklusive manueller iPhone-Abnahme. **Isen wurde nicht kontaktiert. Keine Produktivfreigabe.**

## Ziel des Treffens

Dem Geschäftsinhaber die bereits geprüfte neue NoLimits-Webseite samt Kundenkonto, Terminbuchungsprozess und Mitarbeiterverwaltung **verständlich vorführen**, seine tatsächlichen Geschäfts- und Kalendereinstellungen bestätigen lassen und die notwendige Zustimmung zur späteren Datenmigration und Go-live-Planung einholen.

Das Treffen ist **kein automatischer Live-Schalttermin**. Die derzeitige Wix-Website bleibt bis zu einem späteren sicheren, ausdrücklich autorisierten Produktivwechsel erreichbar. Keine Abokündigung, keine DNS- oder Worker-Umstellung vorab.

## 1. Vorführung (ca. 10–15 Minuten, kundenorientiert)

1. **Neue mobile Website**: https://localboostzs.github.io/nolimits/ – Navigation, Design, Leistungen, Preisliste, Kontakt und die wichtigsten Call-to-Actions zeigen. Sie ist eine **Testwebsite**, nicht die aktive Wix-Domain.
2. **Auswahl eines Termins**: Dienstleistung, Datum, verfügbare Uhrzeit und Buchungsformular zeigen. **Keine reale Kundenbuchung abschliessen**, solange sie auf ein aktives Testkalenderkonto zugreifen würde.
3. **Kundenkonto**: Anmeldung, eigene Profildaten, gespeicherte Daten und Schutz fremder Profile anhand des bestehenden internen Testkontos zeigen. Keine Kundendaten anderer Personen demonstrieren.
4. **Terminverwaltung & Mails**: Mit vorher vorbereiteten anonymisierten Screenshots erklären, wie personalisierte Bestätigungen, Umbuchungen, Stornierungen und ein persönlicher, signierter Verwaltungslink funktionieren. Keine signierten Links oder Tokens weitergeben.
5. **Mitarbeiterverwaltung/CRM**: Im eigenen freigegebenen Test-Mitarbeiterkonto zeigen, wie Kunden- und Terminverwaltung aussehen. Der echte interne LAB-E2E-Test ist bereits bestanden, ein weiterer LAB- oder echter Kundentest ist beim Treffen nicht zwingend notwendig.
6. **Bisherige Wix-Webseite**: Klarstellen, dass sie weiterhin produktiv läuft, bis die Datenmigration und der Wechsel ausdrücklich freigegeben, getestet und überwacht sind.

### Transparent erklären

- Die Website wird erst mit **Isens Kalender und finalen Dienstleistungs-IDs/Zeiten** zur produktiven Lösung.
- Automatische Kalendereinladungen über manuell importierte **.ics**-Dateien sind derzeit **deaktiviert**, weil Google-Kalender-Umbuchung/Stornierung im Realtest zu doppelten Terminen führte. NoLimits-E-Mails als reine Bestätigung/Storno funktionieren. Keine automatische Kalendersynchronisation versprechen, bevor sie erneut korrekt gebaut und getestet wurde.
- Bestell-/Kundenkontakte und bestehende Wix-Termine werden **nicht ohne seine Freigabe** übertragen.
- Das technische NoLimits-Testsystem ist Phase 1 **PASS**, die Migration und eigentliche Produktivabnahme sind eigene nachfolgende Arbeitsschritte.

## 2. Mit Isen schriftlich oder im gemeinsamen Protokoll klären

| Thema | Benötigte Entscheidung | Bis dahin |
|---|---|---|
| Dienstleistungen und Preise | Endgültige Namen, Preise, Dauer und eventuelle Altersgrenzen/Bedingungen | Bereits getestete Demo-Werte nicht ungeprüft produktiv übernehmen |
| Öffnungszeiten und Verfügbarkeit | Arbeitstage, Ferien, Pausen, Vorlauf- und Stornozeiten, Puffer | Kein Live-Kalenderwechsel |
| Kalender und Cal.com | Welche Kalender gehören Isen? Welche Konten/Events müssen erstellt oder angebunden werden? Wer erhält Buchungsbenachrichtigungen? | Nur internes LAB, keine fremden Terminkalender anfassen |
| Wix-Bestand | Welche künftigen Termine/Kontakte bestehen? Dürfen Daten exportiert und migriert werden? Was muss erhalten bleiben? | Kein Export/Import ohne Freigabe |
| Nutzer und Mitarbeiter | Eigentümerkonto, Mitarbeiterberechtigungen und Datenschutz-/Zugriffserwartungen | Keine neuen produktiven Staff-Rechte vergeben |
| Kundenkommunikation | Freigabe Absender, E-Mail-Texte, Support-/Antwortadresse, Storno/No-Show-Informationen | `noreply@` ist nur Absender; Rückfragen brauchen einen echten Supportkanal |
| Datenschutz & Verantwortung | Korrekte Geschäftsangaben, Datenschutzerklärung, externe Anbieter, Aufbewahrungs-/Löschfristen und Weitergabe von Personendaten | Keine faktisch unbelegten Texte als rechtsverbindlich veröffentlichen |
| Umschalttag | Gewünschter späterer Starttermin, Kontrolle der offenen Wix-Buchungen, Termin für Abnahme und Rollback-Verantwortung | Wix inkl. Abo und Domain laufen weiter |
| Backup-Betrieb | Zweite verschlüsselte Kopie ausser Haus, sichere Aufbewahrung/Retention und Notfallansprechpartner | Kein endgültiger produktiver Kundendaten-Cutover ohne tragfähige Backupentscheidung |

**Achtung:** Bei Isens Zugängen sollen **Isen oder der berechtigte Kontoinhaber** die Zugangsdaten selbst eingeben. Keine Passwörter oder Tokens in Meetingprotokollen, GitHub, Chat oder Screenshots speichern.

## 3. Nach dem Treffen – getrennte Phase 3

1. Entscheidungen, Freigaben und tatsächliche Daten-/Kalenderstruktur dokumentieren (ohne personenbezogene Exporte im öffentlichen Repo).
2. Wix-Bestand geschützt sichern, offene Buchungen mit Isen vollständig abgleichen; Datenmapping mit Testimport/Preview prüfen.
3. NoLimits Cal.com/Kalender- und Mitarbeiterberechtigungen mit Isens eigenen Konten konfigurieren.
4. Vor Produktivbetrieb Offsite-Backup und Retention festlegen, Datenschutz/Support prüfen.
5. Produktivworker **nur nach separater Freigabe** und nur über die geprüfte Kandidatenkonfiguration `worker/wrangler.production-candidate.toml` für den **bestehenden** Worker `nolimits-booking-test` vorbereiten; zuerst `NL_ALIAS_MODE=off` und `NL_ICS_ENABLED=false`. Vorher aktuellen Worker-Snapshot, Secrets-Namen und Rate-Limits dokumentieren.
6. End-to-End-Tests mit Isens eigenen Kalendern, geschützten Testdaten und korrekten Empfängern. Kundenkonto, Storno, Umbuchung, CRM, Fehlerfälle und Rollback testen.
7. **Nur bei dokumentiertem Go:** Domain, Website und Buchungsprozess bewusst umschalten, danach laufend überwachen und Rückfallweg bereit halten. **Erst nach gesichertem Erfolg** Wix-Verlängerung/Kündigung gesondert entscheiden.

## 4. Vorbereitung einer Einladung

**Empfohlenes Format:** kurzer persönlicher Vorführ- und Einrichtungstermin; Isen soll Zugriff auf sein Wix-Konto und Kalender-/Cal.com-Konto haben, sofern er damit einverstanden ist. Keine Zugangsdaten vorab per E-Mail an LocalBoost senden.

**Nachrichtenvorschlag:**

> Hallo Isen, wir haben die neue NoLimits-Website und das Buchungssystem fertig entwickelt und getestet – auch auf dem iPhone. Ich würde dir die neue Lösung gerne persönlich zeigen und mit dir die letzten Einstellungen für deinen Kalender, die Mitarbeiterverwaltung und die spätere Übernahme der bestehenden Termine besprechen. Wann hättest du Zeit für ein kurzes Treffen? Deine bisherige Wix-Website bleibt bis zur endgültigen Umstellung unverändert online.

**Nicht eigenständig versendet.** Ein Termin muss erst vom Auftraggeber freigegeben/vereinbart werden.

## 5. Nachweis

- [Technische Phase-1-Abnahmematrix](NoLimits_Abnahmematrix_20261119.md)
- [Phase-1-Freigabestatus](NoLimits_Phase1_Freigabestatus_20261120.md)
- [Manuelle iPhone-Abnahme PASS](NoLimits_Mobile_Abnahme_20261121.md)
- [Backup-/Restore-/SHA-256-Integrität PASS](NoLimits_Backup_Restore_20261120.md)
- [Produktivwechsel-/Rollback-Plan](NoLimits_GoLive_Rollback_20261119.md)

**Entscheidung am 21.11.2026:** Phase 1 Testsystem **BESTANDEN**. Einladung zu Isens Gespräch **darf vom Auftraggeber organisiert werden**. Noch **keine** Livefreigabe, kein GitHub-PR-Merge, keine Wix-/Domain-/DNS-Änderung und keine tatsächlichen Kundenimporte.

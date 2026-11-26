# NoLimits – Produktivfreigabe und Gespräch mit Isen
**Stand:** 21.11.2026 · **Status:** Phase 1 Testsystem technisch vollständig abgenommen; Gespräch mit Isen darf vorbereitet werden. Keine produktive Umschaltung. 
**Gilt für:** GitHub `localboostzs/nolimits`, PR #3, Feature-Branch `feature/NoLimits_Aliasbuchung_20261119`.

## VERBINDLICHER Projektablauf (vom Auftraggeber am 19.11.2026 festgelegt)
**Phase 1 – VOR dem Treffen mit Isen:** Gesamtes Testsystem vollständig entwickeln, visuell und technisch bis ins Detail prüfen, alle E-Mail-Fälle, Buchungsabläufe, Kundenkonto, CRM, Admin, Sicherheit, Mobile, Rechte, Rollback und Migrationswerkzeuge testen. Bereitstellung so vorbereiten, dass nach Isens Freigabe nur noch seine eigenen Konten, Eventtypen, Kalender, Tokens, Kundendaten und die Domain-Umstellung durchgeführt werden müssen. **Isen erst für einen Termin kontaktieren, wenn Phase 1 abgeschlossen ist.**

**Phase 2 – gemeinsamer Vorführ- und Einrichtungstermin:** Isen bekommt nur die verständliche Produktvorführung (Website, Terminbuchung, Mails, sein Konto); keine technischen Implementierungsdetails. Bei seiner Go-live-Freigabe gemeinsam alle Schritte durchführen, die zwingend seine Mitwirkung benötigen: bestehende Wix-Kalender-/Kundenbuchungen exportieren oder sichern, neue Cal.com-Kalenderanbindung, sein Nutzerkonto, seine Berechtigungen sowie seine Zustimmung für Datenmigration, Kundenkommunikation und Produktivstart. Noch **keine** unkontrollierte Wix-Abschaltung beim Termin.

**Phase 3 – NACH dem Treffen zuhause:** Mit ChatGPT technische Migration, Datenabgleich, Secrets und Eventtype-IDs umstellen, Tests mit Isens Zugang und den echten Kunden-/Kalenderdaten abschliessen, Produktivschaltung bewusst durchführen, überwachen und Rollback bereithalten. Erst wenn das neue System produktiv nachweislich funktioniert, bestehende Wix-Lösung und kostenpflichtige Verlängerung beenden.

## ABSOLUTE Wix- und Abrechnungsregel
**Wix ist derzeit das Live-Produkt.** Automatische Verlängerung, Hosting, Domain-Verbindung, Kalender und Buchungssystem dürfen nicht vorzeitig deaktiviert, gekündigt, gelöscht, umgeleitet oder beeinträchtigt werden. NICHT EIGENSTÄNDIG kündigen, auch nicht im Hinblick auf die nächste erwartete Zahlung am 30.11.2026. Der Nutzer prüft beziehungsweise veranlasst die Kündigung **erst nach** bestätigtem produktivem Betrieb der neuen Lösung. Ein begrenzter Zeitraum mit Doppelbetrieb und gegebenenfalls einer weiteren Wix-Zahlung ist sicherer als Ausfall oder verlorene Buchungen.

## Zeitliches Ziel
Phase 1 soll nach Wunsch **möglichst vor dem 30.11.2026** fertig sein; Qualität und laufender Livebetrieb haben Vorrang gegenüber dem Datum. Für Phase 2 und 3 keine fiktiven Zeitgarantien geben; tatsächliche Migration hängt von Isens Zugängen, Daten, Kalender und Freigabe ab.

---
## Durchgeführte Nachweise
- Versteckter Cal.com-Lab-Typ **7982460**: Buchung, Umbuchung, Stornierung erfolgreich, Cal.com E-Mails nur an internen `info+…@localboost-zs.ch`-Alias; drei personalisierte Resend-Mails an originale interne Testadresse zugestellt.
- Eigenes Cloudflare Staging `nolimits-alias-staging`; öffentliche Workers.dev- und Preview-URLs nach Tests abgeschaltet.
- Supabase `nl_booking_email_aliases` (nur NoLimits-Projekt) nutzte eindeutige Zuordnung; Testdaten danach gelöscht (0 Zeilen).
- Cal.com Free kann Standard-Teilnehmermails im Einzelkonto nicht über `disableEmailsToAttendees` ausschalten. Interne Cal.com-Mails (Teilnehmeralias + Organizer) sind weiterhin normal; Kunde erhält nur NoLimits-Mail.
- Versenden als `NoLimits Barbershop <noreply@nolimits-barber.ch>` mit Resend an internes Postfach real getestet: `delivered`; diese Absenderadresse ist im **Feature-Branch** umgesetzt, noch nicht produktiv.
- GitHub Regressionstest mit neuer Absenderadresse bestanden; Rollback-/Signaturtests existieren als Mocktests, nicht als kompletter Livebetriebtest.

## Produktive IST-Situation – read-only
- Das öffentliche GitHub-Pages-Buchungsfrontend setzt `assets/js/booking-config.js` auf `https://nolimits-booking-test.broken-haze-6cad.workers.dev`. Trotz Namensbestandteil *test* ist dies das API-Ziel der öffentlichen Buchungsseite.
- Cloudflare-Script `nolimits-booking-test` hat bestehende Secrets und Rate-Limit-Bindings; `worker/wrangler.toml` im Repo verwendet abweichend `nolimits-booking`. Nicht auf Basis dieser Datei unkritisch deployen!
- Cal.com-Konto hat bestehenden Webhook auf `nolimits-booking-test…/api/webhooks/cal`; Staging hat getrennten Hook auf Lab-Typ. Keine doppelten Live-Hooks anlegen.
- Wix-Konto führt eine veröffentlichte, mit `www.nolimits-barber.ch` verbundene NoLimits-Site. Unbedingt tatsächlich öffentliches Domainziel und Buchungs-CTA prüfen, bevor die neue GitHub-Version als live erklärt wird.
- Der Cal.com Testtyp liegt beim Profil `localboost-nolimits-test`; als Kalender wurde `info@localboost-zs.ch` angezeigt. Vor Kundenübergabe organisatorische Kalenderverantwortung, Synchronisation und Benachrichtigungen mit Isen klären.
- **Sender vs. Receiver:** Resend erlaubt versandseitig `noreply@nolimits-barber.ch`, aber dynamische Empfangsadressen `noreply+ID@nolimits-barber.ch` sind noch nicht validiert. Keine bestehenden MX-, DKIM-, SPF- oder Nameserver verändern. `localboost-zs.ch`-Plus-Adressen sind die belegte kostenlose Empfangslösung.

## Technische Freigabereihenfolge
1. Vor Deploy Sicherung erstellen: aktuelle Worker-Konfiguration/Version, `main`-Commit, Cal.com Live-Webhook IDs und aktuellen Frontend-Endpunkt dokumentieren; Rollback-Weg bereit halten.
2. Rate-Limits, CORS, Google-Login, CRM und /api/manage anhand des **tatsächlichen** Worker-Namens `nolimits-booking-test` prüfen.
3. Den geprüften Alias-Code zunächst mit `NL_ALIAS_MODE` **aus** in den bereits aktiven Worker deployen (kein neuer produktiver Worker); vor und nach Deploy bestehende Slots/Booking-Read/CRM/Google-Login vergleichen. Kein Produktivwechsel vor dieser Prüfung.
4. `NL_SUPABASE_SECRET_KEY` als Secret am echten Worker setzen (nur serverseitig). `NL_ALIAS_DOMAIN=localboost-zs.ch`, `NL_ALIAS_PREFIX=info`, `NL_ALIAS_SEPARATOR=+`. Aktuelle Legacy-Buchungen ohne Aliasse müssen normal weiterlaufen.
5. Bei freigegebener Umstellung `NL_ALIAS_MODE=enabled` im Produktivworker setzen; einen einzigen kontrollierten externen End-to-End-Test mit realer eigener Testadresse durchführen. Alle anderen Buchungs- und Rückfallwege prüfen.
6. **Rollback:** Nur `NL_ALIAS_MODE` zurück auf disabled setzen, die Alias-Domain **und die Datenbank-Secretbindung** bis zum Ablauf des letzten bereits gebuchten Alias-Termins behalten. Cal.com-Webhook darf für vorhandene Aliasse nicht abgeschaltet werden.
7. Erst nach Verifikation Domain-CTA auf das passende Ziel legen, Isen schulen, Datenschutz/Retention/Support abnehmen lassen und Kunden freigeben.

## Mit Isen klären (Termin kann vor endgültigem Cutover stattfinden)
- Akzeptanz der mobilen Website, Preis- und Service-Liste, korrekte Dauer und freie Tage, Verknüpfung seines Kalenders statt internem LocalBoost-Testkalender.
- Wann er neue Buchungen und Stornos sehen muss, wer Zugriff auf CRM/Termine braucht, wie er Kundenkontakte erhält und wie Ausfälle behandelt werden.
- Wer Kunden-Resend-Mails absendet/Empfang bei Rückfragen bearbeitet; `noreply@` ist **kein** Antwortpostfach. Für Kundensupport braucht es einen funktionierenden Kontaktkanal.
- Zahlungs-/No-show-/Stornobedingungen, Datenschutzhinweise sowie endgültiger Geschäfts-/Servicevertrag und Preis.
- Ob die Bestätigung eine Kalendereinladung oder einen `.ics`-Download erhalten soll (Cal.com-Einladungen gehen im Aliasmodus an interne Adresse).
- Beabsichtigte Domain-/Buchungsseiten-Umschaltung und gewünschter Go-live-Termin.

**Freigabegrenze:** Ohne Kalendersynchronisation, getesteten Support-/Verwaltungsweg und sicheren Rückfallmechanismus keine unbemerkte Produktivumschaltung.

## Finale Phase-1-Freigabe nach iPhone-Abnahme vom 21.11.2026

- Letzte offene manuelle iPhone-Abnahme vom Auftraggeber ausdrücklich als **PASS** bestätigt. Zuvor automatisierte Responsive-/Konto-/Buchungs-/Mitarbeitertests **PASS**.
- Echtes Home-Server-Restic-Backup `d91b6a3e`: isolierter Supabase-Postgres-Restore ohne Fehler, SHA-256-Dateninhalt bei **42 Tabellen identisch, 0 Abweichungen**; Backup-Alarm erfolgreich ans iPhone zugestellt.
- Nach Mobil-Abnahme nochmals read-only geprüft: LAB-Worker ist öffentlich geschlossen, 0 aktive LAB-Buchungen, GitHub Pages Build `built`, Alias-Backend-PR #3 `draft=true`, Mock-/Browsertests grün.
- **Phase-1-Technikabnahme PASS.** [Besprechung und Agenda mit Isen](NoLimits_Isen_Treffen_Vorbereitung_20261121.md) sind vorbereitet. **Der Assistent hat Isen nicht kontaktiert.**
- **Keine Produktivfreigabe**: Isens Bestandsdaten/Kalender, endgültiger Datenschutz/Support, zweites verschlüsseltes Offsite-Backup, Backup-Retention und sichere Live-Migration sind nach seiner Zustimmung zu organisieren. Wix-Website, Kalender, Domain, DNS, Abo und Live-Worker bleiben unverändert. `NL_ICS_ENABLED=false` wegen nachgewiesener Doppelterminprobleme.

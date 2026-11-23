# NoLimits – Isen-Termin: Freigaben, Einrichtung und Produktionsübergabe

**Stand:** 23.11.2026  
**Projekt:** LocalBoost Zentralschweiz / NoLimits Barbershop  
**Status:** Phase 1 technisch PASS, reale iPhone-Abnahme PASS. Heutiges Treffen dient der Vorführung, Entscheidung, Berechtigung und Vorbereitung der späteren getrennten Produktionsumstellung.

## 0. Vorab kontrollierter IST-Zustand (nur lesend, keine Kundendaten)

- **Wix-Site**: `NoLimits`, Site-ID `3fb15076-a5a8-4016-851f-080bb696ed50`, über die verbundene Wix-App erreichbar, `premium=true`, `published=true`, `domainConnected=true`; veröffentlicht auf https://www.nolimits-barber.ch/ . Wix-Site liegt in demselben Wix-Kontoumfeld wie andere LocalBoost-Sites, die **tatsächliche rechtliche Domaininhaberschaft/DNS-Verwaltung muss bestätigt** werden. Den angezeigten Site-Zugang nicht mit einer rechtlichen Freigabe für Kundendaten verwechseln.
- **Neue Seite**: https://localboostzs.github.io/nolimits/ ; GitHub Pages `source=main:/`, HTTPS erzwungen, `cname=null` (noch keine eigene Domain). Die neue Site kann demonstriert werden, **nicht** als bereits live auf der Wix-Domain bezeichnen.
- **Frontend-Buchungslinks**: `assets/js/config.js` wurde am 23.11.2026 **ausschliesslich auf dem Feature-Branch** so vorbereitet, dass die erlaubten Custom-Domains `www.nolimits-barber.ch` und `nolimits-barber.ch` automatisch `/booking-test/` am Root verwenden und die GitHub-Demo weiterhin `/nolimits/booking-test/` nutzt. Ein host-spoofing-resistenter Offline-Test [PASS](https://github.com/localboostzs/nolimits/actions/runs/45179914511) ist vorhanden. **Noch offen:** echte Links ohne JavaScript in statischen HTML-Dateien, Supabase Auth/SMTP-Vorlagen und Domain-SSL nach dem späteren Cutover. Kein Änderung an `main`/Wix/Domain.
- **Cal.com-Verbindung**: bisheriges Cal.com-Testkonto `localboost-nolimits-test`, Kalenderziel noch `info@localboost-zs.ch` (Google-Kalender). Isens echten Kalender und Konto erst nach persönlicher Einwilligung verbinden. Neun bisherige Test-Event-IDs in `worker/src/services.js` dürfen nicht unbesehen produktiv verwendet werden.
- **Supabase Auth** NoLimits-Projekt `jcctdjjunxmxaphjkrsz`: Google-Login und E-Mail-Anmeldung aktiviert; derzeitige `site_url` ist `https://localboostzs.github.io/nolimits/konto/`, `uri_allow_list` enthält nur dieselbe GitHub-Testadresse. Nach späterer Domainumstellung **Canonical-URL und sichere Auth-Redirects** konfigurieren und testen; Auth-Mailvorlagen enthalten teils GitHub-Testlinks. **Niemals Secrets/Tokens aus dem Dashboard in GitHub oder Meetingnotizen kopieren.**
- **Backend- und Rollout-Sperren**: Alias-Backend nur im offenen **Draft-PR #3**, kein Merge; echtes Worker-Ziel `nolimits-booking-test`, nicht historisches `nolimits-booking`; `NL_ALIAS_MODE=off` als Kandidaten-Standard, `NL_ICS_ENABLED=false`. LAB-Worker öffentlich aus; iCalendar bei echtem Google-Import fehlgeschlagen und darf nicht zugesichert werden.
- **Backup**: echter Restic-Snapshot `d91b6a3e`, isolierter Restore inkl. SHA-256-Inhaltsabgleich von 42 Tabellen, 0 Abweichungen; täglicher Timer und iPhone-ntfy-Alarm PASS. **Offsite-Kopie und Retention fehlen** weiterhin.

## A. Ablauf beim Treffen – Vorführen (keine echte Kundenbuchung)

- [ ] Neue Website auf iPhone zeigen: Design, Leistungen, Preis und Dauer, Kontakt, responsive Darstellung.
- [ ] Kundenbuchung zeigen: Leistung → freie Zeiten → Eingabeformular; **vor dem endgültigen Absenden stoppen**.
- [ ] Kundenkonto zeigen: Google-/E-Mail-Anmeldung und persönliche Profildaten mit dem eigenen Testkonto.
- [ ] Drei Test-E-Mails (Buchung/Umbuchung/Storno) und signierten Verwaltungslink anhand anonymisierter Beispiele zeigen; keine Tokens weitergeben.
- [ ] Interne Mitarbeiter-CRM-Ansicht mit zugelassenem Testkonto zeigen; keinerlei fremde Kundendaten.
- [ ] Offen erklären: Live-Wix läuft weiter; Kalender-ICS und noch nicht konfigurierte Isen-Kalender sind kein beworbenes Produktfeature.

## B. Fragen, Freigaben und Entscheidungen (möglichst heute klären)

- [ ] Gefällt Isen das Design und will er die neue Website so einsetzen? Alle Änderungswünsche konkret notieren.
- [ ] 9 Dienstleistungen: genaue Namen/Preise/Dauer, weitere Leistungen und interne Mitarbeitertypen? Menü/Preislisten verbindlich freigeben.
- [ ] Geschäftszeiten, Wochentage, Pausen, Feiertage, Ferien, Last-Minute-Vorlauf, Puffer und Stornofristen festlegen.
- [ ] Benutzte Kalender (Google/Outlook/Apple/sonstige), Zuständigkeit und Empfang neuer Termine/Stornos klären; einen klaren **Kalender-Owner** festlegen.
- [ ] Ein eigener Cal.com-Eigentümerzugang **unter Isens kontrollierter geschäftlicher E-Mail** erwünscht? Wie erteilt er LocalBoost später begrenzten technischen Zugriff (ohne Passwortteilen)?
- [ ] Wix-Bestand: alle **noch zukünftigen** Buchungen, Kundendatenkategorien, Zahlungen/Abos, Gutscheine und Sonderfälle identifizieren. Zustimmung zur **geschützten Sicherung/Export**, Preview und späteren Übertragung dokumentieren.
- [ ] Wo wird `nolimits-barber.ch` registriert und wer kann DNS ändern? Aktuelle NS-, A-/AAAA-/CNAME-, MX-, SPF-, DKIM-, DMARC-Werte vor einer Änderung gesichert dokumentieren. **Domaintransfer ist zum normalen Hostingwechsel nicht automatisch erforderlich.**
- [ ] Canonical Hostname abstimmen, empfohlen `www.nolimits-barber.ch`; Apex `nolimits-barber.ch` sauber weiterleiten. Nicht vor kontrolliertem Cutover ändern.
- [ ] Rechte: Isen muss Zugriff auf sein eigenes Kunden-/Mitarbeiterkonto und seine Termine bekommen; zusätzliche berechtigte Mitarbeitende auflisten. Keine Rechte ohne Kontoidentitätsprüfung.
- [ ] E-Mail: `noreply@nolimits-barber.ch` bleibt Versandadresse; **antwortfähige Geschäfts-/Supportadresse** festlegen. Wer betreut Kundenfragen, Absagen und Beschwerden? Cal.com-Mails gehen an interne Aliasse.
- [ ] Schriftlich festhalten, wie Buchungs-E-Mails, Datenverarbeitung und Übertragung an Cal.com/Supabase/Resend/Cloudflare funktionieren; Verantwortlichkeiten und endgültiges Impressum/Datenschutz prüfen.
- [ ] Zahlungs-, No-Show-, Einwilligungs- und Stornoregeln mit Isen bestätigen.
- [ ] Wahl treffen: Kunden erhalten vorerst bestätigte **E-Mails ohne ICS**, da automatische Kalenderupdates mit .ics im Realtest Doppeltermine erzeugten.
- [ ] Datum/Zeitfenster für spätere Umstellung und Rückfallzuständigkeit vereinbaren; alte Wix-Buchungen bis zur bestätigten Migration weiterhin bedienen.
- [ ] Zusatzkosten, Domainregistrierung, Supabase/Cal.com-Eigentümerrollen und wer den technischen Betrieb/Support zahlt, vereinbaren.
- [ ] Einverständnis zu einer **verschlüsselten Offsite-Backupkopie und definierten Aufbewahrungs-/Löschfristen** vor echtem Kundendatenbetrieb festhalten.

## C. Nur MIT Isen und MIT ausdrücklicher Freigabe vor Ort einrichten

- [ ] Auf seinem Gerät in sein eigenes Kalenderkonto einloggen (er tippt Credentials selbst).
- [ ] Falls erforderlich: eigenes Cal.com-Individual-Konto unter seiner kontrollierten Geschäftsadresse erstellen und verbinden; Testkonto von LocalBoost **nicht** als endgültigen Kalenderinhaber verwenden.
- [ ] In Cal.com nur die richtige, ihm gehörende Kalenderverbindung und `Destination calendar` auswählen; Termine in beide Richtungen testweise in einem **gesonderten Testkalender** auf Konflikte prüfen. Bei produktiv genutztem Kalender vor Live-Buchung **keine** öffentlichen Cal.com-Eventlinks teilen.
- [ ] Verbindliche Öffnungszeiten und neun Dienstleistungstypen gemeinsam erfassen oder deren Erfassung nach dem Termin autorisieren; für später jede tatsächliche EventType-ID und Dauer dokumentieren (ohne API-Schlüssel).
- [ ] Isens NoLimits-Kundenkonto mit seiner realen eigenen E-Mail und eigenem Login einrichten. Erst nach bestätigter Identität später `owner`-/`staff`-Recht minimal nötig vergeben.
- [ ] Noch offene Wix-Termine **gemeinsam nur ansehen** und für späteren Einmalexport/Abgleich vorbereiten; mit Einverständnis geschützten CSV-Export durchführen, **nicht im öffentlichen GitHub/Chat ablegen und nicht sofort importieren**. Ebenfalls Wix-Kontakte nur mit Einverständnis exportieren und Zweck-/Einwilligungsstatus berücksichtigen.
- [ ] Bei der Domainregistrierung/DNS-Verwaltung mit Isen Identität/Verfügungsrecht/technischen Zugang klären; **nur anschauen oder sichere TXT-Verifizierung mit dokumentierter Erlaubnis**, niemals die A/CNAME/NS/MX produktiv ändern.
- [ ] Einwilligung für LocalBoost als technischen Dienstleister zu Betreuung/Migration/Datenzugriff mit Umfang, Rollen und Zugriffsbeendigung dokumentieren. Zugänge **nie per WhatsApp, Chat oder GitHub** schicken; verifizierte Anbindung/Passwortmanager mit Freigabe nutzen.
- [ ] Falls erwünscht, nur einen gesonderten **Entscheidungszettel** mit den freigegebenen Schritten ausfüllen. Keine stillschweigende Rechts- oder Produktivfreigabe aus einem allgemeinen „Ja, ist gut“ ableiten.

## D. Entscheidungen für späteren technischen Cutover – intern festhalten

| Bereich | Freigabefeld (keine Geheimnisse) |
|---|---|
| Design/Website durch Isen freigegeben | Ja / Nein / Anpassungen: ______ |
| Preise, neun Leistungen und Dauer | Freigegeben / Änderungsbedarf: ______ |
| Öffnungszeiten und Storno-/No-Show-Regeln | ______ |
| Cal.com Eigentümerkonto + Kalenderanbieter | ______ |
| Erlaubnis, Cal-Kalender/9 Eventtypen zu konfigurieren | Ja / Nein |
| Erlaubnis, Wix-Buchungen und Kontakte geschützt zu exportieren | Ja / Nein |
| Erlaubnis, Daten zu migrieren (später nach Preview) | Ja / Nein, Umfang: ______ |
| Isen/Staff-Mitglieder (ohne Login-/Passwortdetails) | Anzahl, Rollen: ______ |
| Domaininhaber/DNS-Verwalter (kein Passwort) | ______ |
| Geplante neue Domain `www.nolimits-barber.ch` | Freigegeben / Alternative: ______ |
| Antwortfähige Support-E-Mail und E-Mail-Absender | ______ |
| Rechtliche Texte/Verantwortliche/Aufbewahrung | ______ |
| Verfügbarkeit für abschliessenden Live-Abnahmetest | ______ |
| Erlaubnis für spätere Domainumschaltung/Produktivdeployment | Nur nach **separatem GO** im benannten Zeitfenster |
| Wix-Abonnement kündigen | **NEIN – nur nach tatsächlich erfolgreichem Livebetrieb** |

## E. Technische Arbeit NACH dem Treffen (ohne erneute Isen-Sitzung, sofern Zugänge und Freigaben vorliegen)

1. Geschützte Wix-CSV-Exporte/Termine deduplizieren, Konflikte und Feiertage prüfen; Migrations-Dry-Run / Preview; erst nach Isens expliziter finaler Importfreigabe echte Datensätze übernehmen.
2. Isens Cal.com-Konto und Kalender integrieren, neun EventType-IDs und alle Regeln korrekt in `worker/src/services.js` übernehmen; Preise/dauer gegen freigegebene Liste.
3. NoLimits-Eigentümeraccount und minimal privilegierte Staff-Rechte, echte Kalenderslots, Statusmail, Storno/Umbuchung und CRM verifizieren. **Keine** echten Kunden für Tests verwenden.
4. Datenschutz, Kontakt-/Supportkanal, E-Mail-Vorlagen, Domain-Cookies, SMTP/Google Auth erlaubte Redirects und originale / aktuelle Buchungslinks kontrollieren. `NL_ICS_ENABLED=false` belassen.
5. GitHub Pages **Custom Domain** und website-interne Linkbasis vorbereiten; das ist eine Root-URL `/booking-test/`, **nicht** `/nolimits/booking-test/`. SSL/DNS-Konflikte und GitHub-Domainverifizierung prüfen; MX/SPF/DKIM/DMARC unverändert belassen.
6. Vor Deployment aktuelle produktive Cloudflare-Worker-Version, GitHub `main` und vollständige Konfiguration inkl. Secret-Namen sichern. Regressions- und Deploy-Dry-Run durchführen. Echtfreigabe für bestehenden Worker `nolimits-booking-test` einholen und zunächst `NL_ALIAS_MODE=off` ausrollen; erst nach kontrolliertem LAB-Verhalten aktivieren und prüfen.
7. Zweite verschlüsselte Offsite-Sicherung inkl. Recovery-Probe und separate tagbewusste Backup-Retention einrichten. Keine unkontrollierten `forget`/`prune`-Vorgänge im gemeinsam genutzten Repository.
8. Wix-Domain-DNS **erst nach dokumentiertem Cutover-GO** ändern; `www` und Apex mit GitHub Pages verbinden, HTTPS, Google-/E-Mail-Login, Booking, Storno/Umbuchung, Staff, 9 Leistungen, Storno- und Fehlermails unmittelbar danach testen. DNS- und Worker-Rollback vorbereiten.
9. Künftige Wix-Buchungen erst nach vollständigem Abgleich und bestätigter NoLimits-Produktivfunktion umleiten; Wix-Abo/Website **nicht vorzeitig kündigen**.

## F. Harte Stop-Kriterien

**Keine produktive Veröffentlichung**, falls unklar: Isens Kalender, offene Wix-Bestandsbuchungen, zugriffsberechtigter Eigentümer, echte EventType-IDs, signierte E-Mail-Verwaltungslinks, Domain-/E-Mail-DNS-Einträge, datenschutzkonforme Verantwortlichkeiten, Support, Rollback, zweites Backup, Terminverwaltung oder Freigabe für echten Livebetrieb.

**Kein** Daten-/Kalenderzugang aus seinem Gerät unkontrolliert an LocalBoost übergeben, **keine** Passwörter/Tokens in Chat oder öffentliches GitHub schreiben.

**Meeting-Ziel:** Isen sagt nicht nur «Ja, sieht gut aus», sondern autorisiert konkret die vorbereitenden Arbeiten und die nötigen Zugriffsintegrationen. Ein **separates endgültiges Go-live-GO** bleibt erforderlich.

**Link zur Testwebsite:** https://localboostzs.github.io/nolimits/

**Quelle:** [NoLimits-Produktf­reigabe](NoLimits_Produktivfreigabe_Isen_20261119.md), [Go-live-/Rollback-Plan](NoLimits_GoLive_Rollback_20261119.md), [Phase-1-Abnahmematrix](NoLimits_Abnahmematrix_20261119.md).

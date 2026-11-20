# NoLimits – Abnahmematrix für vollständige Testsystem-Freigabe

**Stand:** 19.11.2026. **Phase 1** – vor dem Treffen mit Isen. Änderungen nur auf dem Feature-Branch `feature/NoLimits_Aliasbuchung_20261119`. `main`, Wix und laufende Cal.com-Termine nicht verändern.

Statuslegende: **PASS** = ausdrücklich nachgewiesen; **TEILWEISE** = nur Mocktest/Teilkomponente; **OFFEN** = kein kompletter Nachweis; **BLOCKIERT** = benötigt Isens Zugang oder Freigabe, darf deshalb erst in Phase 2/3 erfolgen.

| Bereich | Status | Nachweis / noch zu erledigen |
|---|---|---|
| Isen-Handover-Regeln, kein Kontakt vor Phase-1-Freigabe | PASS | `NoLimits_Produktivfreigabe_Isen_20261119.md` |
| Wix-Live, Abo und automatische Verlängerung unverändert | PASS | Verbindliche Projektregel; keine Kündigungsaktion |
| Unabhängiges Cloudflare-Staging | PASS | `nolimits-alias-staging` + Lab-Typ `7982460`, danach öffentliche URL deaktiviert |
| Secret-Trennung für Staging | PASS | Fünf Cloudflare-Secrets überprüft; Werte nicht exponiert |
| Terminbuchung mit eindeutiger Cal.com-Mailalias-Adresse | PASS | Realer interner End-to-End-Test |
| NoLimits-Bestätigungsmail | PASS | Resend-Status `delivered`, Original-Testadresse |
| NoLimits-Umbuchungs- und Stornierungsmail | PASS | Resend jeweils `delivered` |
| Cal.com-Mails an internen Alias, nicht ursprüngliche Adresse | PASS | Gmail-Header verifiziert |
| `noreply@nolimits-barber.ch` als Versandadresse | PASS | Resend-Test `delivered`; Feature-Branch nutzt Absender |
| E-Mail-Empfang auf `noreply@nolimits-barber.ch` | NICHT ERFORDERLICH | Reiner Versand-Absender; Cal-Aliasse bleiben `info+...@localboost-zs.ch` |
| Cal.com-Webhook signiert / falsche Signatur | TEILWEISE | Reale signierte Webhooks: PASS; ungültige HMAC im Mocktest: PASS; Live-Negativtest offen |
| Alias-Rollback bei `NL_ALIAS_MODE=off` | TEILWEISE | Mocktest PASS, Live-Wechsel mit noch aktivem Alias-Termin offen |
| Kunden-Terminverwaltung (gültiger Link, Storno, Umbuchung) | TEILWEISE | Echte Worker-API: Buchung, URL, Zeiten, Umbuchung, neue URL und Storno PASS; gekapselter Browser-E2E für Umbuchung/Storno/ungültigen Link PASS (Run 44568517415). Browser gegen echten Staging-Worker weiterhin nicht verbunden. |
| Mitarbeiter-CRM: Alias-Auflösung, RLS und Fremdbuchungsfilter | TEILWEISE | Sourcebasierter Mocktest PASS; Nutzer hat echte Mitarbeiteranmeldung und Verwaltungsansicht bestätigt. Echte Alias-Terminliste unter Mitarbeiter-Login noch nicht vollständig abgenommen. |
| Google-Anmeldung, Kundenkonto, Profil speichern | PASS | Nutzer hat Google- und E-Mail-Anmeldung, Mitarbeiteransicht sowie echtes Profilspeichern/Neuladen/Wiederherstellen des Originalnamens als erfolgreich bestätigt (19.11.). Simulierter End-to-End-Browsertest zusätzlich PASS (Run 44569263722). |
| Mobile Website und Browser-Screenshots | TEILWEISE | 15 read-only Seiten-/Viewport-Tests plus simulierte angemeldete Kontoansicht mit kurzen und langen Dienstleistungsnamen, ohne Überlappung; native, vollständig gestylte Dropdowns lassen sich bei 320/390/1366px öffnen. GitHub Actions **PASS** (Run 44546949751). Manuelle Designabnahme der GitHub-Testseite nach dem CSS-Fix noch offen. |
| Liveprodukt und neues Frontend unterscheiden | PASS | Wix auf `www.nolimits-barber.ch`, GitHub-Demoseite auf `localboostzs.github.io/nolimits` |
| Domainmigration mit DNS-/Mail-Rollback | OFFEN | Vorbereitete Route und DNS-Ziel noch abzusichern; niemals Live-DNS vorzeitig ändern |
| Sichere Website-/Worker-Releasepipeline | TEILWEISE | Neue `worker/wrangler.production-candidate.toml` hat das richtige EXISTIERENDE Worker-Ziel `nolimits-booking-test`, Rate-Limits, `NL_ALIAS_MODE=off`, `NL_ICS_ENABLED=false`, Default GitHub-Domain. Wrangler-Dry-Run CI PASS (Run 44645470147). Live-Deploy ausdrücklich noch blockiert. |
| Wix-Kontaktimport mit Beispieldaten/Dubletten, Import-Preview | TEILWEISE | Nutzer hat reale Browser-Vorschau mit Test-CSV verifiziert: 3 geeignete von 4 Zeilen, 1 Dublette, 1 ungültige E-Mail, 0 importiert (19.11.). Einwilligung nicht erteilt; Live-Datenimport nur mit Isen. Automatisierte Node-/Browser-Tests PASS (Run 44565832434). |
| Wix-Terminübernahme inkl. bereits bestehender Buchungen | TEILWEISE | Offline-Dry-Run CLI mit synthetischen Terminen PASS (Run 44568821345), inklusive UTC/Offset, Servicezuordnung, Dubletten, abgesagten Buchungen und Überschneidungen. Wix-Exportfeld-Adapter und vollständige echte Migration erst mit Isens Zustimmung. |
| Kalenderintegration und Kundenkonto mit Isen | BLOCKIERT | Nach Phase-1-Freigabe während Isen-Termin; danach End-to-End mit echten Zugängen |
| Rechtliches: Datenschutz, Aufbewahrung, Kundenhinweise | OFFEN | Vor Isens Produktiv-Freigabe dokumentieren |
| Kalenderdateien und automatische Kalenderupdates | NICHT BESTANDEN – FUNKTION DEAKTIVIERT | Drei NoLimits-E-Mails mit ICS-Anhang zugestellt: **E-Mail-Versand PASS**. Realer Google-Kalender-Test am 20.11.: Beim Umbuchungsimport entsteht ein zweiter Termin; der Stornoimport löscht nur den zweiten; der ursprüngliche bleibt fälschlich stehen. Die realen ICS-Dateien besitzen identische UID und korrekte SEQUENCE 0/1/2. Bis zu erfolgreicher iTIP/iMIP- oder ausdrücklich manueller Alternative: `NL_ICS_ENABLED=false`, keine ICS-Anhänge an Kunden. Siehe `NoLimits_Kalenderimport_Befund_20261120.md`. |
| Monitoring, Fehleralarm, Wiederanlauf, Backup | TEILWEISE | GitHub Actions auf `main` prüft zweimal täglich `/api/health`, 9 öffentliche Leistungen inkl. Preis/Dauer und dass `/api/admin/contacts` ohne Auth HTTP 401 liefert; manueller Monitorlauf PASS (Run 44646445814). E-Mail-/Cal.com-End-to-End und echte Warnzustellung/Backup-Wiederherstellung sind damit NICHT geprüft. |
| Benutzerfreundliche Vorführung für Isen | OFFEN | Website, Buchung, Mails, Demo-Konto; erst zeigen, wenn Phase 1 vollständig PASS/abgegrenzt |

**Gate für Kontakt mit Isen:** Alle Phase-1-Tests müssen mit dokumentierter Evidenz bestanden sein, ausser den explizit und unvermeidlich von Isens Konten abhängigen Phase-2/3-Aktionen. Nicht bestandene Tests werden repariert, nicht stillschweigend als erfolgreich markiert.

**Wix-Gate:** Nicht kündigen, nicht abschalten, keine Auto-Verlängerung ändern, solange das neue Produkt nicht nach Isens Freigabe und produktiver Migration nachweislich läuft.


## UI-Nachbesserung aufgrund manueller Kunden-/Staff-Tests (19.11.2026)
- Benutzerbestätigung: Google-Login, E-Mail-Anmeldelink und Mitarbeiter-Verwaltung funktionieren im bestehenden Testsystem. Screenshot wies Überlappung von `Haarschnitt` und `Gleiche Leistung wieder buchen` auf.
- Fix nur im Feature-Branch: `#nl-last.nl-quick` als Grid mit definierten Zeilen und Abständen, responsive ab 760px; keine Änderungen an Auth, API oder Live-Buchungen.
- Mitarbeiter-Formular: `#nl-admin-service` und `#nl-admin-slot` optisch neu; geöffnetes Popup erhält `appearance: base-select`-Design, falls vom Browser unterstützt, sonst modern gestylter nativer Fallback. Labels `for` korrigiert.
- Testnachweis: [GitHub Actions UI-Audit](https://github.com/localboostzs/nolimits/actions/runs/44546949751) **success**. Simulierter angemeldeter Zustand mit kurzem und langem Servicenamen, 3 Bildschirmgrössen, beide geöffneten Mitarbeiter-Dropdowns. **Keine** echte Anmeldung/Anwenderdaten in CI.
- Bildschirmfotos: [NoLimits_UI_Audit_20261119](https://github.com/localboostzs/nolimits/actions/runs/44546949751/artifacts/14541830489) – GitHub Actions Artifact mit PNGs; 7 Tage verfügbar.
- Weiterer manueller Abnahmeschritt: Nutzer öffnet die aktualisierten GitHub-Testseiten und bestätigt Konto-Kachel sowie geöffnete Dropdowns. Ausschliesslich die drei Frontenddateien `assets/css/account.css`, `konto/index.html`, `verwaltung/index.html` wurden zusätzlich auf GitHub Pages `main` ausgerollt (Commit [4c996fe](https://github.com/localboostzs/nolimits/commit/4c996fe6fa400e796fe572f38b91a83cadf70ce4), Pages-Build `built`). **Kein Alias-Backend, Worker, Wix oder Domainwechsel; PR #3 bleibt DRAFT.**


## Ergänzung: vertiefte Termin-, Profil- und Migrations-Tests (19.11.2026)
- **Echte Staging-API** mit einem internen Testkonto: `POST /api/book` (201), signiertes `GET /api/manage` (200), `GET /api/manage/slots` (200), `POST /api/manage/reschedule` (200), neuer gültiger Management-Link (200), `POST /api/manage/cancel` (200), Cal.com `CANCELLED`. Verwendete Testkontakte intern, keine echte Kundschaft; Datenbank-Alias gezielt gelöscht; staging `workers.dev` wieder deaktiviert.
- Zweiter zeitlich getrennter E-Mail-End-to-End-Test: Cal-Webhook bekam genügend Zeit; sowohl NoLimits-Bestätigung als auch Stornierung von Resend `delivered`, Eingang der beiden Mails in Gmail bestätigt. Der vorherige Versuch ohne Brutto-Webhooks war nicht als bestanden markiert.
- **Browser-Terminverwaltung**: beim ersten Playwright-Test ein echter CSS-Hidden-Fehler gefunden; `assets/css/manage.css` korrigiert. Browserabläufe für Umbuchung, Stornierung und ungültige Links PASS; [GitHub Actions](https://github.com/localboostzs/nolimits/actions/runs/44568517415). Die **zwei** geprüften Management-UI-Dateien wurden separat auf die GitHub-Testseite `main` veröffentlicht ([Commit 8bff768](https://github.com/localboostzs/nolimits/commit/8bff76847b6c32addef9e69ebf2d6bfb24730deb)); keine Änderung an Wix/Produktivworker.
- **Kundenprofil**: Browserseitig simulierte Anmeldung, Profiländerung, Speichern, Neuladen, Weiterführung der zuletzt gebuchten Leistung und Abmeldung PASS. [GitHub Actions](https://github.com/localboostzs/nolimits/actions/runs/44569263722). Echtes Supabase-Schreiben durch den Nutzer ist noch separat zu prüfen.
- **Migration**: [NoLimits_Wix_Migrationsprobe_20261119.md](NoLimits_Wix_Migrationsprobe_20261119.md) für Kontakt-Vorschau und kontrollierten Offline-Terminplan. Erfundene Daten, keine echte Wix-Übertragung.
- **Manuelle iPhone-/Mobile-Abnahme** ausdrücklich erst ganz am Ende von Phase 1, unmittelbar vor dem Treffen mit Isen.

**Wichtige Releasegrenze:** Staging-Worker war jeweils nur kurzzeitig für interne Tests erreichbar und ist wieder deaktiviert. Alias-Backend und Wix-Migration sind weiterhin **nicht produktiv**; der PR bleibt **DRAFT**.

## Ergänzung: Kalenderdateien, Monitoring und Cutover-Plan (19.11.2026)
- [NoLimits_GoLive_Rollback_20261119.md](NoLimits_GoLive_Rollback_20261119.md) enthält den Worker-Deploymentstand, Alias-Rollback-Gates, Wix-Schutz, Belegungsabgleich, Phase-2/3-Schnitt und Monitoring-Checkliste.
- Staging-Worker wurde ausschliesslich auf der Feature-Branch-Pipeline mit **`workers_dev=false`** und `NL_ICS_ENABLED=true` aktualisiert; [GitHub Actions PASS](https://github.com/localboostzs/nolimits/actions/runs/44582493689). Nach dem E2E-Test wurde sein workers.dev-Zugang wieder deaktiviert. Die fünf vorhandenen Cloudflare-Secrets blieben erhalten.
- NoLimits-Kalenderdatei `NoLimits_Termin.ics` bei bestätigtem, umgebuchtem und storniertem LAB-Termin via Resend zugestellt (alle drei `delivered`); Resend-Anhang-Metadaten belegen `text/calendar; charset=utf-8`. Die vorhandenen Mails wurden an interne Plus-Adressen geschickt. **Kalender-App-Import und zuverlässige Verarbeitung von Updates sind noch nicht verifiziert** und dürfen nicht als native Live-Synchronisierung verkauft werden. Für die normale produktive Umgebung ist das Flag nicht aktiviert.
- Die internen LAB-Buchungen sind wieder storniert, zugehörige Test-Aliasse gezielt gelöscht. Der Stage-Zugang bleibt disabled. Es wurden weder echte Wix-Kundendaten noch produktive Worker-Konfigurationen verändert.
- `tools/NoLimits_ReadonlyPreflight_20261119.mjs`: rein lesende API-Abnahme mit strenger Liste von neun öffentlichen Leistungen und Warnung bei Änderungen; [Regression PASS](https://github.com/localboostzs/nolimits/actions/runs/44584132600). Dieser Check ersetzt **keinen** echten E2E-Test gegen Resend/Cal.com/Supabase.


- **Echtes ICS-Umbuchungs-End-to-End (19.11., späterer Test):** `POST /api/book` 201 → `POST /api/manage/reschedule` 200 → `POST /api/manage/cancel` 200. Resend-Mail-Ereignisse für erstellt, umgebucht und storniert jeweils `delivered`, die drei `NoLimits_Termin.ics`-Anhänge und MIME `text/calendar; charset=utf-8` über Resend-Metadaten bestätigt. Cal.com-Endstatus `CANCELLED`; Aliaszuordnung gelöscht; Worker wieder `workers_dev.enabled=false`.
- **Supabase-RLS-Metadaten geprüft:** `nl_booking_email_aliases`, `nl_customer_profiles`, `nl_legacy_contacts` und `nl_staff` besitzen jeweils RLS aktiviert. Für `nl_booking_email_aliases` ist keine permissive `authenticated`- oder `anon`-Policy vorhanden. Datenbestand nach Aufräumen: null Aliaszeilen. Dies ist eine Konfigurationsprüfung und ersetzt keinen vollständigen Penetrationstest.
- **Datenschutz:** [NoLimits_Datenschutz_Abnahmepunkte_20261119.md](NoLimits_Datenschutz_Abnahmepunkte_20261119.md) zeigt Fakten und noch mit Isen zu klärende Angaben wie Resend, Aufbewahrung, Supportkontakt und etwaige Auslandsübermittlungen. Keine eigenmächtige Veröffentlichung einer rechtlichen Zusage.
- **Read-only Releasepreflight** prüft zusätzlich zu neun öffentlichen Service-Schlüsseln deren *exakte* Dauer und CHF-Preise; CI Test für manipulierten Preis PASS ([Actions](https://github.com/localboostzs/nolimits/actions/runs/44584654383)).

- **Wix-Vorschau-Button sichtbar gesperrt**: Der Import-Button trägt `disabled` und erscheint ohne Isens Freigabe jetzt sichtbar ausgegraut statt aktiv goldfarben. Browser-E2E prüft gesperrt/aktiv über 320/390/1366px und Profil-/Verwaltungsregressionen; [CI PASS](https://github.com/localboostzs/nolimits/actions/runs/44586214840). Ausschliesslich die CSS-Datei und der HTML-Cache-Buster wurden auf der GitHub-Testseite veröffentlicht ([Commit c60bf74](https://github.com/localboostzs/nolimits/commit/c60bf740d3489385e3628c55ef724bf812a0af64)). **Keine** Wix-Importaktion ausgelöst.

## Nachtrag 20.11.2026 – reale Google-Kalender-Abnahme
- Nutzer bestätigte den Empfang aller **drei** NoLimits-Test-E-Mails mit `.ics`-Anhang.
- Google Kalender: Beim zweiten manuellen ICS-Import bleibt der alte Termin stehen und ein zweiter entsteht. Der dritte ICS-Stornoimport löscht nur den zweiten; der ursprüngliche falsche Kalendereintrag bleibt vorhanden. **Kein PASS für automatische Kalenderupdates.**
- Die exakt versendeten Resend-Dateien wurden kontrolliert: gleiche UID, `SEQUENCE:0/1/2`, `METHOD:PUBLISH/PUBLISH/CANCEL`. Es handelt sich um einen inkompatiblen/manuell nicht zuverlässig synchronisierenden Workflow, nicht um drei verschiedene Event-IDs.
- **Sicherheitsmassnahme umgesetzt:** Separater Staging-Worker mit `NL_ICS_ENABLED=false` neu ausgerollt; Tests/Deployment-Gate schützen vor versehentlichem Reaktivieren. Live Worker war bereits ohne aktivierte ICS-Funktion. Buchungs-/Umbuchungs-/Stornierungs-E-Mails bleiben unverändert.
- [Ausführlicher Kalender-Befund](NoLimits_Kalenderimport_Befund_20261120.md). Die restlichen echten Funktionsprüfungen und die finale manuelle Mobile-Abnahme bleiben nach den Projekt-Gates offen.

## Nachtrag 20.11.2026 – Release- und Datenschutz-Sicherungen
- **Cal.com-Ablehnungen ohne unnötige Kunden-E-Mail-Speicherung:** Feature-Worker entfernt nie gebundene Aliaszeilen nach eindeutigem HTTP 400/409/422, bewahrt unklare Buchungsfälle nach 500/Timeout bewusst für mögliche Webhooks auf; synthetische Tests **PASS** ([Actions](https://github.com/localboostzs/nolimits/actions/runs/44644577848)). Nicht auf Live-Worker deployed.
- **Domainwechsel:** `NL_PUBLIC_SITE_BASE` erlaubt ausschliesslich GitHub-Demobasis oder die zwei geprüften NoLimits-Hostnamen. Login-/Terminverwaltungslinks in Buchungsantwort, Umbuchung und Resend-Mail folgen dem selben kontrollierten Ziel; bösartige Hostnamen werden abgewiesen. [CI PASS](https://github.com/localboostzs/nolimits/actions/runs/44645470147). Für Isen-Umstellung `NL_PUBLIC_SITE_BASE`, CORS und Domainhosting erst nach Freigabe zusammen konfigurieren.
- **Sicherer Worker-Kandidat:** `worker/wrangler.production-candidate.toml` ist für tatsächlich vorhandenen `nolimits-booking-test` vorbereitet, unverändert mit 5/60 `RL_BOOK` und 60/60 `RL_SLOTS`. Alias/ICS aus, kein Cloudflare-Publish, nur Wrangler-Dry-Run erfolgreich.
- **Betriebsmonitor:** [GitHub Actions](https://github.com/localboostzs/nolimits/actions/runs/44646062053) auf `main` zweimal täglich und manuell, nur GET, bis drei Versuche. Nach Erweiterung um die 401-Prüfung für anonymen Mitarbeiter-CRM-Zugriff auch über GitHub-Runner **PASS** ([CI](https://github.com/localboostzs/nolimits/actions/runs/44646330783)). Keine Kundendaten im Monitoring verarbeitet.
- **Datenbestand:** Supabase `nl_booking_email_aliases`: 0 Zeilen; `nl_legacy_contacts`: 0; `nl_customer_profiles`: 2; `nl_staff`: 1, nur aggregierte Statistik. RLS- und Rollenprüfung ist positiv, aber echte Rollen-/Rechteabnahme des Mitarbeiters in Staging weiterhin erforderlich.
- **Keine manuelle Mobile-Abnahme vorziehen.** Sie bleibt der letzte Schritt von Phase 1; Isen erst danach. Wix-Site und Abo bleiben aktiv.

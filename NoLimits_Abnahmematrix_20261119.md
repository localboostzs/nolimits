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
| Kunden-Terminverwaltung (gültiger Link, Storno, Umbuchung) | TEILWEISE | Mocktests PASS; Staging-Mail verweist noch auf Live-Frontend, isolierter Browser-E2E offen |
| Mitarbeiter-CRM: Alias-Auflösung, RLS und Fremdbuchungsfilter | TEILWEISE | Neuer sourcebasierter Mocktest PASS; reales Mitarbeiter-Login offen |
| Google-Anmeldung, Kundenkonto, Profil speichern | TEILWEISE | Nutzer hat Google- und E-Mail-Anmeldung in der öffentlichen Testseite manuell als funktionierend bestätigt (19.11.). Profiländerung und weitere Kontoabläufe noch nicht umfassend abgenommen; Überlappungsfix ist nur im Feature-Branch. |
| Mobile Website und Browser-Screenshots | TEILWEISE | 15 read-only Seiten-/Viewport-Tests plus simulierte angemeldete Kontoansicht mit kurzen und langen Dienstleistungsnamen, ohne Überlappung; native, vollständig gestylte Dropdowns lassen sich bei 320/390/1366px öffnen. GitHub Actions **PASS** (Run 44546949751). Manuelle Designabnahme der unveröffentlichten Version noch offen. |
| Liveprodukt und neues Frontend unterscheiden | PASS | Wix auf `www.nolimits-barber.ch`, GitHub-Demoseite auf `localboostzs.github.io/nolimits` |
| Domainmigration mit DNS-/Mail-Rollback | OFFEN | Vorbereitete Route und DNS-Ziel noch abzusichern; niemals Live-DNS vorzeitig ändern |
| Sichere Website-/Worker-Releasepipeline | OFFEN | Worker-Namenskonflikt `nolimits-booking` vs `nolimits-booking-test` vor Deploy lösen |
| Wix-Kontaktimport mit Beispieldaten/Dubletten, Import-Preview | OFFEN | CSV-Parsen/Import vorhanden; vollständiger Trockenlauf und Rücknahmeplan fehlen |
| Wix-Terminübernahme inkl. bereits bestehender Buchungen | OFFEN | Technischen Ablauf und Probe ohne echte Daten vorbereiten |
| Kalenderintegration und Kundenkonto mit Isen | BLOCKIERT | Nach Phase-1-Freigabe während Isen-Termin; danach End-to-End mit echten Zugängen |
| Rechtliches: Datenschutz, Aufbewahrung, Kundenhinweise | OFFEN | Vor Isens Produktiv-Freigabe dokumentieren |
| Zustellbarkeit von Kalendereinladung für Kunden | OFFEN | Cal.com-ICS geht an Alias; eigene ICS-Beilage/Download prüfen |
| Monitoring, Fehleralarm, Wiederanlauf, Backup | OFFEN | Vor produktiver Freigabe testen |
| Benutzerfreundliche Vorführung für Isen | OFFEN | Website, Buchung, Mails, Demo-Konto; erst zeigen, wenn Phase 1 vollständig PASS/abgegrenzt |

**Gate für Kontakt mit Isen:** Alle Phase-1-Tests müssen mit dokumentierter Evidenz bestanden sein, ausser den explizit und unvermeidlich von Isens Konten abhängigen Phase-2/3-Aktionen. Nicht bestandene Tests werden repariert, nicht stillschweigend als erfolgreich markiert.

**Wix-Gate:** Nicht kündigen, nicht abschalten, keine Auto-Verlängerung ändern, solange das neue Produkt nicht nach Isens Freigabe und produktiver Migration nachweislich läuft.


## UI-Nachbesserung aufgrund manueller Kunden-/Staff-Tests (19.11.2026)
- Benutzerbestätigung: Google-Login, E-Mail-Anmeldelink und Mitarbeiter-Verwaltung funktionieren im bestehenden Testsystem. Screenshot wies Überlappung von `Haarschnitt` und `Gleiche Leistung wieder buchen` auf.
- Fix nur im Feature-Branch: `#nl-last.nl-quick` als Grid mit definierten Zeilen und Abständen, responsive ab 760px; keine Änderungen an Auth, API oder Live-Buchungen.
- Mitarbeiter-Formular: `#nl-admin-service` und `#nl-admin-slot` optisch neu; geöffnetes Popup erhält `appearance: base-select`-Design, falls vom Browser unterstützt, sonst modern gestylter nativer Fallback. Labels `for` korrigiert.
- Testnachweis: [GitHub Actions UI-Audit](https://github.com/localboostzs/nolimits/actions/runs/44546949751) **success**. Simulierter angemeldeter Zustand mit kurzem und langem Servicenamen, 3 Bildschirmgrössen, beide geöffneten Mitarbeiter-Dropdowns. **Keine** echte Anmeldung/Anwenderdaten in CI.
- Bildschirmfotos: [NoLimits_UI_Audit_20261119](https://github.com/localboostzs/nolimits/actions/runs/44546949751/artifacts/14541830489) – GitHub Actions Artifact mit PNGs; 7 Tage verfügbar.
- Weiterer manueller Abnahmeschritt: Nutzer kontrolliert die Bilder im Artifact; der Feature-Branch bleibt bis zur vollständigen Testfreigabe **unveröffentlicht**.

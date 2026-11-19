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
| Google-Anmeldung, Kundenkonto, Profil speichern | TEILWEISE | Bestehende Integrationstests vorhanden; echte Browser-/OAuth-Prüfung offen |
| Mobile Website und Browser-Screenshots | IN PRÜFUNG | Read-only Playwright: 5 Seiten × 3 Grössen; 320px-Admin-Überlauf erkannt, Feature-Branch-Fix eingereicht |
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

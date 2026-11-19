# NoLimits_Aliasbuchung_StagingDeploy_20261119

## Status (verifiziert am 19.11.2026)
- Zweifache reale Cal.com Testbuchungen auf **verstecktem** Testtermin-Typ **7982460** durchgeführt; beide wurden wieder storniert.
- `emailSettings.disableEmailsToAttendees=true` im persönlichen Free-Konto ist **offiziell per HTTP 400** gesperrt mit Meldung `Disabling standard booking emails requires an organization.` (bei Test-Event-Erstellung; Event wurde mit dieser Einstellung NICHT angelegt).
- Reale Testbuchung mit `info+nolimits-v2-calprobe-20261119@localboost-zs.ch` wurde akzeptiert; Cal.com Bestätigungs- und Stornierungsmails kamen bei verbundenem `info@localboost-zs.ch` Gmail an.
- Reale zweite Testbuchung mit `info+nolimits-v2-resched-20261119@localboost-zs.ch` wurde erstellt, umgebucht und storniert. Alle drei Cal.com-Mails landeten beim **selben** Alias. Umbuchung hat neue UID, aber dieselbe Teilnehmer-E-Mail.
- Supabase NoLimits Projekt `jcctdjjunxmxaphjkrsz`: Migration `nolimits_alias_mapping_20261119` angewandt, eigene Tabelle `nl_booking_email_aliases`, RLS an, keine Policies für `anon` oder `authenticated`. Synthetischer Probe-Datensatz erfolgreich gelesen und wieder gelöscht.
- Staging-Worker-Code in `feature/NoLimits_Aliasbuchung_20261119` hat GitHub Actions-Mocktests bestanden: https://github.com/localboostzs/nolimits/actions/runs/44497571643
- Produktive Cal.com-Terminarten und Cloudflare-Worker unverändert.

## DNS- und Cloudflare-Verbindung (Blocker)
- Neu verbundene Composio-Cloudflare-Verbindung `cloudflare_tenson-ungear` ist ACTIVE, aber `CLOUDFLARE_LIST_ZONES` gibt **0 Zonen** zurück.
- `CLOUDFLARE_LIST_ACCOUNTS` reagiert mit `Invalid format for X-Auth-Key header`. Daher bisher keine sichere Möglichkeit, Account-ID oder bestehende Worker über den Connector zu ermitteln. **Keine** DNS-, MX-, Routing- oder Worker-Veränderung durchgeführt.
- Für die bereits bestätigte Gmail-Plus-Adressierung von `localboost-zs.ch` sind **keine** neuen MX/DNS-Routing-Regeln notwendig. Hierfür zuerst Staging betreiben, später NoLimits-Domain gesondert umstellen.
- `nolimits-barber.ch` ist aktuell für die verbundene Cloudflare-API nicht als Zone sichtbar; bitte selbst prüfen, ob die Domain überhaupt Cloudflare-DNS verwendet. Nicht die bestehenden MX-Einstellungen von `localboost-zs.ch` austauschen!

## In diesem Branch vorbereitete Staging-Konfiguration
- `worker/wrangler.alias-staging.toml`: **neuer Worker** `nolimits-alias-staging`, explizit getrennt von `nolimits-booking` und `nolimits-booking-test`; verwendet Testdomain `localboost-zs.ch`, Alias `info+<32hex>@localboost-zs.ch`.
- `.github/workflows/NoLimits_Aliasbuchung_Deploy_20261119.yml`: Nur manuell und **nur** auf Alias-Feature-Branch ausführbar, deployt ausschliesslich den obigen Worker. Erfordert GitHub-Action-Repository-Secrets `NOLIMITS_STAGING_CF_API_TOKEN` und `NOLIMITS_STAGING_CF_ACCOUNT_ID`. Erzeugt selbst keine Secret Values.
- Cloudflare zusätzliche Worker-Secrets `CAL_API_KEY`, `CAL_WEBHOOK_SECRET`, `NL_MANAGE_SECRET`, `RESEND_API_KEY`, `NL_SUPABASE_SECRET_KEY` (und für CRM, Login optionale `NL_SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`).
- Staging Worker `ALLOWED_ORIGINS=https://localboostzs.github.io`. Zur manuellen Testbuchung vor Live-Website-Änderung: Testanfrage mit Testaccount; nie echte Kundenbuchungen zu Staging umleiten.
- **VORSICHT:** Der Staging-Worker verwendet dieselben Event-Type-IDs wie NoLimits Live. Jede echte Buchung auf Staging bucht damit im produktiven Cal.com-Kalender. Vor echten Integrationstests separate Testtypen/Services oder bewusst reservierte isolierte Testfenster sowie sichere Rückgängigmachung vorsehen.
- Live-Cal.com-Webhook bleibt bestehen. Für echte End-to-End-Tests Staging-Hook mit Signatur auf separater Test-Terminart konfigurieren. Keine produktiven Webhooks austauschen oder duplizieren.

## Was der Nutzer später noch bereitstellen muss
1. **Cloudflare-Account-ID (kein Geheimnis)**: Dashboard → Workers & Pages → Übersicht → Account ID (32 Hex-Zeichen). Quelle: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
2. Weil der Composio-Cloudflare-Connector die Account-ID nicht selbst listet, zunächst **nur Account-ID im Chat nennen**, ohne Token.
3. Falls Deployment per Composio trotz Account-ID nicht klappt: die zwei genannten GitHub Actions Secrets direkt über die GitHub Weboberfläche eingeben; dann manuell Workflow starten.
4. Worker-Secrets im Cloudflare-Dashboard setzen; Wert der bereits bestehenden Live-Secrets lässt sich i. d. R. nicht aus Cloudflare auslesen; Werte aus dem Passwortmanager bzw. den jeweiligen Anbietern verwenden. Token niemals in Chat oder GitHub-Code eintragen.
5. `nolimits-barber.ch` Domain/DNS und Postfachempfang später getrennt prüfen, erst dann Alias-Domain umstellen.

## Regression und Sicherheit vor Produktivfreigabe
- Cal.com akzeptiert die gültige Plus-Adresse und sendet eigene Bestätigungs-/Umbuchungs-/Stornomails an das **interne Postfach**. Das ist real bestätigt.
- Next: LIVE Worker Integration mit Supabase Mapping, Resend Webhook, CRM, Login, RLS unter staging verifizieren.
- Kein automatischer Versand von Cal.com zu realen Kundenadressen bei Alias-Mode; nur unsere Branded-Resend-Mails.
- Kein Deployment des Feature-Branches zu GitHub Pages oder Live-Cloudflare-Worker, bevor Testprotokoll vollständig ist.
- Zusätzlich prüfen: Teilnehmerantworten, Kalender-Einladungen, E-Mail-Verifizierung, Cal.com-Kompatibilität bei späteren Updates, Datenschutzhinweise und eventuelle Cal.com-Nutzungsbedingungen.
- Rollback darf aktive Aliasse nicht verwaisen lassen: in Cloudflare `NL_ALIAS_MODE` deaktivieren, aber `NL_ALIAS_DOMAIN` und Datenbankzugriff **für bereits getätigte Alias-Buchungen** bis nach letztem Termin erhalten.

## Protokoll der Cal.com Test-Buchungen
- Testtermin-Typ: `7982460` (hidden).
- 1. Buchung `pHbn2H1M51s472oWFiee3j`, storniert.
- 2. Buchung `mAFbQvN5HerRD5WHM4CcfS`, auf `by8dPBqZ4BcB9eyNA1gjMZ` umgebucht, neue Buchung storniert.
- Nur interne Testpostfächer; keine externen Kunden kontaktiert.

## Quellen
- https://developers.cloudflare.com/changelog/post/2025-07-21-subaddressing/
- https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

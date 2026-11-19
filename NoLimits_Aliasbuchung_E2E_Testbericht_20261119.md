# NoLimits – Aliasbuchung E2E-Testbericht

**Datum:** 19.11.2026 (Europe/Zurich)  
**Status:** Staging durchgetestet; noch **keine Produktivfreigabe**.  
**Branch:** `feature/NoLimits_Aliasbuchung_20261119` / PR #3.  
**Testkomponenten:** isolierter Cloudflare Worker `nolimits-alias-staging`, versteckter Cal.com-Typ `7982460`, separates Supabase-Projekt NoLimits, Resend, internes Gmail.

## Ergebnisse – tatsächlich geprüft

| Prüfschritt | Ergebnis | Beleg/Prüfart |
|---|---|---|
| Staging-Worker /api/health | PASS, HTTP 200 | HTTP-Abfrage |
| /api/slots, Cal.com | PASS, HTTP 200 | Zeitfenster für versteckten Testtyp zurückgegeben |
| Buchung mit fremder Domain | PASS, HTTP 403 | `staging_test_email_only` vor Cal.com |
| Testbuchung via Staging /api/book | PASS, HTTP 201 | Cal.com akzeptierte Lab-Typ 7982460 |
| Cal.com erhält nur internen Plus-Alias | PASS | Cal.com-Buchungsdetails geprüft |
| Alias-Zuordnung zur tatsächlichen internen Testadresse | PASS | Supabase Mapping-Select, UID korrekt |
| Cal.com-Buchungsmail | PASS | Gmail-Empfänger war der generierte interne Plus-Alias |
| Personalisierte Bestätigung | PASS | Resend `delivered`, intern adressiert |
| Umbuchung auf 24.11. 18:30 Uhr MEZ | PASS | Neue Cal UID; gleicher Alias |
| Personalisierte Umbuchungsmail | PASS | Resend `delivered`, intern adressiert |
| Cal.com-Umbuchungsmail | PASS | Gmail-Empfänger weiterhin interner Alias |
| Stornierung | PASS | Cal.com `CANCELLED` |
| Personalisierte Stornierungsmail | PASS | Resend `delivered`, intern adressiert |
| Cal.com-Stornierungsmail | PASS | Gmail-Empfänger weiterhin interner Alias |
| Testbereinigung | PASS | Buchung storniert; synthetischer Alias-Datensatz gezielt entfernt; DB danach 0 Alias-Zeilen |
| Live-Kundenbuchungen | NICHT VERÄNDERT | Keine produktiven Cal.com-Typen oder Live-Worker editiert |

**Sicherheitsnotiz:** Bei der öffentlichen Staging-API genügt für einen Buchungsversuch derzeit eine syntaktisch gültige Adresse auf `@localboost-zs.ch`. Vor dauerhaftem öffentlichen Staging-Betrieb sollte zusätzlicher Zugriffsschutz (z. B. Cloudflare Access oder ein separates Test-Geheimnis) eingeführt oder die öffentliche `workers.dev`-Route nach Abschluss der Tests abgeschaltet werden.

**Datensparsamkeit:** Keine Secret-Werte, temporären Management-Tokens, vollständigen Test-UIDs oder dynamischen Alias-Adressen in diesem öffentlichen Repository dokumentiert.

## Was noch nicht als bestanden gelten darf

- Expliziter Negativtest für ungültige Cal-Webhook-HMAC-Signatur (ausgehende E-Mails über den realen signierten Webhook funktionierten).
- Vollständiges Durchtesten des vom Kunden tatsächlich verwendeten Verwaltungslinks, des CRM und der Google-Anmeldung gegen einen korrekt verbundenen Staging-Frontend-Stand.
- Rückfall von `NL_ALIAS_MODE=enabled` nach `disabled` für noch laufende Alias-Termine inklusive Webhook-Auflösung.
- Prüfung der echten NoLimits-Domain `nolimits-barber.ch` auf dynamische Zustellbarkeit. Die geprüfte Variante benutzt `info+<eindeutig>@localboost-zs.ch`.
- Datenschutz-/Aufbewahrungs- und allfällige Cal.com-Richtlinien vor Produktivumstellung.
- Sichere schrittweise Umstellung der Live-Terminarten und Webhooks ohne Doppelzustellung.

## Freigaberegel

**PR weiterhin DRAFT. Nicht mergen und keine produktiven Cal.com-Terminarten oder Cloudflare-Worker verändern, bevor die verbleibenden Punkte geprüft und ein Rollback dokumentiert sind.**

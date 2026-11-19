# NoLimits – Alias-Buchungstest (19.11.2026)

**Status: Code vorbereitet, NICHT live.** Branch: `feature/NoLimits_Aliasbuchung_20261119`.

## Ziel und bewusste Einschränkung
Das persönliche Cal.com-Free-Konto kann Standard-Kundenmails nicht offiziell abschalten (`canDisableStandardEmails: false`).
Diese Variante ersetzt die Teilnehmer-E-Mail in Cal.com durch einen **eindeutigen, von uns kontrollierten E-Mail-Alias**. Die echte Kundenadresse liegt nur in der gesperrten Supabase-Zuordnung und wird für die bestehenden Resend-Mails benutzt. Das ist **kein** Cal.com-E-Mail-Off-Switch. Vor Freigabe Nutzungsbedingungen, Zustellbarkeit und Nebenwirkungen bewerten.

## Implementiert im Staging-Code
- Standard `NL_ALIAS_MODE` fehlt => normales Verhalten (bestehender Livebetrieb unverändert).
- Bei `NL_ALIAS_MODE=enabled` erzeugt der Worker vor der Buchung eine einzigartige Alias-Adresse und speichert eine sichere Zuordnung in `nl_booking_email_aliases`. Fehler beim Speichern verhindern eine Cal.com-Buchung.
- Beim Cal.com-Webhooksignatur-geprüften Mailversand wird die Originaladresse aus der Datenbank nachgeschlagen. Ohne Mapping geht keine NoLimits-Mail an den Alias raus.
- Kunden-CRM ordnet Cal.com-Buchungen mit Alias nach dem Nachschlagen wieder der tatsächlichen E-Mail zu.
- Umbuchung erzeugt gegebenenfalls eine neue UID; das Mapping funktioniert weiter über die stabile Alias-Adresse.
- Der Cloudflare-Worker bleibt für Cal.com-APIs, Webhook-Signatur, Verwaltungstoken und Resend zuständig.

## Noch erforderlich vor einem Live-Test
1. Einen tatsächlichen **Empfangsweg für dynamische Alias-Adressen** nachweisen: bevorzugt getrennte Subdomain mit Catch-all, sofern Cloudflare Email Routing die Maildomain verwaltet; alternativ bei einem echten Postfach die Plus-Adressierung nachweislich testen. **Keine unzustellbaren oder erfundenen Absender-/Empfängeradressen verwenden.**
2. Cloudflare-Verbindung prüfen und erneuern: Composio-Tool `CLOUDFLARE_LIST_ZONES` meldete am 19.11.2026 HTTP 403 / code 9109 (ungültiger Token). Keine Cloudflare-DNS-, Routing- oder Worker-Einstellungen wurden geändert.
3. Isolierte Testinstanz des Cloudflare Workers bereitstellen (eigener Name / eigene URL; bestehendes `nolimits-booking` bzw. `nolimits-booking-test` nicht überschreiben).
4. Migration `supabase/migrations/NoLimits_AliasMapping_20261119.sql` nur im NoLimits-Supabase-Projekt anwenden. Tabelle enthält reale Kundenadressen: Datenschutz, Aufbewahrung, DSG müssen für den Produktivbetrieb definiert sein.
5. Neues Cloudflare-**Secret** `NL_SUPABASE_SECRET_KEY` setzen (bevorzugt `sb_secret_...`; niemals in GitHub oder Client-JS; nicht `sb_publishable_`). `NL_SUPABASE_URL` wird im bestehenden System bereits verwendet.
6. Staging-Variablen `NL_ALIAS_MODE=enabled`, `NL_ALIAS_DOMAIN=...`, `NL_ALIAS_PREFIX=buchung`, `NL_ALIAS_SEPARATOR=-` oder `+` passend zum nachweislich funktionierenden Empfang. **Zuerst E-Mail-Zustellung testen**, erst dann Buchungen.
7. Cal.com-Test-Event-Typ + eigene Webhook-Adresse für den Staging-Worker anlegen oder anderweitig dedizierten Webhook konfigurieren. Die bestehenden Live-Webhooks nicht ersetzen oder duplizieren, solange die Zustellung nicht eindeutig ist.
8. Buchung mit zwei Testpostfächern, Umbuchung, Stornierung, Kunde-CRM, Google-Login, Kalendereinträge, Resend-HTML und fehlende Mapping-Fälle testen.
9. Cal.com versendet weiterhin E-Mails, aber an den Alias. Es muss geklärt werden, ob Kalendereinladungen oder die Kommunikation des Barbershops dadurch fehlen. Bei zweifelhaftem Ergebnis nicht produktiv schalten.
10. `NL_ALIAS_MODE=enabled` nur nach dokumentiertem Test und Sicherung der Support-/Rückfall-Prozesse auf dem Liveworker setzen. **Das Abschalten dieses Schalters muss die Alias-Auflösung für bereits bestehende Buchungen weiter aktiv lassen** (`NL_ALIAS_DOMAIN` + DB Secret nicht löschen).

## Cloudflare / Mailhosting
`buchung@nolimits-barber.ch` ist die gewünschte allgemeine Adresse, aber für die technischen Aliasse werden eindeutige Adressen wie `buchung-<32 hex>@nolimits-barber.ch` benötigt. Eine einzelne Regel für `buchung@` empfängt die dynamischen Varianten nicht automatisch; nötig ist Catch-all oder ein nachweislich Plus-fähiger Mailserver. Für root-domains mit bestehenden MX-Einträgen den E-Mail-Empfang **nicht** unbesehen auf Cloudflare umstellen. Subdomain mit eigenen MX-Regeln ist sicherer.

## Quelle
- Cloudflare: https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/
- Supabase Secret API key: https://supabase.com/docs/guides/getting-started/api-keys
- Cal.com Standardmail-Funktion: https://github.com/calcom/cal.diy/issues/25280

## Rückfall
Bei fehlgeschlagenen Tests nichts deployen. Branch verwerfen. Die Migration kann ungenutzt bleiben. Falls später live: nach Rollback weiterhin alte Aliasse entschlüsseln/auflösen können, bis alle Termine abgeschlossen sind.

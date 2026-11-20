# NoLimits – RLS- und Rollenprüfung ohne Datensatzänderungen

**Datum:** 20.11.2026  
**Supabase-Projekt:** `jcctdjjunxmxaphjkrsz` (NoLimits; nicht das LocalBoost-Haupt-CRM)  
**Prüfprinzip:** Alle Abfragen mit `BEGIN READ ONLY; ... ROLLBACK;`. Per `SET LOCAL ROLE authenticated` und `request.jwt.claim.sub` werden vorhandene Berechtigungen simuliert. Es werden nur aggregierte Anzahlen ausgegeben, keine Namen, E-Mail-Adressen, Zugangstoken oder Benutzer-IDs.

## Direkt nachgewiesene Ergebnisse

| Rolle / Identität | Sichtbare Profile | Sichtbare Wix-Altkontakte | Sichtbare Mitarbeiter |
|---|---:|---:|---:|
| Fremde, nicht registrierte UID unter `authenticated` | 0 | 0 | 0 |
| Vorhandenes normales Kundenkonto unter `authenticated` | 1 (nur eigenes) | 0 | 0 |
| Vorhandenes aktives Mitarbeiterkonto unter `authenticated` | 2 | 0 | 1 (nur eigener Eintrag) |

Diese Anzahlen entsprechen dem **aktuellen Testdatenbestand**: 2 Kundenprofile, 1 aktives Mitarbeiterkonto, 0 importierte Wix-Altkontakte, 0 Aliaszuordnungen. Bei späteren Datenimporten werden die Zahlen wachsen und dürfen nicht als dauerhaft fixierte Anzahlen interpretiert werden.

## Zusätzliche Datenbankkontrollen

- RLS ist auf `nl_customer_profiles`, `nl_staff`, `nl_legacy_contacts` und `nl_booking_email_aliases` aktiv.
- `nl_booking_email_aliases`: `anon` und `authenticated` besitzen **keine** SELECT- oder INSERT-Tabellenprivilegien. Keine permissiven RLS-Policies für reguläre Nutzer. Der ausschließlich serverseitige Worker-Schlüssel dient den benötigten Alias-Zuordnungen.
- Kundenprofile: `SELECT`, `INSERT` und `UPDATE` der eigenen Zeile richten sich nach `auth.uid() = user_id`, `UPDATE` zusätzlich durch `WITH CHECK` abgesichert. Berechtigte Mitarbeitende dürfen Kundenprofile lesen.
- Mitarbeiterliste: Nur die eigene `nl_staff`-Zeile ist sichtbar; kein öffentliches Personalverzeichnis.
- Wix-Legacy-Kontakte: Vorhandene RLS-Policies verlangen eine aktive Mitarbeiterzeile; ein normaler Kunde sieht keine Daten.
- Cloudflare-Worker-Test `/api/admin/contacts` ohne Bearer-Token muss HTTP 401 ergeben, bereits auch über GitHub Actions validiert.

## Nachvollziehbares Testverfahren

Fremder Besucher (keine Datenänderung):
```sql
BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
SET LOCAL ROLE authenticated;
SELECT
 (SELECT count(*) FROM public.nl_customer_profiles) AS profiles,
 (SELECT count(*) FROM public.nl_legacy_contacts) AS legacy,
 (SELECT count(*) FROM public.nl_staff) AS staff;
ROLLBACK;
```

Reales, aktives Mitarbeiterkonto (nur aggregierte Zahlen; Benutzer-ID wird nicht ausgegeben):
```sql
BEGIN READ ONLY;
SELECT set_config('request.jwt.claim.sub',
 (SELECT user_id::text FROM public.nl_staff WHERE active = true LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT
 (SELECT count(*) FROM public.nl_customer_profiles) AS profiles,
 (SELECT count(*) FROM public.nl_legacy_contacts) AS legacy,
 (SELECT count(*) FROM public.nl_staff) AS staff;
ROLLBACK;
```

**Interpretation:** Diese SQL-Simulation prüft RLS und Tabellenrechte direkt in PostgreSQL. Sie beweist nicht die tatsächliche Gültigkeit eines Browser-JWT. Die reale Mitarbeiter-HTTP-API wird daher separat über [NoLimits_StaffLab_Testanleitung_20261120.md](NoLimits_StaffLab_Testanleitung_20261120.md) abgenommen.

**Offizielle Referenz:** https://supabase.com/docs/guides/database/postgres/testing-row-level-security

## Nicht freigegeben

Keine Änderung der RLS-Policies, kein Export von Kundeninformationen, keine Freigabe von Alias-Zuordnungen, keine produktiven Wix-Importe. Der Supabase-Sicherheitsadvisor meldet aktuell einen **nicht aktivierten Schutz gegen geleakte Passwörter**; bei passwortloser Anmeldung ist dieser Hinweis gesondert zu bewerten und keine Begründung für ungetestete Auth-Änderungen.

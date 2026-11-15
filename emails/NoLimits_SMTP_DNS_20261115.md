# Status – 15.11.2026: Resend-Versand getestet, Supabase-Integration noch offen

- Domain nolimits-barber.ch in Resend: partially_verified.
- DKIM, SPF, MX sind verifiziert. CNAME rsend noch pending.
- Die aktuelle DNS-Abfrage von rsend.nolimits-barber.ch ergab NXDOMAIN.
  Wix CNAME prüfen: Host rsend, Wert send.forge.rmta.net.
- Resend hat eine NoLimits-Testmail an info@localboost-zs.ch ausgeliefert
  (Resend-Ereignis delivered).
- Supabase SMTP ist noch nicht aktiv (aktuell Standardmail).
- Technischer Blocker: Composio-Supabase-Aktion sendet SMTP-Port als Zahl,
  während Supabase Management API einen String erwartet.
- Ein für diesen Test neu erstellter unbenutzter Resend-Schlüssel wurde
  gelöscht; vorhandener Schlüssel NoLimits Website bleibt erhalten.

## Nächster Schritt – native Integration
1. https://supabase.com/partners/catalog/resend öffnen.
2. Add integration anklicken.
3. Projekt NoLimits Barbershop und bestehendes Resend-Konto auswählen.
4. Versanddomain nolimits-barber.ch zuordnen und Einrichtung bestätigen.
5. Im NoLimits-Projekt unter Authentication / SMTP Settings prüfen:
   Host smtp.resend.com, Port 465, Benutzer resend,
   Sender NoLimits Barbershop, Adresse login@nolimits-barber.ch.
6. Anschliessend Auth Email Templates Confirm signup + Magic Link
   im Supabase-Dashboard mit den HTML-Vorlagen aus dem Repo befüllen.
7. Eine E-Mail-Anmeldung auf der NoLimits-Testwebsite prüfen.

Bis dahin bleibt der bisherige Supabase-Testmailer unverändert. Wegen
zweier E-Mails pro Stunde keine unnötigen wiederholten Tests auslösen.
Die Registrierung wird erst nach echtem SMTP-/Design-/Link-Test beworben.

---

# NoLimits – Wix DNS & Resend SMTP
Stand: 15.11.2026

## Jetzt bereits erledigt
- Resend ist über Composio verbunden.
- NoLimits-Versanddomain im Resend-Konto angelegt: nolimits-barber.ch.
- Region: EU (Irland), Domain-ID: b0ea89b9-bad9-4076-809d-ad9c3a4442c3.
- Resend-Status aktuell: not_started (DNS-Verifizierung ausstehend).
- Öffentlich bestätigte Nameserver: ns0.wixdns.net und ns1.wixdns.net.
- Es wurde noch kein SMTP-Passwort in Supabase gesetzt, damit der bestehende Login weiter funktioniert.
- E-Mail-Vorlagen sind bereits auf GitHub vorbereitet.

## Der einzige vorerst notwendige manuelle Schritt: DNS bei Wix

1. Isens Freigabe für das Hinzufügen der E-Mail-DNS-Einträge einholen.
2. Mit dem Domaininhaber unter https://manage.wix.com/account/domains anmelden.
3. Bei nolimits-barber.ch das Menü Domain-Aktionen > DNS-Einträge verwalten öffnen.
4. Die folgenden vier Einträge im entsprechenden DNS-Typ ergänzen.
5. In der Wix-Spalte Hostname nur den relativen Namen angeben; Wix hängt die Hauptdomain normalerweise automatisch an.
6. Jeden Eintrag speichern und Änderungen in der Bestätigung übernehmen.
7. NICHT die Nameserver, A-/www-Einträge oder Root-MX verändern. Wix bleibt weiterhin live.

### Exakte von Resend erzeugte DNS-Einträge (Wix)

| Typ | Hostname | Wert / Ziel | Priorität |
|---|---|---|---|
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCnkm1UgxRGz5gVlNboaIXSgkwBUKzmtsGWGWE6Uw0wjT8NcuKijZeJoy1xbtcPPHqWcWPCvrBgOSsYuTpBVs8k0y4UPBh1Km89Xs7rXkO9ccwfirlN3pHG/dHF+RKajBr/nUAEPnlM0S2PUqLsjDFcRj1fTlJ8oAJQiuUFnNYfkwIDAQAB | – |
| MX | send | feedback-smtp.eu-west-1.amazonses.com | 10 |
| TXT | send | v=spf1 include:amazonses.com ~all | – |
| CNAME | rsend | send.forge.rmta.net | – |

TTL für alle Einträge: Auto/Standard. Der DKIM-Wert unter resend._domainkey
muss vollständig und ohne Auslassung übernommen werden. Der SPF-TXT-Wert
unter send beginnt mit v=spf1.

WICHTIG: Der MX-Eintrag unter send ist ein Subdomain-MX. Die Wix-Maske
MX-Einträge bearbeiten erlaubt unter Umständen nur die Root-Domain. Falls
du nicht ausdrücklich den Hostnamen send eintragen kannst, NICHT den
bestehenden Root-MX überschreiben. Stattdessen abbrechen und Rückmeldung
geben. Die übrigen TXT/CNAME-Einträge können unabhängig davon angelegt werden.

## Nach den DNS-Änderungen
1. Unter https://resend.com/domains die Domain nolimits-barber.ch öffnen
   und auf Verify/Verify DNS Records klicken.
2. Wenn der Status Verified lautet, ChatGPT schreiben:
   'NoLimits DNS bei Wix gesetzt und Resend verifiziert – weiter'.
3. Ich prüfe dann per verbundenem Resend-Konto die Domain, erstelle
   einen eingeschränkten SMTP-API-Key und hinterlege ihn sicher in
   Supabase (ohne Veröffentlichung in GitHub).
4. Gewünschte Supabase-Werte: Host smtp.resend.com, Port 465,
   Benutzer resend, Absendername NoLimits Barbershop,
   Absenderadresse login@nolimits-barber.ch.
5. Danach lassen sich Betreff/Design der vorhandenen E-Mail-Vorlagen
   im Supabase-Dashboard bearbeiten: Confirmation und Magic Link.
6. Abschliessend echte Login-Mail mit einer Testadresse auslösen,
   Absender/Design/Zustellung prüfen und den Kundenlogin freigeben.

HINWEIS: Ein SMTP-Versanddienst erzeugt kein Postfach für eingehende
Mails an login@nolimits-barber.ch. Ein Resend-Konto sollte nach
Möglichkeit Isens Kontrolle unterliegen.
Die Sicherheitswartefrist zwischen mehreren Logins bleibt aktiv.

## Quellen
- Wix DNS: https://support.wix.com/de/article/dns-eintr%C3%A4ge-in-deinem-konto-bei-wix-verwalten
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Resend: https://resend.com/domains
- Supabase E-Mail-Vorlagen: https://supabase.com/dashboard/project/jcctdjjunxmxaphjkrsz/auth/templates
- NoLimits Supabase SMTP: https://supabase.com/dashboard/project/jcctdjjunxmxaphjkrsz/auth/smtp

## Andere noch offene Aufgaben
- Mitarbeiter-API 503 Auth-Fehler: GitHub Issue #1.
- Cal.com/Google Calendar und Wix-Datenübernahme nur mit Isens
  ausdrücklicher Freigabe.
- Keine Domainumschaltung vor erfolgreicher Terminmigration.

# Statusupdate 15.11.2026

Resend ist verbunden und die Domain angelegt. Exakte DNS-Einträge und Wix-Schritte sind in NoLimits_SMTP_DNS_20261115.md dokumentiert.

---

# NoLimits – Auth-E-Mail und SMTP (Stand 15.11.2026)

## Status
- Kundenlogin und die Supabase-Tabellen funktionieren auf der Testwebsite.
- Die schwarz-goldenen NoLimits-Vorlagen sind vorbereitet und in GitHub gespeichert.
- Supabase Auth versendet derzeit noch mit Standard-Absender. Das ist für
  echte Kunden NICHT produktionsbereit.
- Resend ist nun in Composio verbunden; DNS-Verifizierung steht noch aus. Ein eigener SMTP-Dienst
  und die Verifizierung der NoLimits-Absenderdomain fehlen.
- Die verfügbaren Supabase-Connector-Aktionen können SMTP-Felder ändern,
  aber nicht die HTML-Template-Felder. Vorlagen müssen vorerst einmalig im
  Supabase-Dashboard hinterlegt werden. Nichts wurde ungeprüft überschrieben.

## Schritt A: Sofort – beiden E-Mail-Vorlagen übernehmen
1. Im Browser https://supabase.com/dashboard/project/jcctdjjunxmxaphjkrsz öffnen.
2. Authentication > Email Templates (unter Notifications > Email, eventuell
   im Dropdown "Templates"). Supabase ändert die Navigation gelegentlich.
   Direkte URL:
   https://supabase.com/dashboard/project/jcctdjjunxmxaphjkrsz/auth/templates
3. Vorlage "Confirm signup" öffnen.
   Betreff: Dein NoLimits-Konto bestätigen
   HTML-Inhalt: ganze Datei NoLimits_Email_Registrierung_20261115.html kopieren.
   Die Variable {{ .ConfirmationURL }} muss UNVERÄNDERT erhalten bleiben.
   Speichern.
4. Vorlage "Magic Link" öffnen.
   Betreff: Dein Anmeldelink – NoLimits Barbershop
   HTML-Inhalt: ganze Datei NoLimits_Email_Anmeldung_20261115.html kopieren.
   {{ .ConfirmationURL }} muss UNVERÄNDERT erhalten bleiben.
   Speichern.
5. NICHT den Anmelde-URL überschreiben. Die Weiterleitung ist bereits auf
   https://localboostzs.github.io/nolimits/konto/ eingestellt.
6. Einmalige Test-E-Mail senden und den Link öffnen. Er sollte wieder
   in dein Kundenkonto führen, ohne ein neues Passwort zu verlangen.

## Schritt B: Erst nach Isens Freigabe – eigener Absender
1. Isens Zustimmung und Zugang zur DNS-Verwaltung der Domain
   nolimits-barber.ch sichern. Vorher bestehende Domain NICHT umstellen.
2. Idealerweise Resend-Konto mit Isens geschäftlicher E-Mail erstellen;
   Besitz und laufende Rechnung bleiben damit bei ihm.
   https://resend.com/domains
3. Domain nolimits-barber.ch hinzufügen.
4. In der DNS-Verwaltung NUR die bei Resend tatsächlich angezeigten
   Verifizierungs-/SPF-/DKIM-Datensätze ergänzen. Vorhandene MX- oder
   SPF-Einträge nicht blind überschreiben. Verifizierung abwarten.
5. In Resend einen API-Key mit der minimal nötigen Sendeberechtigung
   erstellen. Nie in GitHub oder Chat kopieren.
6. Supabase: Authentication > Email > SMTP Settings
   https://supabase.com/dashboard/project/jcctdjjunxmxaphjkrsz/auth/smtp
   Custom SMTP aktivieren, Sender name: NoLimits Barbershop
   Sender email: login@nolimits-barber.ch
   SMTP host: smtp.resend.com
   SMTP port: 465
   SMTP username: resend
   SMTP password: Resend API-Key (NUR ins Supabase-Geheimfeld!)
   Speichern.
7. In Resend Link-/Click-Tracking deaktivieren, damit
   {{ .ConfirmationURL }} nicht umgeschrieben wird.
8. Auth-E-Mail an freigegebene Testadresse senden; prüfen:
   - Angezeigter Absender "NoLimits Barbershop"
   - Tatsächliche From-Adresse login@nolimits-barber.ch
   - Betreff und schwarz-goldene Gestaltung
   - Magic Link funktioniert, keine Weiterleitung auf falsche Domain
   - Kein Spam/Fehler in Resend
9. Erst DANACH publicSignupReady im Repo account-config.js auf true setzen
   und Signup-Hinweis auf /konto/ entfernen, um Kundenkonto zu bewerben.
10. Datenschutzinformationen für externe E-Mail-/Hosting-Dienstleister
    und Wix-Datenmigration mit Isen abklären.

## Grenzen der Tests
- Vorlagen sind erst nach Schritt A in echten Auth-E-Mails sichtbar.
- E-Mail-Absender kann ohne verifizierte NoLimits-Domain nicht geändert werden.
- Ohne Isens Cal.com-API-Key können Cal-Kundenhistorie und interne
  Gentleman-Rasur noch nicht live für Mitarbeiter getestet werden.
- Öffentliche Buchungen funktionieren, aber ALTE Wix-Termine sind
  derzeit nicht mit dem Test-Kalender synchronisiert.
- Nicht die Domain umstellen und kein altes Buchungssystem deaktivieren.

## Quellen
Supabase: https://supabase.com/docs/guides/auth/auth-email-templates
Supabase: https://supabase.com/docs/guides/auth/auth-smtp
Resend: https://resend.com/docs/send-with-supabase-smtp

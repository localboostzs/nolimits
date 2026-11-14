# NoLimits – Testsystem, Kundenlogin und interne Verwaltung
Stand: 14.11.2026

## Bereits vorbereitet
- Bestehende 9 Dienstleistungen weiterhin über Cal.com buchbar.
- Versteckter Cal.com-Termin Gentleman Rasur (30 Min, CHF 30), ID 7912905,
  nur im geschützten Staff-API des Workers vorgesehen.
- Passwortloses Kundenkonto /konto/ mit Profil und Wiederbuchung.
- Buchungsformular füllt nach Login Name, E-Mail, Telefon, Adresse vor
  und speichert nach bestätigter Buchung die zuletzt gewählte Leistung.
- Kundenverwaltung /verwaltung/ mit Cal.com-Terminen, Kundensuche, manuellen
  Buchungen und Gentleman-Rasur, serverseitig nur für Staff freigegeben.
- SQL-Migration mit RLS für Profile und Staff-Rechte.
- Öffentliche Website und die vorhandenen neun Dienste bleiben verfügbar.

## Noch NICHT einsatzbereit bis eigenes NoLimits-Supabase-Projekt erstellt ist
Das Projekt LocalBoost System bleibt bewusst unverändert; es hat
Benutzerregistrierungen deaktiviert. Das NICHT umstellen.

1. Ein separates NoLimits-Supabase-Projekt in der gewünschten Organisation und Region erstellen.
2. SQL aus supabase/migrations/20261114_nolimits_customer_accounts.sql anwenden.
   RLS auf beiden Tabellen aktiv lassen und nur ausdrücklich nötige API-Rechte vergeben.
3. Auth URL Configuration: Site URL und Redirect URL für
   https://localboostzs.github.io/nolimits/konto/ eintragen.
   Passwortlose E-Mail-Anmeldung aktivieren und SMTP für echten Kundenbetrieb
   einrichten; Standard-E-Mail-Dienst kann strikte Limits haben.
4. In assets/js/account-config.js nur Supabase URL und öffentlichen
   sb_publishable-Schlüssel eintragen. Keine Server-Secrets hochladen!
5. Worker nolimits-booking-test: NL_SUPABASE_URL und
   NL_SUPABASE_PUBLISHABLE_KEY als Worker secret_text hinzufügen.
   CAL_API_KEY erhalten.
6. Isen über /konto/ anmelden und E-Mail bestätigen. User UUID in Auth > Users
   ablesen und ausschliesslich über den SQL-Adminzugang freischalten:
   INSERT INTO public.nl_staff(user_id,role,active) VALUES ('<UUID>','owner',true);
7. Tests: Admin-API ohne Token = 401 (nach Konfiguration); mit normalem
   Kundenlogin = 403; nur mit freigeschaltetem Isen-Login = 200.
8. Konto, Handy-Login, Buchung, E-Mail und Staff-Funktionen testen.
9. Anschliessend Account-Link in der Hauptnavigation freischalten.

### Interne Worker-Endpunkte
GET /api/admin/services – neun öffentliche plus Gentleman Rasur
GET /api/admin/contacts – Kontakte aus Cal.com-Buchungen
GET /api/admin/slots?service=...&start=...&end=...
POST /api/admin/book – manuelle Staff-Buchung
Alle erfordern gültigen Supabase-JWT mit aktivem Staff-Eintrag.
Wenn kein dediziertes NoLimits-Auth-Projekt vorhanden ist, liefern sie 503.
Öffentliche Worker-Routen bleiben unverändert.

### Mit Isen nächste Woche
- Erweiterungsumfang und allfälligen Mehrpreis klären.
- Cal.com auf sein eigenes Konto und seine E-Mail übertragen.
- Google Kalender verbinden, Benachrichtigungen testen.
- Wix-Kontakte und kommende Termine mit Zustimmung übernehmen.
- Ferien, Pausen, Stornierungsregel und Launch-Termin festlegen.
- Domain und Wix-Buchung zuletzt umschalten.

### Datenschutz und Grenzen
- Keine Wix-Kundendaten ohne Isens Zustimmung importieren.
- Keine Staff-Rechte über User-Metadaten oder E-Mail im Browser festlegen.
- Der Bereich zeigt bis zur Migration nur Cal.com-Kontakte, nicht Wix-Historie.
- Ein in Cal.com versteckter Typ ist bei bekanntem Direktlink nicht
  automatisch vollständig geschützt. Nur das eigene Dashboard und die
  geschützten Worker-Endpunkte sind rollenbasiert kontrolliert.
- Beim Wechsel zu Isens Cal.com-Konto müssen alle Event-Typ-IDs,
  inklusive interner ID 7912905, aktualisiert werden.
- Keine Passwörter, Schlüssel oder Zugangstoken in GitHub speichern.

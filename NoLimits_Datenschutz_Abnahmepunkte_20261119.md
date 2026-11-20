# NoLimits – Datenschutz- und Betriebsangaben: Prüfung vor dem Produktivstart

**Stand:** 19.11.2026. **Kein Rechtsgutachten und keine Produktivfreigabe.** Diese Prüfung dient der transparenten Vorbereitung des Testsystems; unbekannte Betreiber-/Vertragsangaben werden nicht erfunden.

## Ausgegangener IST-Stand

Die aktuelle GitHub-Testseite `impressum/index.html` nennt als Verantwortlichen No Limits Barber-Shop – Krasnici Isen mit Geschäftsanschrift Schmiedgasse 94, 6438 Ibach und einer Kontakt-E-Mail-Adresse. Sie erwähnt Supabase Auth, Cal.com, GitHub Pages, Cloudflare, technische Zugriffs-/Browserdaten und eine optional geladene Google-Maps-Karte. Die aktuell verwendete Kontaktadresse, UID und übrigen Stammdaten sind **vor dem Wechsel mit Isen zu verifizieren**, nicht unbesehen zu übernehmen.

## Sachliche Ergänzungen, die der neue Buchungsablauf benötigt

1. **NoLimits-E-Mail-Versand:** Die neue Architektur versendet kundenbezogene Bestätigungen, Umbuchungs- und Stornierungsmails über **Resend**. Diese Anbieterrolle ist im derzeitigen Rechtstext nicht ausdrücklich genannt. Sie muss in einer überprüften Datenschutzerklärung korrekt erläutert werden.
2. **Alias-Architektur:** Cal.com bekommt künftig eine eindeutig zugeordnete interne Buchungsadresse (Alias) statt der ursprünglichen Kunden-E-Mail-Adresse. Das reduziert die Offenlegung der echten Adresse gegenüber Cal.com, **bedeutet aber nicht, dass Cal.com keinerlei Personendaten verarbeitet**: Namen, Telefonnummer, Termin-/Leistungsdetails und eventuell Anmerkungen können weiterhin verarbeitet werden.
3. **Supabase:** Echte Kunden-E-Mail und ihre interne Alias-Zuordnung liegen serverseitig in einer geschützten Supabase-Tabelle. Rechte, Speicherdauer, Löschung und Zugriff durch berechtigte Mitarbeitende müssen für den tatsächlichen Produktivbetrieb korrekt beschrieben und überprüft werden.
4. **Kalenderdatei (derzeit DEAKTIVIERT):** Ein echter Google-Kalender-Test zeigte, dass manuell importierte `.ics`-Dateien bei Umbuchungen doppelte Termine hinterlassen und Stornos unzuverlässig verarbeitet werden. Deshalb gilt in LAB und Produktionskandidat **`NL_ICS_ENABLED=false`**; NoLimits versendet aktuell nur Bestätigungs-, Umbuchungs- und Stornierungs-E-Mails ohne Kalenderanhang. Eine künftige iTIP/iMIP-Integration wäre ein gesondert real zu prüfendes Produktfeature, nicht eine zugesicherte Funktion. Siehe [Kalenderimport-Befund](NoLimits_Kalenderimport_Befund_20261120.md).
5. **Datenimporte:** Eine Übernahme bisheriger Wix-Kontakte und -Termine erfolgt nur nach ausdrücklicher Freigabe des verantwortlichen Betriebsinhabers. Ein vorhandenes Wix-Konto oder eine technische Exportmöglichkeit ersetzt die Abstimmung über Zweck, Umfang, Berechtigungen und Betroffenenrechte nicht.
6. **Zustell-/Servicekontakte:** `noreply@nolimits-barber.ch` ist technisch eine reine Versandadresse. Ein funktionierender Supportkanal für Rückfragen, Auskunft und Löschung muss vorhanden und sichtbar sein.

## Noch unbekannte Tatsachen – NICHT ohne Isen als bestätigt formulieren

- Endgültige Anbieter-/Vertragsbeziehungen und Verantwortlichkeiten zwischen NoLimits, LocalBoost, Supabase, Resend, Cal.com, Cloudflare, GitHub Pages und gegebenenfalls Google.
- Speicherstandorte, Empfängerländer und zulässige Grundlagen für allfällige Bekanntgabe ins Ausland.
- Tatsächliche Speicher- und Aufbewahrungsfristen (Termine, Konten, Aliaszuordnungen, E-Mail-Metadaten, Betriebslogs, Backups) sowie dokumentierte Löschroutinen.
- Kontaktweg für Betroffenenrechte, Zuständigkeiten für Kunden-/Kalenderexporte und Wiederherstellung.
- Wer nach der Umstellung Kundenprofile/Mitarbeiterrollen verwalten darf, und wie Isen die erforderliche Freigabe/Schulung bestätigt.
- Stornierungsbedingungen und allfällige Kosten bei Nichterscheinen müssen dem tatsächlich geltenden und mit Isen abgestimmten Geschäftsbetrieb entsprechen; keine erfundenen Rechtssätze.

## Offizielle Quellen zur Abnahme

- EDÖB, Informationspflicht: https://www.edoeb.admin.ch/de/informationspflicht
- EDÖB, Bekanntgabe von Personendaten ins Ausland: https://www.edoeb.admin.ch/de/bekanntgabe-von-personendaten-ins-ausland
- Datenschutzgesetz DSG, insbesondere Informationspflichten: https://www.fedlex.admin.ch/eli/cc/2022/491/de
- EDÖB, Rechte betroffener Personen: https://www.edoeb.admin.ch/de/meine-rechte-kennen-und-durchsetzen

## Abnahmeentscheidung

**Vor Go-live:** Die faktischen Angaben mit Isen und gegebenenfalls einer fachkundigen Datenschutzperson prüfen, dann erst den endgültigen Text auf der NoLimits-Website publizieren. Bis dahin ist dieser Bericht ein Änderungs-/Freigabeprotokoll und **keine** öffentliche Datenschutzerklärung. Die Wix-Live-Website bleibt unverändert.

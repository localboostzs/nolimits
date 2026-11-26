# NoLimits – letzte manuelle iPhone-Abnahme (vor dem Termin mit Isen)

**Stand:** 21.11.2026  
**Status: PASS – vom Auftraggeber am 21.11.2026 ausdrücklich bestätigt («iPhone-Abnahme PASS»).** Sämtliche vorangegangenen Backend-, realen LAB-Mitarbeiter-, Backup-Inhaltsintegritäts-, automatisierten Browser- und Release-Preflight-Prüfungen sind dokumentiert und bestanden. **Phase 1: technische Testsystem-Abnahme bestanden; keine Produktivfreigabe.**

## Wichtig vor Beginn

- Ausschliesslich die **NoLimits-GitHub-Testwebsite** öffnen: https://localboostzs.github.io/nolimits/ .
- **Nicht** die noch aktive Wix-Seite `www.nolimits-barber.ch` verändern, Wix kündigen, DNS umschalten, echte Cal.com-Kundentermine anlegen oder den Staging-Worker selbst einschalten.
- Benutzerdefinierte Domains/URLs nur anschauen, nicht in Widgets eingeben.
- Mobile-Abnahme auf dem eigenen iPhone in Safari (normaler Tab, nicht Privatmodus wenn bereits eingeloggt). Nach Möglichkeit zusätzlich Querformat testen.
- Für echte Login-/Profilprüfungen nur den bereits getesteten eigenen Kunden-/Mitarbeiteraccount verwenden. **Keine** Passwörter oder signierten Terminlinks in Screenshots/Chat weitergeben.
- Die URL `/verwaltung-lab/` ist ein technischer LAB-Test und muss **nicht** wiederholt werden. Staging ist geschlossen.
- Im Buchungsformular **vor der abschliessenden Bestätigung stoppen**, damit kein echter Cal.com-Termin entsteht. Es gibt keine Verpflichtung, eine Buchung einzureichen.

## A – Öffentliche Mobile-Seite (iPhone, Hochformat)

1. Öffne https://localboostzs.github.io/nolimits/ . Prüfe, dass der Header, das Logo und das Menü sichtbar und bedienbar sind.
2. Öffne/schliesse die Navigation, teste die Anker-Menüpunkte und zurück zum oberen Seitenbereich.
3. Prüfe Bilder und Texte: keine unscharfen, abgeschnittenen oder unpassenden Bilder; keine abgeschnittenen Überschriften, überlappenden Knöpfe oder horizontal scrollende Bereiche.
4. Prüfe alle neun Dienstleistungen: Bezeichnungen, Preise und Dauer aus dem bereits bestandenen automatisierten Release-Monitor plausibel; keine falschen öffentlichen LAB-Dienstleistungen.
5. Tippe auf die Buchungs-CTA, wähle eine normale Leistung, prüfe die Darstellung des Kalender-/Datumsauswahlmenüs und der freien Zeiten. **Keine finale Buchung absenden**.
6. Prüfe Impressum/Datenschutz-Link, Kontaktinformationen und den sichtbaren Hinweis zum Umgang mit Terminen. Keine Behauptung über automatische Kalenderupdates: `ICS` ist weiterhin deaktiviert.

## B – Kundenkonto und Terminverwaltung

7. Öffne https://localboostzs.github.io/nolimits/konto/ und melde dich mit dem **eigenen Testkundenkonto** an (falls bereits vorhanden). Prüfe, dass Profilfelder, Buttons und Meldungen auf schmalem Display sichtbar sind; Profiländerungen nur mit eigenen Testdaten.
8. Öffne https://localboostzs.github.io/nolimits/termin-verwalten/ **ohne echten signierten Terminlink**. Prüfe, dass eine verständliche Fehl-/Hinweismeldung statt eines unsicheren Blankoformulars erscheint. Für Storno/Umbuchung sind signierte Tokens notwendig; diesen echten Vorgang hat die LAB-Backendabnahme bereits geprüft.

## C – Verwaltung (optional, wenn derselbe berechtigte Mitarbeiteraccount auf dem iPhone vorhanden ist)

9. Öffne https://localboostzs.github.io/nolimits/verwaltung/ . Ohne Mitarbeiterberechtigung dürfen **keine** Kundendaten sichtbar sein. Falls du dich mit deinem berechtigten internen Staff-Testkonto anmelden kannst, prüfe nur Darstellung/Navigation und melde dich danach ab. **Keine** Wix-Kontakte importieren; der Import bleibt bis zu Isens Freigabe deaktiviert.

## D – Bedienbarkeit

10. Prüfe auf dem iPhone Hoch-/Querformat, lange Dienstleistungsnamen, sichtbare Datumsauswahl und verständliche Fehlertexte. Kontrolliere, dass wichtige Buttons mindestens bequem antippbar sind und keine unerwarteten Überlappungen entstehen.

## Abnahmeergebnis

Melde an ChatGPT eine knappe Aussage:
- `iPhone-Abnahme PASS`, falls alle notwendigen Punkte ohne Fehler funktionieren;
- sonst `iPhone-Abnahme FEHLER: <Seite/Schritt und Beobachtung>`, idealerweise ein Screenshot **ohne personenbezogene Daten, Passwörter, Tokens oder echte Buchungslinks**.

**Bei Fehler:** Phase-1-Freigabe gesperrt. Betroffene UI im Feature-Branch nachbessern und erneut automatisiert und manuell prüfen.

**Bei PASS:** ChatGPT dokumentiert die letzte iPhone-Abnahme in der Abnahmematrix und bereitet die konkrete, begrenzte Einladung für Isen vor, jedoch keine automatische Kontaktaufnahme oder Produktivumschaltung.

## Für Phase 2 mit Isen und Phase 3

Unabhängig von der iPhone-Abnahme bleiben Isens Wix-Bestandskunden, Terminkalender, Dienstleistungs-IDs, Eigentümer-/Staff-Zugänge, Datenschutz- und Supportfreigabe sowie das zukünftige Live-DNS/Worker-Deployment nur **nach seiner Zustimmung** durchzuführen. Vor echtem produktivem Kundendatenbetrieb muss eine **zweite verschlüsselte Offsite-Sicherung** und eine kontrollierte Backup-Aufbewahrung festgelegt werden. Die vorhandene USB im selben Haus ist kein Offsite-Backup.

## Resultat vom 21.11.2026

- Der Auftraggeber hat nach Ausführung der Checkliste **«iPhone-Abnahme PASS»** gemeldet. Diese Erklärung ist der persönliche Anwender-Nachweis, getrennt von den automatisierten [Mobile-/Desktop-Browsertests](https://github.com/localboostzs/nolimits/actions/runs/44833543244), die ebenfalls erfolgreich waren.
- **Es ist keine erneute mobile Prüfung notwendig**, solange keine relevante UI-Änderung erfolgt.
- Die Checkliste bleibt als reproduzierbare Regression und Dokumentation erhalten; sie ist nicht mehr als offener Auftrag zu behandeln.
- Freigabe: Vorbereitung des unverbindlichen Termins mit Isen gemäss [Vorführ- und Übergabeplan](NoLimits_Isen_Treffen_Vorbereitung_20261121.md). Keine technische Umstellung und **keine eigenmächtige Kontaktaufnahme durch die Assistenten**.

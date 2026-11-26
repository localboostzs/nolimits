# NoLimits – Kalenderimport: echter Anwenderbefund und Release-Entscheid

**Projekt:** NoLimits Barbershop / LocalBoost Zentralschweiz  
**Datum:** 20.11.2026  
**Phase:** Testsystem, vor dem Treffen mit Isen  
**Ergebnis:** Kalenderdatei-Versand PASS, Kalenderaktualisierung durch manuelle ICS-Importe **NICHT BESTANDEN**.

## 1. Verifizierter End-to-End-Test

Der interne NoLimits-Staging-Worker hat eine Buchung erstellt, umgebucht und storniert. Für alle drei Ereignisse sind NoLimits-Mails via Resend erfolgreich zugestellt und die jeweiligen `NoLimits_Termin.ics`-Anhänge nachgewiesen. Der Nutzer bestätigte den Empfang aller drei Mails mitsamt Anhang.

Der Nutzer importierte die Dateien anschliessend einzeln und in zeitlicher Reihenfolge in einen **separaten Testkalender in Google Kalender**:

| Schritt | Beobachtung |
|---|---|
| Erste ICS (Terminbestätigung) | Ursprünglicher Kalendereintrag erstellt |
| Zweite ICS (Umbuchung) | Neuer zweiter Eintrag angelegt; der ursprüngliche Termin bleibt bestehen |
| Dritte ICS (Storno) | Nur der zweite, umgebuchte Eintrag gelöscht; der ursprünglich importierte Termin bleibt bestehen |

**Betriebsrisiko:** Kunden können nach Umbuchung oder Stornierung irrtümlich einen überholten Termin im eigenen Kalender behalten. Als automatische Kalenderintegration für echte Kunden nicht freigeben.

## 2. Technischer Befund aus den drei exakt versendeten Dateien

Die drei echten Resend-Anhänge wurden für diesen Test heruntergeladen und ausschliesslich auf ICS-Ereignis-ID, Sequenz, Methode, Status und Beginn kontrolliert. Keine Test-E-Mail-Adresse oder signierten Verwaltungslinks in Prüfprotokollen veröffentlicht.

| Datei | UID | SEQUENCE | METHOD | STATUS |
|---|---|---|---|---|
| Buchung | identisch bei allen drei | 0 | PUBLISH | CONFIRMED |
| Umbuchung | identisch bei allen drei | 1 | PUBLISH | CONFIRMED |
| Storno | identisch bei allen drei | 2 | CANCEL | CANCELLED |

**Schlussfolgerung:** Die realen Dateien verwenden tatsächlich eine stabile UID und steigende Sequenz. Der doppelte Termin ist daher **nicht auf unterschiedliche UIDs** zurückzuführen. Das allein garantiert allerdings nicht, dass Google Kalender beim **manuellen Import** bestehende Einträge automatisch aktualisiert.

Die Google-Hilfe beschreibt ICS-Dateiimporte getrennt von Einladungssynchronisierung. Für automatische Änderungen/Stornos per Kalender-E-Mail ist **iTIP/iMIP** mit Organisator, eingeladenem Teilnehmer, METHOD:REQUEST bzw. CANCEL und korrekt transportiertem `text/calendar`-Inhalt zu prüfen. Eine beliebige normale E-Mail mit ICS-Anhang ist nicht automatisch eine solche Einladung.

Offizielle Quellen:
- Google Kalender – ICS-Import: https://support.google.com/calendar/answer/37118?hl=de
- Google Kalender – Importprobleme: https://support.google.com/calendar/answer/45654?hl=de
- IETF RFC 5546 (iTIP, REQUEST und CANCEL): https://www.rfc-editor.org/rfc/rfc5546.html
- IETF RFC 6047 (iMIP / Kalender-E-Mail): https://www.rfc-editor.org/rfc/rfc6047.html

## 3. Bereits vorgenommene Schutzmassnahmen

- `worker/wrangler.alias-staging.toml`: **`NL_ICS_ENABLED = "false"`**.
- `tests/NoLimits_AliasStaging_Isolation_20261119.mjs`: blockiert die Staging-Tests, wenn ICS fälschlich wieder aktiviert wird.
- GitHub-Actions-Deployworkflow: prüft ausdrücklich `NL_ICS_ENABLED = "false"` **und** `workers_dev = false`, bevor die isolierte Staging-Version bereitgestellt wird.
- GitHub Actions [Run 44639589423](https://github.com/localboostzs/nolimits/actions/runs/44639589423) und die zugehörige Staging-Bereitstellung sind erfolgreich. Cloudflare hat für `nolimits-alias-staging` `NL_ICS_ENABLED=false` zurückgemeldet, `workers.dev.enabled=false`, `previews_enabled=false`.
- Die normale **Buchungsbestätigung, Umbuchungsbestätigung und Stornierungs-E-Mail bleiben aktiv**; nur die Kalenderdatei als Zusatzfunktion wurde deaktiviert. Wix, produktiver Worker, Domain und Kalender wurden nicht verändert.

## 4. Produktentscheidung und weiterer Testbedarf

**Sicherer Zwischenstand:** Keine ICS-Anhänge an Kunden versenden. Die E-Mail mit Terminzeit und persönlichem NoLimits-Verwaltungslink ist die verbindliche Termininformation.

**Option A (später):** Echte iTIP/iMIP-Kalendereinladungen aufbauen, mit korrekt authentifiziertem Organisator, echtem Teilnehmer und E-Mail-MIME. Durchgängige Anwender-End-to-End-Tests mit Google Kalender, Apple Kalender und Outlook vor Freigabe. Kein ungetestetes Versprechen automatischer Updates.

**Option B:** Expliziter **manueller Kalenderdownload** nur für die Erstbuchung mit gut sichtbarem Hinweis, dass bei Umbuchung/Storno alte Kalendereinträge **selbst gelöscht/angepasst** werden müssen. Das wäre keine automatische Integration. Diese Option braucht eine ausdrückliche Produktentscheidung und gute UX-Texte.

**Empfehlung:** Bis eine der Optionen real bestanden ist, bei **keinen** automatischen Kalender-Anhängen bleiben. Die vollständig getesteten NoLimits-Mails sind unabhängig davon einsatzfähig.

## 5. Release-/Projektgrenzen

- Kalender-App-Synchronisation auf der Abnahmematrix **NICHT BESTANDEN** lassen, nicht als PASS verbuchen, nur weil Resend `delivered` zeigt.
- Die optionale ICS-Funktion ist damit kein automatisch bestandenes Gate für Phase 1, sondern ein separat offener Produktentscheid.
- Kein Kontakt mit Isen vor vollständig freigegebenem Testsystem; Wix inklusive Abo-Verlängerung bleibt unverändert, bis das neue Live-Produkt nachweislich funktioniert.
- Manuelle Mobile-Abnahme nach wie vor **ganz am Ende vor dem Treffen mit Isen**.

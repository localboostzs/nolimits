# NoLimits – isolierte Mitarbeiter-LAB-Abnahme

**Projekt:** NoLimits / LocalBoost Zentralschweiz  
**Datum:** 20.11.2026  
**Phase:** 1, vor jeglichem Treffen mit Isen  
**Ziel:** Echte Mitarbeiter-JWT-Berechtigung, interne Cal.com-LAB-Buchung, Aliasauflösung im CRM und automatische Teststornierung nachweisen, ohne produktive Termine anzufassen.

## Bereits automatisch verifiziert

- Mitarbeiter-LAB-Backend ist strikt auf **LAB-Eventtyp 7982460** beschränkt; produktive interne Leistungen können von diesem Worker nicht gebucht und nicht als LAB-CRM-Termine angezeigt werden. Backend-Mocktest [PASS](https://github.com/localboostzs/nolimits/actions/runs/44651185535).
- Die Browser-Testseite [verwaltung-lab/](https://localboostzs.github.io/nolimits/verwaltung-lab/) wurde isoliert auf der bestehenden GitHub-Testseite veröffentlicht. Sie erstellt nur bei direktem Klick einen internen Testtermin und versucht im `finally`-Block auch bei einem CRM-Fehler die Stornierung. Browser-Playwright-Test [PASS](https://github.com/localboostzs/nolimits/actions/runs/44652085366).
- Cloudflare-Bindings: `NL_ALIAS_STAGING_ONLY=true`, `NL_ALIAS_MODE=enabled`, `NL_ICS_ENABLED=false` und die sechs Server-Secrets einschliesslich `NL_SUPABASE_PUBLISHABLE_KEY` vorhanden. Keine Geheimnisse in Website/Repo/Logs.
- Die separate GitHub-Actions-Arbeitsanweisung [LAB-Testfenster](https://github.com/localboostzs/nolimits/actions/workflows/NoLimits_LAB_Testfenster_20261120.yml) prüft Cloudflare, öffnet **nur** `nolimits-alias-staging` für einen definierten Zeitraum und schliesst automatisch. Preflight ohne Öffnen [PASS](https://github.com/localboostzs/nolimits/actions/runs/44652510430); echter 20-Sekunden-Öffnungs-/Schliessprobelauf [PASS](https://github.com/localboostzs/nolimits/actions/runs/44652718518), Cloudflare danach `enabled=false` und `previews_enabled=false`.
- Der LAB-Event-Webhooksatz wurde aus Cal.com gelesen: genau ein aktiver Eventtyp-Webhook mit `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`. Kein zusätzlicher `BOOKING_CONFIRMED`-Trigger für diesen LAB-Webhook.

## Exakte Anwenderanleitung (Desktop; mobile Prüfung bewusst später)

1. In einem Desktop-Browser mit berechtigtem Mitarbeiterkonto zuerst die [normale NoLimits-Verwaltung](https://localboostzs.github.io/nolimits/verwaltung/) aufrufen und anmelden.
2. **Im gleichen Browser-Tab** zur internen [LAB-Testseite](https://localboostzs.github.io/nolimits/verwaltung-lab/) wechseln. Dort muss stehen: «Berechtigte Mitarbeiteranmeldung vorhanden.» Der Button ist aktuell noch nicht zu klicken, weil die LAB-API standardmässig geschlossen ist.
3. In einem **separaten GitHub-Tab** unter `localboostzs` den [LAB-Testfenster-Workflow](https://github.com/localboostzs/nolimits/actions/workflows/NoLimits_LAB_Testfenster_20261120.yml) öffnen, `Run workflow` wählen, Branch `main`, Option `open-8min`, dann `Run workflow`.
4. Im GitHub-Run warten, bis Schritt «Open ONLY the LAB workers.dev route for the controlled test window» als gestartet bzw. erfolgreich erkennbar ist. Im LAB-Tab Button **«Gesamten LAB-Test starten»** klicken.
5. Das Skript lädt ausschliesslich die LAB-Leistung, sucht Cal.com-Testverfügbarkeit, bucht eine interne LocalBoost-Plus-Adresse, überprüft das CRM und storniert anschliessend den Testtermin automatisch. Bei Fehlfunktion muss die Abschlussmeldung **nicht bestanden** beachtet werden, selbst wenn andere Teilschritte grün sind.
6. Ergebnis notieren: Steht am Ende **«GESAMTER MITARBEITER-LAB-TEST BESTANDEN»**? Steht ausserdem **«LAB-Termin automatisch storniert»**? Falls nein, die angezeigte Fehlermeldung **ohne Token oder persönliche Kundendaten** mitteilen.
7. Nicht den GitHub-Workflow abbrechen. Der Workflow schliesst nach dem Testfenster das Staging selbst. **Schritt «Always close LAB workers.dev again after the test window» muss grün sein.** Bei einem rot abgebrochenen Workflow Cloudflare Dashboard → Workers & Pages → `nolimits-alias-staging` → Settings → Domains & Routes kontrollieren und `workers.dev` manuell deaktivieren. Im Zweifel nicht erneut buchen.
8. Interne NoLimits-Mails im Postfach von `info@localboost-zs.ch` dürfen für diesen Test eintreffen. Die echte Kundschaft und der produktive Wix-Kalender bleiben unangetastet. Die angelegte Alias-Mapping-Zeile kann nach Abschluss anhand des eindeutigen Präfixes `info+nl-lab-staff-` und des stornierten Cal.com-Testtermins gezielt entfernt werden.

## Warum nicht vollständig autonom?

Für den ausschliesslich echten Mitarbeiter-API-Test ist ein gültiges Supabase-Sitzungstoken der bereits registrierten und berechtigten Person nötig. Der Worker prüft dieses über Supabase Auth und RLS. Ein gefälschtes JWT darf einen erfolgreichen Test nicht ersetzen. Der Token darf **nicht** im Chat oder GitHub ausgegeben werden. Der direkte Browser-Ablauf führt diesen Nachweis ohne Tokenweitergabe aus.

## Ausdrückliche Sperren

- Nicht `main` mit dem Alias-Featurebranch mergen, nicht den produktiven Cloudflare-Worker neu deployen, keine Wix-Website, DNS, Domain oder Wix-Abo-Verlängerung ändern.
- `NL_ICS_ENABLED=false` bleibt, da echte Google-Kalender-Imports bei Umbuchung einen Doppeltermin erzeugten.
- Manuelle Mobile-Abnahme erfolgt erst **ganz am Schluss**, unmittelbar vor Isens Termin.
- Bei fehlgeschlagener automatischer Stornierung Cal.com-LAB-Termin über dieselbe Isolated-Testkonfiguration prüfen und stornieren, bevor erneut getestet wird.

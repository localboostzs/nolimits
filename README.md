# NoLimits Barbershop – statische Website

Statische Website (HTML + CSS + wenig Vanilla-JS, kein Framework, kein Build) des NoLimits Barbershop, Schmiedgasse 94, 6438 Ibach SZ.

## Seiten

| Adresse | Datei |
| --- | --- |
| `/` | `index.html` |
| `/leistungen/` | `leistungen/index.html` |
| `/kontakt/` | `kontakt/index.html` |
| `/ueber-mich/` | `ueber-mich/index.html` |
| `/impressum/` | `impressum/index.html` |

## Buchungs-Link ändern

Alle „Termin buchen“- und „Buchen“-Buttons laufen über **eine** Konstante in `assets/js/config.js`:

```js
window.NOLIMITS_CONFIG = { BOOKING_URL: 'https://www.nolimits-barber.ch/book-online' };
```

Dort die URL austauschen (die Links in den HTML-Dateien dienen nur als Rückfall ohne JavaScript).

## Lokal ansehen

```bash
python -m http.server 8080
```

Dann `http://127.0.0.1:8080/` öffnen.

## Hinweise

- Keine Cookies, keine Tracker, keine externen Skripte. Schriften liegen lokal in `assets/fonts/`.
- Einzig die Google-Maps-Karte (Kontakt und Home) lädt Inhalte von Google (iframe).
- Alle Masse sind in `u` (1 % der Seitenbreite, maximal 1920 px) angegeben, damit das Layout wie das Original skaliert.

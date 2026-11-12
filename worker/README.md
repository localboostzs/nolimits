# NoLimits Buchungs-Proxy (Cloudflare Worker)

GitHub Pages -> **dieser Worker** -> Cal.com API v2. Der API-Schlüssel liegt nur als Cloudflare-Secret, nie im Repo oder Frontend.

## Endpunkte
- `GET /api/services` – Leistungen aus `src/services.js`
- `GET /api/slots?service=<key>&start=YYYY-MM-DD&end=YYYY-MM-DD` – freie Zeiten (Europe/Zurich)
- `POST /api/book` – Buchung (validiert, Honeypot, Rate-Limit); Erfolg nur bei von Cal.com bestätigter Buchung

## Einrichtung
1. Cloudflare-Konto (kostenlos), `npx wrangler login`
2. `npx wrangler deploy` (nutzt `wrangler.toml`; erlaubte Origin ist `https://localboostzs.github.io`)
3. Secret setzen: `npx wrangler secret put CAL_API_KEY` (oder im Dashboard: Workers & Pages -> nolimits-booking -> Settings -> Variables and Secrets -> Add -> Type *Secret*, Name `CAL_API_KEY`)
4. Worker-URL in `assets/js/booking-config.js` (`API_BASE`) eintragen.

## Auf Isens Cal.com-Konto umstellen
Nur `CAL_API_KEY` (Secret) und die Event-Type-IDs in `src/services.js` (und `dist/worker.js` neu erzeugen) ändern.

## Lokal testen
`node dev.mjs` (Port 8787) und die Seite mit `?api=http://127.0.0.1:8787` öffnen.

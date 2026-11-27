/**
 * LIVE watch (read only): is any hosting branding visible on the website?
 * Netlify adds its "Powered by Netlify" badge at its edge; our Content Security Policy keeps it
 * inactive. This browser test fails if that ever stops working.
 *   node tests/live/NoLimits_NetlifyBadge_Live_20261127.mjs [address ...]
 * Default: the Netlify and Cloudflare Pages addresses (NOLIMITS_BADGE_SITES, space separated).
 * Nothing is submitted; the booking service is not called. Screenshots go to artifacts/netlify-badge/.
 * Checks per address, page and width:
 *   1. the policy is sent and allows no inline script,
 *   2. no foreign frame covers any point of the screen, no "Powered by Netlify" text or link is visible,
 *   3. the picture is identical to the same page with all host scripts removed,
 *   4. control: with the policy switched off, the same detector must see an injected badge.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const sites = (process.argv.slice(2).length ? process.argv.slice(2)
  : (process.env.NOLIMITS_BADGE_SITES || 'https://nolimits-barber.netlify.app https://nolimits-barber.pages.dev').split(/\s+/))
  .map((s) => s.replace(/\/+$/, '')).filter(Boolean);
const PAGES = ['/', '/leistungen/', '/kontakt/', '/booking-test/', '/verwaltung/', '/konto/', '/impressum/'];
const STILL = ['/kontakt/', '/impressum/']; // pages without live data: suitable for picture comparison
const WIDTHS = [320, 390, 1366];
const SHOTS = 'artifacts/netlify-badge';
fs.mkdirSync(SHOTS, { recursive: true });
const HOST_PATH = /\/\.netlify\//;
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });

async function visit(site, route, width, { bypassCSP = false, strip = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'de-CH', timezoneId: 'Europe/Zurich',
    reducedMotion: 'reduce', bypassCSP });
  let injected = false;
  await context.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.request().method())) return r.abort();
    if (url.origin !== site) return r.abort(); // booking service, map, Google: not part of this watch
    if (HOST_PATH.test(url.pathname)) { injected = true; if (strip) return r.abort(); }
    if (strip && r.request().resourceType() === 'document') {
      const response = await r.fetch();
      const body = (await response.text()).replace(/<script\b[^>]*\/\.netlify\/[^>]*><\/script>/gi, '');
      return r.fulfill({ response, body });
    }
    return r.continue();
  });
  const page = await context.newPage();
  const response = await page.goto(site + route, { waitUntil: 'load', timeout: 45000 });
  assert.equal(response.status(), 200, site + route);
  await page.evaluate(() => { document.getElementById('nl-price-notice')?.close(); });
  const reject = page.locator('.nl-privacy-reject');
  if (await reject.isVisible().catch(() => false)) await reject.click();
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    await document.fonts.ready;
  });
  await page.waitForTimeout(6000); // the badge script loads late and shows its frame only after a message
  return { context, page, headers: response.headers(), injected: () => injected };
}

// What a visitor can see that does not belong to this website.
async function branding(page) {
  const found = await page.evaluate(() => {
    const out = [];
    const own = /^https:\/\/(www\.google\.com\/maps|accounts\.google\.com\/gsi\/)/;
    const frames = [...document.querySelectorAll('iframe, frame, object, embed')].filter((f) => !own.test(f.src || f.getAttribute('data-nl-map-src') || ''));
    const points = new Map();
    const stepX = Math.max(6, Math.floor(innerWidth / 80)), stepY = 6;
    for (let x = 2; x < innerWidth; x += stepX) {
      for (let y = 2; y < innerHeight; y += stepY) {
        const e = document.elementFromPoint(x, y);
        if (e && frames.includes(e)) points.set(e, (points.get(e) || 0) + 1);
      }
    }
    for (const [f, n] of points) out.push('sichtbarer fremder Rahmen ' + (f.id || f.title || f.src || f.tagName) + ' (' + n + ' Punkte)');
    const wanted = /powered\s+by\s+netlify|(built|made|hosted)\s+(with|on|by)\s+netlify|netlify\.new/i;
    const shown = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
    const roots = [document];
    for (const root of roots) {
      for (const e of root.querySelectorAll('*')) {
        if (e.shadowRoot) roots.push(e.shadowRoot);
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD'].includes(e.tagName)) continue;
        const text = [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ') + ' ' +
          (e.getAttribute('href') || '') + ' ' + (e.getAttribute('alt') || '') + ' ' + (e.getAttribute('aria-label') || '');
        if (wanted.test(text) && shown(e)) out.push('sichtbarer Hinweis in <' + e.tagName.toLowerCase() + '>');
      }
    }
    return out;
  });
  return found;
}

const failures = [];
try {
  for (const site of sites) {
    let injects = false, controlSaw = false;
    for (const width of WIDTHS) {
      for (const route of PAGES) {
        const where = site.replace('https://', '') + route + ' ' + width + ' px';
        const t = await visit(site, route, width);
        const policy = t.headers['content-security-policy'] || '';
        const scripts = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) || '';
        if (!scripts.startsWith("script-src 'self'") || /unsafe-|\*|data:|blob:/.test(scripts)) failures.push(where + ': CSP fehlt oder erlaubt Inline-Skripte');
        const found = await branding(t.page);
        if (found.length) {
          failures.push(where + ': ' + found.join('; '));
          await t.page.screenshot({ path: SHOTS + '/' + where.replace(/[^a-z0-9]+/gi, '_') + '.png' });
        }
        injects = injects || t.injected();
        if (STILL.includes(route)) {
          const real = await t.page.screenshot({ animations: 'disabled' });
          const clean = await visit(site, route, width, { strip: true });
          const reference = await clean.page.screenshot({ animations: 'disabled' });
          await clean.context.close();
          if (!real.equals(reference)) {
            const name = SHOTS + '/' + where.replace(/[^a-z0-9]+/gi, '_');
            fs.writeFileSync(name + '_live.png', real); fs.writeFileSync(name + '_ohne_hoster.png', reference);
            failures.push(where + ': Bild weicht von der Seite ohne Hoster-Skripte ab');
          }
        }
        await t.context.close();
      }
    }
    if (injects) { // control: the detector itself must still work
      const t = await visit(site, '/kontakt/', 390, { bypassCSP: true });
      const found = await branding(t.page);
      controlSaw = found.length > 0;
      await t.context.close();
      if (!controlSaw) failures.push(site + ': Kontrolllauf ohne CSP sieht das eingefügte Badge nicht – Wächter prüfen (Mechanismus geändert?)');
    }
    console.log(site, '| Hoster-Skript eingefügt:', injects ? 'ja' : 'nein', '| Kontrolle ohne CSP erkennt Badge:', injects ? (controlSaw ? 'ja' : 'NEIN') : 'entfällt');
  }
} finally { await browser.close(); }

if (failures.length) {
  console.error('FEHLER: Hosting-Branding oder fehlender Schutz\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('PASS: kein sichtbares Hosting-Branding auf ' + sites.length + ' Adressen, ' + PAGES.length + ' Seiten, ' + WIDTHS.join('/') + ' px');

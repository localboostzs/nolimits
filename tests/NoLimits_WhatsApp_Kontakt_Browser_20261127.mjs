// Offline test: Isen is reachable ONLY via WhatsApp (message or WhatsApp call, Isen 27.11.2026).
// 1. No page or script offers a normal phone call to the shop number; no "telefonisch" / "anrufen" advice.
// 2. Structured data carries a WhatsApp contact point instead of a telephone number.
// 3. Buttons «Über WhatsApp buchen» with the note, correct link, mobile and desktop without overflow.
// Local files only; every other request is blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const WA = 'https://wa.me/41768019340';
const NOTE = 'Nur über WhatsApp erreichbar – per Nachricht oder WhatsApp-Anruf.';
const SITE = 'https://localboostzs.github.io/nolimits';

/* 1. Static scan of the published website files */
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n')
  .filter((f) => /\.(html|js|css)$/.test(f) && !/^(tests|worker|deploy|tools|release|node_modules)\//.test(f) && !f.includes('/vendor/'));
assert.ok(files.length > 10, 'website files found');
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  assert.doesNotMatch(s, /tel:\+?0?41?\s*76\s*801|tel:0768019340|tel:\+41768019340/, f + ': phone call link to the shop');
  assert.doesNotMatch(s, /telefonisch|ruf uns an|Du kannst auch anrufen|Anrufen:/i, f + ': phone call advice');
}
// The staff portal may still call a CUSTOMER's own number; nothing else uses tel:.
for (const f of files.filter((x) => fs.readFileSync(x, 'utf8').includes('tel:'))) assert.equal(f, 'assets/js/admin.js', f + ' uses tel:');
const worker = fs.readFileSync('worker/src/index.js', 'utf8');
assert.doesNotMatch(worker, /telefonisch|anrufen|076 ?801|41768019340/i, 'Worker messages and mails recommend no phone call');

/* 2. Structured data */
for (const f of ['index.html', 'kontakt/index.html']) {
  const html = fs.readFileSync(f, 'utf8');
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.telephone, undefined, f + ': no telephone in structured data');
  assert.equal(ld.contactPoint.url, WA, f + ': WhatsApp contact point');
  assert.match(ld.contactPoint.description, /Nur über WhatsApp/);
}
const manage = fs.readFileSync('termin-verwalten/index.html', 'utf8');
assert.ok(manage.includes(WA) && manage.includes(NOTE), 'manage page: WhatsApp button and note');

/* 3. Browser: buttons, links, mobile layout */
const options = { headless: true, args: ['--no-sandbox'] };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch(options);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
let checked = 0;
try {
  for (const width of [320, 375, 390, 768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'de-CH', timezoneId: 'Europe/Zurich' });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(SITE + '/')) return route.abort();
      let rel = decodeURIComponent(url.pathname.slice('/nolimits/'.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'missing' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    for (const [route, selector] of [['/', '.cta-copy'], ['/kontakt/', '.page-hero'], ['/booking-test/', '.nl-wa-box']]) {
      await page.goto(SITE + route + '?v=' + width, { waitUntil: 'load' });
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach((n) => n.classList.add('in', 'is-visible', 'visible')));
      const box = page.locator(selector).first();
      const button = box.locator('a.nl-wa');
      assert.equal(await button.count(), 1, route + ' ' + width + ': one WhatsApp button');
      assert.equal(await button.getAttribute('href'), WA);
      assert.equal(await button.getAttribute('target'), '_blank');
      assert.match(await button.getAttribute('rel'), /noopener/);
      assert.equal((await button.innerText()).replace(/\s+/g, ' ').trim().toLowerCase(), 'über whatsapp buchen');
      assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1, 'icon is decorative');
      const note = (await box.locator('.nl-wa-note').innerText()).replace(/\s+/g, ' ');
      assert.ok(note.includes('076 801 93 40') && note.includes(NOTE), route + ': note ' + note);
      const r = await button.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= width + 0.5 && r.height >= 44, route + ' ' + width + ': button fits and is tappable ' + JSON.stringify(r));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route + ' ' + width + ': no horizontal scrolling');
      assert.equal(await page.locator('a[href^="tel:"]').count(), 0, route + ': no tel: link');
      checked++;
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log('PASS: WhatsApp only, no phone call links,', files.length, 'files scanned,', checked, 'page checks 320–1366 px');

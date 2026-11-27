// Cloudflare Pages build: only allowlisted files, refusals work, and the built site
// resolves every path on the main domain, on *.pages.dev and below /nolimits/.
// Offline: the pages are served from the build folder through request interception.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-pages-'));
const out = path.join(work, 'dist');
const node = (cwd, ...args) => execFileSync(process.execPath, args, { cwd, stdio: 'pipe' }).toString();
const walk = (dir, base = '') => fs.readdirSync(path.join(dir, base), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(dir, base + e.name + '/') : [base + e.name]);

/* 1. Exactly the allowlist plus the two Pages configuration files */
const first = node('.', 'deploy/NoLimits_build_pages.mjs', '--out', out);
const list = fs.readFileSync('deploy/NoLimits_public_allowlist.txt', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const built = walk(out).sort();
assert.deepEqual(built, [...list, '_headers', '_redirects', 'build.txt'].sort());
assert.ok(!built.some((f) => /^(deploy|tests|tools|ops|supabase|worker|emails|\.github)\/|\.md$|(^|\/)\./.test(f)), 'nothing internal');
const second = node('.', 'deploy/NoLimits_build_pages.mjs', '--out', path.join(work, 'again'));
assert.equal(second, first, 'reproducible');
const config = (f) => fs.readFileSync(path.join(out, f), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts use CRLF
assert.match(config('_redirects'), /^\/nolimits\/\* \/:splat 301$/m);
const headers = config('_headers');
assert.match(headers, /\/termin-verwalten\/\*\n {2}! Referrer-Policy\n {2}Referrer-Policy: no-referrer/);

/* 1b. The standby host gets the same website; only the header file differs */
const netlify = path.join(work, 'netlify');
const third = node('.', 'deploy/NoLimits_build_pages.mjs', '--host', 'netlify', '--out', netlify);
assert.equal(third, first, 'same website digest on both hosts');
assert.deepEqual(walk(netlify).sort(), built);
for (const f of built.filter((f) => f !== '_headers')) {
  assert.ok(fs.readFileSync(path.join(netlify, f)).equals(fs.readFileSync(path.join(out, f))), 'identical: ' + f);
}
assert.match(config('build.txt'), /^[0-9a-f]{64}\n$/);
const other = fs.readFileSync(path.join(netlify, '_headers'), 'utf8');
assert.doesNotMatch(other, /^\s+! /m, 'no detach syntax');
assert.doesNotMatch(other, /^https?:/m, 'no absolute rules');
assert.match(other, /^\/\*\n {2}X-Content-Type-Options: nosniff\n {2}X-Frame-Options: DENY\n {2}Permissions-Policy:/m);
assert.equal(other.match(/Referrer-Policy:/g).length, 1, 'only the management page sets it');
assert.match(other, /\/termin-verwalten\/\*\n {2}Referrer-Policy: no-referrer\n {2}Cache-Control: no-store\n {2}X-Robots-Tag: noindex/);
for (const rule of ['/verwaltung/*', '/konto/*']) assert.ok(other.includes(rule + '\n  X-Robots-Tag: noindex'), rule);
const toml = fs.readFileSync('netlify.toml', 'utf8');
assert.match(toml, /command = "node deploy\/NoLimits_build_pages\.mjs --host netlify"/);
assert.match(toml, /publish = "dist"/);
assert.throws(() => node('.', 'deploy/NoLimits_build_pages.mjs', '--host', 'x', '--out', path.join(work, 'x')), 'unknown host');

/* 1c. Netlify skips builds only when nothing of the website changed */
const repo = fs.mkdtempSync(path.join(work, 'git-'));
const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'pipe' }).toString().trim();
const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
for (const f of ['deploy/NoLimits_netlify_ignore.mjs', 'deploy/NoLimits_public_allowlist.txt']) put(f, fs.readFileSync(f));
put('index.html', 'a'); put('notes.md', 'a');
git('init', '-q'); git('add', '-A'); git('commit', '-qm', '1');
const commit = (file) => { put(file, file + Math.random()); git('add', '-A'); git('commit', '-qm', file); return git('rev-parse', 'HEAD'); };
const decide = (before, now, context = 'production') => spawnSync(process.execPath, ['deploy/NoLimits_netlify_ignore.mjs'],
  { cwd: repo, env: { ...process.env, CACHED_COMMIT_REF: before, COMMIT_REF: now, CONTEXT: context } }).status;
const start = git('rev-parse', 'HEAD'), docs = commit('notes.md'), page = commit('index.html'), config2 = commit('netlify.toml');
assert.equal(decide(start, docs), 0, 'documents only: skip');
assert.equal(decide(docs, page), 1, 'website changed: build');
assert.equal(decide(page, config2), 1, 'host configuration changed: build');
assert.equal(decide(page, page), 1, 'first build or retry: build');
assert.equal(decide('', page), 1, 'no cached commit: build');
assert.equal(decide('0'.repeat(40), page), 1, 'unknown commit: build');
assert.equal(decide(docs, page, 'deploy-preview'), 0, 'deploy preview: never built');
assert.equal(decide(docs, page, 'branch-deploy'), 0, 'branch deploy: never built');

/* 2. Refusals, each on a throwaway copy */
function refused(label, change, expected) {
  const copy = fs.mkdtempSync(path.join(work, 'copy-'));
  for (const f of [...list, 'deploy/NoLimits_build_pages.mjs', 'deploy/NoLimits_public_allowlist.txt', 'deploy/_headers', 'deploy/_redirects']) {
    fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true });
    fs.copyFileSync(f, path.join(copy, f));
  }
  change(copy);
  assert.throws(() => node(copy, 'deploy/NoLimits_build_pages.mjs'), (e) => expected.test(e.stderr.toString()), label);
}
const append = (copy, file, text) => fs.appendFileSync(path.join(copy, file), text);
const listAlso = (copy, file) => { fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true }); fs.writeFileSync(path.join(copy, file), 'x'); append(copy, 'deploy/NoLimits_public_allowlist.txt', '\n' + file + '\n'); };
for (const file of ['worker/src/index.js', 'tests/a.js', 'NoLimits_intern.md', '.env', 'supabase/a.sql', 'verwaltung-lab/index.html']) {
  refused(file, (c) => listAlso(c, file), /Nicht erlaubt/);
}
refused('secret', (c) => append(c, 'assets/js/main.js', '\n// sb_secret_' + 'a'.repeat(24) + '\n'), /Vertraulicher Inhalt/);
refused('management link', (c) => append(c, 'index.html', '<!-- ?uid=' + 'a'.repeat(20) + '&token=1234567890.x -->'), /Vertraulicher Inhalt/);
refused('fixed address', (c) => append(c, 'index.html', '<a href="https://localboostzs.github.io/nolimits/">x</a>'), /feste GitHub-Adresse/);
refused('root path', (c) => append(c, 'index.html', '<img src="/assets/img/hero-560.webp">'), /ABSOLUT/);
refused('unlisted reference', (c) => append(c, 'index.html', '<script src="assets/js/unbekannt.js"></script>'), /unbekannt/);
refused('missing 404', (c) => {
  const f = path.join(c, 'deploy/NoLimits_public_allowlist.txt');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^404\.html\r?\n/m, ''));
}, /404\.html fehlt/);

/* 3. The built site in a browser */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const pages = list.filter((f) => f.endsWith('index.html')).map((f) => f.slice(0, -'index.html'.length));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  for (const site of ['https://www.nolimits-barber.ch/', 'https://nolimits-barber.pages.dev/', 'https://localboostzs.github.io/nolimits/']) {
    const { origin, pathname: prefix } = new URL(site);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-CH' });
    const missing = [], errors = [];
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort(); // API, maps, login: not part of this test
      if (!url.pathname.startsWith(prefix)) { missing.push(url.pathname); return route.fulfill({ status: 404, body: 'outside the site' }); }
      let rel = decodeURIComponent(url.pathname.slice(prefix.length));
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (!list.includes(rel)) { missing.push(url.pathname); return route.fulfill({ status: 404, body: 'missing' }); }
      return route.fulfill({ contentType: TYPES[path.extname(rel)] || 'application/octet-stream', body: fs.readFileSync(path.join(out, rel)) });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    for (const p of pages) {
      await page.goto(site + p, { waitUntil: 'load' });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
      });
      await page.waitForLoadState('networkidle').catch(() => {});
      const state = await page.evaluate(() => ({
        booking: [...document.querySelectorAll('a[data-booking]')].map((a) => a.href),
        links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
        broken: [...document.images].filter((i) => i.src.startsWith(location.origin) && i.complete && !i.naturalWidth).map((i) => i.src),
        configured: window.NOLIMITS_CONFIG?.BOOKING_URL,
      }));
      for (const href of state.booking) assert.equal(href, site + 'booking-test/', 'booking link on ' + site + p);
      if (state.configured) assert.equal(state.configured, site + 'booking-test/', 'config on ' + site + p);
      assert.deepEqual(state.broken, [], 'images on ' + site + p);
      for (const href of state.links) {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        assert.ok(url.pathname.startsWith(prefix), 'link leaves the site: ' + href);
        let rel = decodeURIComponent(url.pathname.slice(prefix.length));
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        assert.ok(list.includes(rel), 'link target missing: ' + href + ' on ' + p);
      }
    }
    assert.deepEqual(missing, [], 'missing files on ' + site);
    assert.deepEqual(errors, [], 'script errors on ' + site);
    await context.close();
  }
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log('PASS: Pages build allowlist, refusals, reproducibility and ' + pages.length + ' pages on three addresses.');

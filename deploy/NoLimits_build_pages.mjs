#!/usr/bin/env node
// Builds the public website into dist/ strictly from the allowlist next to this file.
// Cloudflare Pages: build command "node deploy/NoLimits_build_pages.mjs", output "dist".
// No dependencies, no network, no git. Anything not listed is never published.
//   node deploy/NoLimits_build_pages.mjs [--out <empty folder>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stop = (message) => { console.error('BUILD ABGEBROCHEN: ' + message); process.exit(1); };

const argument = process.argv.indexOf('--out');
const custom = argument > -1 ? process.argv[argument + 1] : null;
const out = path.resolve(custom || path.join(root, 'dist'));
if (custom) {
  if (fs.existsSync(out) && fs.readdirSync(out).length) stop('Zielordner ist nicht leer: ' + out);
} else {
  fs.rmSync(out, { recursive: true, force: true }); // only ever <repository>/dist
}

const FORBIDDEN_PATH = /^(deploy|tests|tools|ops|supabase|worker|emails|artifacts|release|verwaltung-lab|\.github|\.git)(\/|$)|(^|\/)\.|\.(md|toml|sql|sh|yml|yaml|pem|key|csv|zip)$/i;
const FORBIDDEN_CONTENT = [
  /cal_(?:live|test)_[0-9a-f]{24,}/, /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/, /sb_secret_[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /GOCSPX-[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{36,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /\/home\/[a-z]+\/|\/mnt\/backup/,
  /uid=[A-Za-z0-9]{16,}&(?:amp;)?token=\d{10}\./,
];
const TEXT = /\.(html|js|css|txt|xml|svg|json)$/i;
const SPECIAL = ['_headers', '_redirects']; // Cloudflare Pages configuration, copied from deploy/

const list = fs.readFileSync(path.join(here, 'NoLimits_public_allowlist.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
if (new Set(list).size !== list.length) stop('Doppelte Einträge in der Positivliste.');
if (!list.includes('404.html')) stop('404.html fehlt: ohne sie liefert Pages für unbekannte Adressen die Startseite.');

// Local files a page, stylesheet or script refers to (static references and string literals).
function references(file, text) {
  const found = new Set();
  const dir = path.posix.dirname(file);
  const add = (raw, base) => {
    let r = raw.split(/[?#]/)[0].trim();
    if (!r || /^([a-z]+:|\/\/|#)/i.test(raw)) return;
    if (r.startsWith('/')) {
      // A root path is only valid on the main domain and the 404 page uses it on purpose.
      if (file !== '404.html') found.add('ABSOLUT ' + raw);
      r = r.slice(1);
    } else r = path.posix.normalize(path.posix.join(base, r));
    if (r === '' || r.endsWith('/') || r === '.') r = path.posix.join(r, 'index.html');
    if (/\.(html|js|css|webp|jpg|jpeg|png|svg|woff2|txt|xml)$/i.test(r)) found.add(r);
  };
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\b(?:src|href)="([^"]+)"/g)) add(m[1], dir);
    for (const m of text.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0], dir);
  }
  if (file.endsWith('.css')) for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1], dir);
  if (file.endsWith('.js') && !file.includes('/vendor/')) {
    for (const m of text.matchAll(/['"](\.\.\/assets\/[^'"]+?\.[a-z0-9]+)['"]/gi)) add(m[1], 'booking-test');
    for (const m of text.matchAll(/['"](thumb-[a-z0-9-]+\.webp)['"]/g)) add('assets/img/' + m[1], '.');
  }
  return found;
}

const problems = [];
const files = [...list.map((f) => [f, path.join(root, f)]), ...SPECIAL.map((f) => [f, path.join(here, f)])];
const manifest = [];
for (const [name, source] of files) {
  if (FORBIDDEN_PATH.test(name) || name.includes('..') || path.isAbsolute(name)) stop('Nicht erlaubt: ' + name);
  if (!fs.existsSync(source)) stop('Datei fehlt: ' + name);
  if (!fs.lstatSync(source).isFile()) stop('Keine gewöhnliche Datei: ' + name);
  const data = fs.readFileSync(source);
  if (TEXT.test(name)) {
    const text = data.toString('utf8');
    if (!name.includes('/vendor/')) {
      for (const pattern of FORBIDDEN_CONTENT) if (pattern.test(text)) stop('Vertraulicher Inhalt in ' + name);
      if (/localboostzs\.github\.io/.test(text)) problems.push(name + ': feste GitHub-Adresse');
    }
    for (const ref of references(name, text)) if (!list.includes(ref)) problems.push(name + ' -> ' + ref);
  }
  const target = path.join(out, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  manifest.push(name + ' ' + crypto.createHash('sha256').update(data).digest('hex'));
}
if (problems.length) stop('Verweise oder Adressen prüfen:\n  ' + [...new Set(problems)].sort().join('\n  '));
const digest = crypto.createHash('sha256').update(manifest.sort().join('\n')).digest('hex');
console.log('Website gebaut: ' + manifest.length + ' Dateien, Prüfsumme ' + digest);

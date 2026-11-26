// All OFFLINE tests. No request may leave this machine (see NoLimits_OfflineGuard.mjs).
// Usage: node tests/run-offline.mjs [node|browser|all]
// Browser suites need Playwright and Chrome/Chromium (PLAYWRIGHT_EXECUTABLE_PATH).
// The compatibility suites compare with the state before the release (Worker version 37,
// rollback target): NOLIMITS_MAIN_DIR, or commit c70fc16 (NOLIMITS_LEGACY_REF), which must be fetched.
// Live checks are separate: tests/live/ (never started from here).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NODE_SUITES = [
  'Aliasbuchung_Tests_20261119', 'WebhookRotation_Tests_20261125', 'Haertung_Tests_20261125',
  'PflichtfeldMatrix_Tests_20261125', 'AliasFallback_Tests_20261125', 'AuthRateLimit_Tests_20261115',
  'Buchungsverwaltung_Tests_20261116', 'CRM_Regression_20261116', 'CookieBanner_Tests_20261115',
  'GoogleIDToken_Test_20261117.cjs', 'GoogleLoginIntegration_20261117.cjs', 'LoginSicherheit_Tests_20261125',
  'MeetingEntscheide_20261123', 'Stornobedingungen_Tests_20261125', 'WebhookRobustheit_Tests_20261116',
  'AliasStaging_Isolation_20261119', 'AliasCRM_Regression_20261119', 'StaffLabBooking_E2E_20261120',
  'LabCleanup_Tests_20261120', 'KundenTermin_E2E_20261119', 'WixCSV_Probeimport_20261119',
  'WixBookingPlan_Test_20261119', 'Kalenderdatei_Tests_20261119', 'AliasCleanup_Tests_20261120',
  'DomainSwitch_Tests_20261120', 'DomainFrontend_Config_20261123', 'ProductionCandidate_Tests_20261120',
  'ReadonlyPreflight_Tests_20261119', 'LabRotation_Tests_20261125', 'ManageCalendar_Tests_20261125', 'KeineCalMails_Tests_20261125',
  'Preise2027_Tests_20261126',
];
export const BROWSER_SUITES = [
  'MobileDesktop_UI_20261119', 'ManageBrowser_E2E_20261119', 'AccountProfile_Browser_20261119',
  'StaffLab_Browser_20261120', 'FrontendKompatibilitaet_E2E_20261125', 'PreiseUI_Browser_20261126', 'Mitarbeiterportal_Browser_20261126',
];
const file = (name) => 'tests/NoLimits_' + name + (name.endsWith('.cjs') ? '' : '.mjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function serve() {
  const server = http.createServer((req, res) => {
    let target = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!target.startsWith(root) || target.includes(path.sep + '.')) { res.writeHead(403).end(); return; }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
function mainCheckout() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-main-'));
  const archive = path.join(dir, 'main.tar');
  // main contains the release since 26.11.2026; the comparison needs the code before it.
  const legacy = process.env.NOLIMITS_LEGACY_REF || 'c70fc168c2e5778cd7f8496732117d83deed8558';
  execFileSync('git', ['archive', '--format=tar', '-o', archive, legacy], { cwd: root });
  execFileSync('tar', ['-xf', 'main.tar'], { cwd: dir });
  fs.rmSync(archive);
  return dir;
}

async function main() {
  const group = process.argv[2] || 'all';
  if (!['node', 'browser', 'all'].includes(group)) throw new Error('node, browser or all');
  const env = { ...process.env };
  // Real credentials must never reach a test process.
  for (const name of ['CF_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CAL_API_KEY', 'RESEND_API_KEY']) delete env[name];
  env.NOLIMITS_MAIN_DIR ||= mainCheckout();
  const guard = pathToFileURL(path.join(root, 'tests', 'NoLimits_OfflineGuard.mjs')).href;
  let server;
  if (group !== 'node') { server = await serve(); env.NOLIMITS_UI_BASE = 'http://127.0.0.1:' + server.address().port; }
  const run = (label, args) => new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, env });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    const timer = setTimeout(() => child.kill(), 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const passed = code === 0 && !out.includes('OFFLINE-VERSTOSS');
      console.log((passed ? 'PASS ' : 'FAIL ') + label);
      if (!passed) console.log(out.slice(-4000));
      resolve({ label, passed, out });
    });
  });
  const results = [];
  const suites = [...(group !== 'browser' ? NODE_SUITES : []), ...(group !== 'node' ? BROWSER_SUITES : [])];
  for (const name of suites) results.push(await run(file(name), ['--import', guard, file(name)]));
  if (group !== 'browser') {
    const plan = await run('Wix booking CLI (two synthetic appointments)', ['--import', guard,
      'tools/NoLimits_WixBookingPlan_20261119.mjs', 'tests/fixtures/NoLimits_WixBookings_Synthetisch_20261119.json']);
    let ready = false;
    try { const r = JSON.parse(plan.out); ready = r.ready && r.summary.prepared === 2; } catch { /* reported below */ }
    if (!ready) { plan.passed = false; console.log('FAIL Wix booking plan not ready'); }
    results.push(plan);
  }
  server?.close();
  const failed = results.filter((r) => !r.passed);
  console.log('\nOFFLINE ' + group + ': ' + (results.length - failed.length) + ' von ' + results.length + ' bestanden');
  if (failed.length) process.exit(1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// NoLimits: rotation of CAL_WEBHOOK_SECRET between Cal.com and Cloudflare.
// Runs only on the operator's machine, in the operator's own terminal.
//
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs preflight
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs rotate --old-webhook-id <uuid> --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs check
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs deploy --version <id> --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs retire --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs purge --execute
//
// Secret handling: the new secret exists only in this process. It is never printed,
// written to disk or passed as an argument. No endpoint that returns an EXISTING
// secret is read: Cal.com webhooks are never listed, and the bodies of update and
// delete responses are discarded unread.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CONFIG = Object.freeze({
  script: 'nolimits-booking-test',
  webhookUrl: 'https://nolimits-booking-test.broken-haze-6cad.workers.dev/api/webhooks/cal',
  triggers: ['BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_RESCHEDULED'],
  secretName: 'CAL_WEBHOOK_SECRET',
  // IDs and timestamps only. Resolved against the repository root, not the current folder.
  stateFile: fileURLToPath(new URL('../NoLimits_rotation_state.json', import.meta.url)),
  // Order matters: the release candidate is uploaded last and stays "latest".
  sources: [
    { role: 'baseline', id: '2ed271b7-812f-489b-81a8-535644d837cc', modules: { 'worker.js': 'sha256:0bcfd53fd114cbd4' } },
    { role: 'fallback', id: '65d9b7d8-3e0c-431b-923b-7edfde9c4553', modules: { 'index.js': 'git:7cb79d65ac52b843a3042cd15752097cea95420c', 'services.js': 'git:ffb8902f2fbf6564c8ad909f1ec3278b5d1db343' } },
    { role: 'candidate', id: 'ed522b6a-d9b8-4de8-a208-91e49e6cb746', modules: { 'index.js': 'git:7cb79d65ac52b843a3042cd15752097cea95420c', 'services.js': 'git:ffb8902f2fbf6564c8ad909f1ec3278b5d1db343' } },
  ],
});
const CF = 'https://api.cloudflare.com/client/v4';
const CAL = 'https://api.cal.com/v2';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export class Abort extends Error {}
const stop = (message) => { throw new Abort(message); };

// Settings that could write request headers or bodies to a log, or weaken TLS.
export function unsafeEnvironment(env) {
  const found = ['NODE_OPTIONS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'SSLKEYLOGFILE'].filter((n) => env[n]);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') found.push('NODE_TLS_REJECT_UNAUTHORIZED');
  return found;
}
function digest(kind, buffer) {
  if (kind === 'git') return crypto.createHash('sha1').update('blob ' + buffer.length + '\0').update(buffer).digest('hex');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function modulesMatch(version, expected) {
  const found = version.modules || [];
  return found.length === Object.keys(expected).length && found.every((m) => {
    const [kind, value] = String(expected[m.name] || ':').split(':');
    return value && digest(kind, Buffer.from(m.content_base64, 'base64')).startsWith(value);
  });
}
// Names, types and plain-text values. Secret values are never part of a version response.
const shape = (version) => version.bindings.map((b) => [b.name, b.type, b.type === 'plain_text' ? b.text : ''].join('|')).sort().join('\n');

export function createContext({ env, config = CONFIG, fetch = globalThis.fetch, log = console.log,
  confirm, wait = (ms) => new Promise((r) => setTimeout(r, ms)), readState, writeState }) {
  const account = env.CF_ACCOUNT_ID, token = env.CLOUDFLARE_API_TOKEN, calKey = env.CAL_API_KEY;
  // Format checks keep a mixed-up paste from sending one service's key to the other.
  if (!/^[0-9a-f]{32}$/.test(account || '')) stop('Cloudflare Account-ID fehlt oder hat das falsche Format (32 Zeichen 0-9, a-f).');
  if (!/^[A-Za-z0-9_-]{30,}$/.test(token || '') || token.startsWith('cal_')) stop('Cloudflare API-Token fehlt oder hat das falsche Format.');
  if (calKey && !/^cal_[A-Za-z0-9_-]{8,}$/.test(calKey)) stop('Cal.com API-Key hat das falsche Format (beginnt mit cal_).');
  // Errors name method, path, status and numeric codes only: never response text.
  async function cf(path, { method = 'GET', body } = {}) {
    const res = await fetch(CF + '/accounts/' + account + path, { method, redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success === false) {
      stop('Cloudflare ' + method + ' ' + path.replace(/\?.*/, '') + ' -> HTTP ' + res.status +
        ' Codes ' + (data?.errors || []).map((e) => Number(e.code)).join(','));
    }
    return data?.result;
  }
  const cal = (path, method, body) => {
    if (!calKey) stop('CAL_API_KEY fehlt.');
    return fetch(CAL + path, { method, redirect: 'error',
      headers: { Authorization: 'Bearer ' + calKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
  };
  const discard = async (res) => { await res.body?.cancel().catch(() => {}); return res; };
  let workerId;
  async function worker() {
    if (workerId) return workerId;
    const list = await cf('/workers/workers?per_page=100');
    workerId = list.find((w) => w.name === config.script)?.id;
    return workerId || stop('Worker ' + config.script + ' nicht gefunden.');
  }
  const version = async (id) => cf('/workers/workers/' + await worker() + '/versions/' + id + '?include=modules');
  async function active() {
    const d = (await cf('/workers/scripts/' + config.script + '/deployments')).deployments[0];
    if (d.versions.length !== 1 || d.versions[0].percentage !== 100) stop('Aktives Deployment ist aufgeteilt.');
    return d.versions[0].version_id;
  }
  const deploy = (id, message) => cf('/workers/scripts/' + config.script + '/deployments', { method: 'POST',
    body: { strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }], annotations: { 'workers/message': message } } });
  return { env, config, fetch, log, confirm, wait, readState, writeState, cf, cal, discard, worker, version, active, deploy };
}

export async function preflight(ctx) {
  const { config, log } = ctx;
  const live = await ctx.active();
  if (live !== config.sources[0].id) stop('Aktiv ist ' + live + ', erwartet ' + config.sources[0].id + '. Neu inventarisieren.');
  const sources = [];
  for (const s of config.sources) {
    const v = await ctx.version(s.id);
    if (!modulesMatch(v, s.modules)) stop('Code von ' + s.role + ' (' + s.id + ') weicht vom geprueften Stand ab.');
    if (!v.bindings.some((b) => b.name === config.secretName && b.type === 'secret_text')) stop(s.role + ': Secret-Binding fehlt.');
    for (const limiter of ['RL_BOOK', 'RL_SLOTS']) if (!v.bindings.some((b) => b.name === limiter)) stop(s.role + ': ' + limiter + ' fehlt.');
    log('OK ' + s.role + ' ' + s.id + ' (' + v.bindings.length + ' Bindings, Code geprueft)');
    sources.push({ ...s, version: v });
  }
  log('OK aktiv: ' + live);
  return sources;
}

async function probe(ctx, secret) {
  // Unknown trigger: the Worker verifies the HMAC and then ignores the event. No mail, no booking.
  const body = JSON.stringify({ triggerEvent: 'NL_ROTATION_PROBE' });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    const res = await ctx.fetch(ctx.config.webhookUrl, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Cal-Signature-256': sig }, body });
    await ctx.discard(res);
    return res.status;
  } catch { return 0; }
}
async function accepted(ctx, secret, needed = 10, attempts = 60) {
  let streak = 0;
  for (let i = 0; i < attempts && streak < needed; i++) {
    streak = (await probe(ctx, secret)) === 200 ? streak + 1 : 0;
    if (streak < needed) await ctx.wait(3000);
  }
  return streak >= needed && (await probe(ctx, crypto.randomBytes(32).toString('hex'))) === 401;
}

// Disables the old webhook. The response contains its secret and is discarded unread.
async function disableOldWebhook(ctx, state) {
  const off = await ctx.discard(await ctx.cal('/webhooks/' + state.oldWebhookId, 'PATCH', { active: false }));
  if (!off.ok) stop('Alter Webhook nicht deaktiviert (HTTP ' + off.status + '). Im Cal.com-UI deaktivieren oder "retire" wiederholen.');
  state.oldDisabledAt = new Date().toISOString(); state.phase = 'rotated'; ctx.writeState(state);
  ctx.log('FERTIG. Zustellfenster pruefen: ' + state.switchedAt + ' bis ' + state.oldDisabledAt + ' (UTC).');
}

export async function rotate(ctx, { oldWebhookId } = {}) {
  const { config, log, confirm } = ctx;
  if (!ctx.env.CAL_API_KEY) stop('CAL_API_KEY fehlt.');
  if (!UUID.test(oldWebhookId || '')) stop('--old-webhook-id <uuid> des bisherigen Webhooks fehlt.');
  if (ctx.readState()) stop('Es gibt bereits eine Rotationsdatei. Erst pruefen, dann bewusst umbenennen.');
  const sources = await preflight(ctx);
  await confirm('ROTIEREN', 'Neue Versionen hochladen (ohne Deployment) und zweiten Cal.com-Webhook anlegen?');
  const secret = crypto.randomBytes(32).toString('hex');
  const startedAt = new Date().toISOString(), stamp = startedAt.replace(/\D/g, '').slice(0, 14);
  const state = { startedAt, phase: 'upload', versions: {}, newWebhookId: null, oldWebhookId };
  const save = () => ctx.writeState(state);
  save();
  const path = '/workers/workers/' + await ctx.worker() + '/versions';
  for (const s of sources) {
    const v = s.version;
    const bindings = v.bindings.map((b) => b.name === config.secretName ? { type: 'secret_text', name: b.name, text: secret }
      : b.type === 'plain_text' ? { type: 'plain_text', name: b.name, text: b.text }
        : { type: 'inherit', name: b.name, version_id: s.id });
    const created = await ctx.cf(path + '?deploy=false', { method: 'POST', body: {
      main_module: v.main_module, compatibility_date: v.compatibility_date,
      ...(v.compatibility_flags?.length ? { compatibility_flags: v.compatibility_flags } : {}),
      modules: v.modules.map(({ name, content_type, content_base64 }) => ({ name, content_type, content_base64 })),
      bindings, annotations: { 'workers/message': 'NEW webhook secret ' + stamp + ' - ' + s.role + ' from ' + s.id.slice(0, 8),
        'workers/tag': 'nl-rot-' + stamp.slice(4, 12) + '-' + s.role } } });
    const copy = await ctx.version(created.id);
    if (!modulesMatch(copy, s.modules) || shape(copy) !== shape(v)) stop(s.role + ': neue Version weicht ab. Nichts umgeschaltet.');
    state.versions[s.role] = created.id; save();
    log('OK hochgeladen ' + s.role + ': ' + created.id);
  }
  if (await ctx.active() !== sources[0].id) stop('Deployment hat sich waehrend des Uploads geaendert. Abbruch.');

  // Second webhook with its own URL (Cal.com refuses duplicates; the Worker ignores the query).
  const res = await ctx.cal('/webhooks', 'POST', { subscriberUrl: config.webhookUrl + '?k=' + stamp,
    triggers: config.triggers, active: true, secret, version: '2021-10-20' });
  if (!res.ok) { await ctx.discard(res); stop('Cal.com-Webhook nicht angelegt (HTTP ' + res.status + '). Live ist unveraendert.'); }
  const newId = (await res.json().catch(() => null))?.data?.id;
  if (!newId || String(newId) === oldWebhookId) stop('Cal.com lieferte keine neue Webhook-ID. Live ist unveraendert; im Cal.com-UI pruefen.');
  state.newWebhookId = String(newId); state.phase = 'dual-webhook'; save();
  log('OK neuer Cal.com-Webhook: ' + state.newWebhookId + ' (bis zur Umschaltung werden dessen Meldungen abgewiesen)');

  const target = state.versions.baseline;
  await confirm('UMSCHALTEN', 'DEPLOYMENT: ' + target + ' (alter Code, neues Secret) auf 100 % setzen?');
  state.switchedAt = new Date().toISOString(); state.phase = 'switching'; save();
  // The secret only exists here, so a failed switch can be retried without leaving the process.
  for (;;) {
    try {
      const live = await ctx.active();
      if (live !== target && live !== sources[0].id) stop('Unerwartetes Deployment ' + live + ' waehrend der Umschaltung.');
      if (live !== target) await ctx.deploy(target, 'Webhook secret rotation ' + stamp);
      // Probe, give the other locations a minute, then probe again.
      if (await accepted(ctx, secret)) { await ctx.wait(60000); if (await accepted(ctx, secret)) break; }
      log('Neues Secret wird noch nicht stabil akzeptiert.');
    } catch (e) { log('FEHLER ' + (e instanceof Abort ? e.message : 'unerwartet (' + e?.name + ')')); }
    state.phase = 'probe-failed'; save();
    await confirm('ERNEUT', 'ALTEN Webhook aktiv lassen, KEIN Rollback auf alte Versionen, neue Buchungen pausieren. Umschaltung erneut pruefen?');
  }
  state.verifiedAt = new Date().toISOString(); state.phase = 'verified'; save();
  log('OK neues Secret aktiv, falsche Signatur wird abgewiesen.');

  await confirm('ALT-AUS', 'Alten Cal.com-Webhook deaktivieren?');
  await disableOldWebhook(ctx, state);
  return state;
}

// State with all three new-secret versions AND the new webhook in place.
function prepared(ctx) {
  const state = ctx.readState();
  if (!state?.newWebhookId || Object.keys(state.versions || {}).length !== 3) stop('Keine vollstaendig vorbereitete Rotation gefunden.');
  return state;
}
export async function check(ctx) {
  const state = prepared(ctx), live = await ctx.active();
  if (!Object.values(state.versions).includes(live)) {
    stop('ALARM: aktiv ist ' + live + ', keine Version mit neuem Secret. (Vor der Umschaltung ist das erwartet.)');
  }
  ctx.log('OK aktiv ist eine Version mit neuem Secret: ' + live + ' (Phase ' + state.phase + ')');
  return live;
}
export async function guardedDeploy(ctx, id) {
  const state = prepared(ctx);
  if (!Object.values(state.versions).includes(id)) stop('Verweigert: ' + id + ' ist keine freigegebene Version mit neuem Secret.');
  await ctx.confirm('DEPLOY', 'DEPLOYMENT: ' + id + ' auf 100 % setzen?');
  await ctx.deploy(id, 'guarded deploy after secret rotation');
  ctx.log('OK deployt: ' + id);
}
// Only needed if "rotate" ended after the switch but before the old webhook was disabled.
export async function retire(ctx) {
  await check(ctx);
  const state = prepared(ctx);
  await ctx.confirm('ALT-AUS', 'Neue Version ist aktiv. Alten Cal.com-Webhook deaktivieren?' +
    (state.phase === 'verified' ? '' : ' ACHTUNG: Zustellung wurde nicht automatisch bestaetigt (Phase ' + state.phase + ').'));
  await disableOldWebhook(ctx, state);
}

export async function purge(ctx) {
  const state = prepared(ctx), { config, log } = ctx;
  // "verified" is allowed too: purge deletes the old webhook itself.
  if (!['verified', 'rotated'].includes(state.phase)) stop('Erst die Zustellung bestaetigen und "retire" ausfuehren (Phase ' + state.phase + ').');
  const live = await check(ctx), keep = new Set([...Object.values(state.versions), live]);
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const items = (await ctx.cf('/workers/scripts/' + config.script + '/versions?per_page=50&page=' + page)).items || [];
    all.push(...items);
    if (items.length < 50) break;
  }
  // Cut-off from Cloudflare's own clock. Later versions inherit the new secret and are kept.
  const first = all.find((v) => v.id === state.versions.baseline) || stop('Neue Rueckfallversion nicht in der Versionsliste.');
  const cutoff = Date.parse(first.metadata.created_on);
  const base = '/workers/workers/' + await ctx.worker() + '/versions/';
  const old = [];
  for (const v of all) {
    if (keep.has(v.id) || !(Date.parse(v.metadata.created_on) < cutoff)) continue;
    if ((await ctx.cf(base + v.id)).bindings.some((b) => b.name === config.secretName)) old.push(v.id);
  }
  await ctx.confirm('LOESCHEN', 'UNWIDERRUFLICH: ' + old.length + ' alte Versionen mit altem Secret und den alten Webhook loeschen?');
  const failed = []; let deleted = 0;
  for (const id of old) {
    try { await ctx.cf(base + id, { method: 'DELETE' }); deleted++; }
    catch (e) { failed.push(id); log('FEHLER ' + (e instanceof Abort ? e.message : id)); }
  }
  const hook = await ctx.discard(await ctx.cal('/webhooks/' + state.oldWebhookId, 'DELETE'));
  log('Geloescht: ' + deleted + ', fehlgeschlagen: ' + failed.length + ', alter Webhook: HTTP ' + hook.status);
  if (failed.length) stop('Nicht alle alten Versionen geloescht: ' + failed.join(', '));
  if (!hook.ok && hook.status !== 404) stop('Alter Webhook nicht geloescht. Im Cal.com-UI loeschen.');
  return { deleted };
}

// Reads one line without echoing it (prompt is shown, typed or pasted text is not).
export async function promptHidden(question, input = process.stdin, out = process.stdout) {
  let muted = false;
  const output = new Writable({ write(chunk, _e, done) { if (!muted) out.write(chunk); done(); } });
  const rl = createInterface({ input, output, terminal: true, historySize: 0 });
  const answer = new Promise((resolve) => rl.question(question, resolve));
  muted = true;
  const value = await answer; rl.close(); out.write('\n'); return value.trim();
}
export function fileState(file) {
  return {
    readState: () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
    writeState: (s) => { fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2)); fs.renameSync(file + '.tmp', file); },
  };
}

async function main() {
  const [command = 'preflight', ...args] = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const changing = ['rotate', 'deploy', 'retire', 'purge'];
  if (!['preflight', 'check', ...changing].includes(command)) stop('Unbekannter Befehl.');
  if (changing.includes(command) && !args.includes('--execute')) stop('Aendernder Befehl: nur mit --execute.');
  if (command === 'rotate' && !UUID.test(option('--old-webhook-id') || '')) stop('--old-webhook-id <uuid> fehlt.');
  const unsafe = unsafeEnvironment(process.env);
  if (unsafe.length) stop('Unsichere Umgebungsvariablen gesetzt: ' + unsafe.join(', ') + '. Neues Terminal ohne diese verwenden.');
  if (!process.stdin.isTTY) stop('Nur interaktiv in einem Terminal ausfuehren (Windows: PowerShell).');
  const env = { ...process.env };
  const ask = async (name, label) => {
    if (env[name]) console.log('Hinweis: ' + name + ' stammt aus einer Umgebungsvariable.');
    else env[name] = await promptHidden(label + ' (Eingabe bleibt unsichtbar), dann Enter: ');
  };
  await ask('CF_ACCOUNT_ID', 'Cloudflare Account-ID');
  await ask('CLOUDFLARE_API_TOKEN', 'Cloudflare API-Token');
  if (['rotate', 'retire', 'purge'].includes(command)) await ask('CAL_API_KEY', 'Cal.com API-Key');
  else delete env.CAL_API_KEY;
  const ctx = createContext({ env, ...fileState(CONFIG.stateFile),
    confirm: async (word, question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
      const answer = await new Promise((resolve) => rl.question(question + '\nZum Fortfahren ' + word + ' eingeben: ', resolve));
      rl.close();
      if (answer.trim() !== word) stop('Nicht bestaetigt. Abbruch.');
    } });
  if (command === 'preflight') await preflight(ctx);
  if (command === 'rotate') await rotate(ctx, { oldWebhookId: option('--old-webhook-id') });
  if (command === 'check') await check(ctx);
  if (command === 'deploy') await guardedDeploy(ctx, option('--version'));
  if (command === 'retire') await retire(ctx);
  if (command === 'purge') await purge(ctx);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Unexpected errors are reported by type only, so no request data can reach the log.
  const unexpected = (e) => { console.error('ABBRUCH: ' + (e instanceof Abort ? e.message : 'unerwarteter Fehler (' + e?.name + ')')); process.exit(1); };
  process.on('uncaughtException', unexpected);
  process.on('unhandledRejection', unexpected);
  main().catch(unexpected);
}

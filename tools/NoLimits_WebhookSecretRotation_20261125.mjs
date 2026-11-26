// NoLimits: rotation of CAL_WEBHOOK_SECRET between Cal.com and Cloudflare.
// Runs only on the operator's machine, in the operator's own terminal.
//
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs netcheck    (no credentials)
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs preflight
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs rotate --old-webhook-id <uuid> --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs check
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs deploy --version <id> --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs retire --execute
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs plan        (dry run for purge, read-only)
//   node tools/NoLimits_WebhookSecretRotation_20261125.mjs purge --execute
//
// Secret handling: the new secret exists only in this process. It is never printed,
// written to disk or passed as an argument. No endpoint that returns an EXISTING
// secret is read: Cal.com webhooks are never listed, and the bodies of update and
// delete responses are discarded unread.
//
// Network: the tool only talks over connections whose certificates chain to Node's
// built-in public roots. Proxies that decrypt HTTPS would see keys and the new secret,
// so they are refused before any credential is asked for.
import crypto from 'node:crypto';
import fs from 'node:fs';
import tls from 'node:tls';
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
  // Versions #37-#39, created by the rotation of 2026-11-25 (code unchanged from #32, #35, #36).
  // Order matters: the release candidate is uploaded last and stays "latest".
  sources: [
    { role: 'baseline', id: 'da2c8307-6aa8-41e5-8c37-e9a4ad282407', modules: { 'worker.js': 'sha256:0bcfd53fd114cbd4' } },
    { role: 'fallback', id: '18cf4a49-a4a1-494a-bdfe-f65132b56eed', modules: { 'index.js': 'git:7cb79d65ac52b843a3042cd15752097cea95420c', 'services.js': 'git:ffb8902f2fbf6564c8ad909f1ec3278b5d1db343' } },
    { role: 'candidate', id: '95a07dfc-6611-4879-be7d-50b1251069f4', modules: { 'index.js': 'git:7cb79d65ac52b843a3042cd15752097cea95420c', 'services.js': 'git:ffb8902f2fbf6564c8ad909f1ec3278b5d1db343' } },
  ],
  // The only versions "purge" may delete: version number -> full ID.
  purgeVersions: Object.freeze({
    22: 'f988b223-7d4f-48bb-9095-f0a88d9e3264',
    23: '0cae8d04-0a6b-48b5-81fd-cbdca2f8a3e4',
    24: '8e652436-ce73-47c7-a14a-17a2089a7810',
    25: 'a4686e38-42d8-4049-9762-77aa5e0d61e0',
    26: '97c63a20-a515-4910-8e6d-b10723de68ec',
    27: 'f2421991-aca9-4f42-9849-fe7f027492ec',
    28: '37f79082-70a7-432c-a6ba-7472adb58615',
    29: 'ab4a5ce8-7901-4eb9-b0da-2ef974e30c94',
    30: '84685d5b-0323-4850-852a-a20c38d891c0',
    31: '561f51bf-0f76-4b92-a151-6d7a49fd4588',
    32: '2ed271b7-812f-489b-81a8-535644d837cc',
    33: '93b39a98-45d8-4c3a-a625-3b7c95c010b2',
    34: '7d6401e0-392d-4679-a597-d48818e9a3ad',
    35: '65d9b7d8-3e0c-431b-923b-7edfde9c4553',
    36: 'ed522b6a-d9b8-4de8-a208-91e49e6cb746',
  }),
});
// Hard limits for "purge", independent of the list above.
export const PURGE_RANGE = Object.freeze({ first: 22, last: 36 });
const CF = 'https://api.cloudflare.com/client/v4';
const CAL = 'https://api.cal.com/v2';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export class Abort extends Error {}
const stop = (message) => { throw new Abort(message); };

// Settings that could write request headers or bodies to a log, weaken TLS or add
// further trusted certificate authorities (which would admit an HTTPS-decrypting proxy).
export function unsafeEnvironment(env, execArgv = []) {
  const found = ['NODE_OPTIONS', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'SSLKEYLOGFILE', 'NODE_EXTRA_CA_CERTS'].filter((n) => env[n]);
  if (env.NODE_USE_SYSTEM_CA && env.NODE_USE_SYSTEM_CA !== '0') found.push('NODE_USE_SYSTEM_CA');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') found.push('NODE_TLS_REJECT_UNAUTHORIZED');
  found.push(...execArgv.filter((a) => /^--(use-system-ca|use-openssl-ca|tls-keylog|inspect)/.test(a)));
  return found;
}

// ---------- Diagnostics: step, error class, network code and line. Never messages or data. ----------
const TLS_CODES = ['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'];
const safeCode = (e) => [e?.cause?.code, e?.code].find((c) => typeof c === 'string' && /^[A-Z][A-Z0-9_]{2,60}$/.test(c)) || 'unbekannt';
function hint(code) {
  if (TLS_CODES.includes(code)) return ' Das Zertifikat wird nicht von einer oeffentlichen Stelle bestaetigt (HTTPS-Pruefung durch Netz, Geraet oder Virenschutz, oder falsche Systemzeit). Anderes, vertrauenswuerdiges Netz oder Geraet verwenden; die Pruefung nicht abschalten.';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return ' Der Name wird nicht aufgeloest: Internet/DNS pruefen.';
  if (/TIMEOUT|TIMEDOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH/.test(code)) return ' Verbindung blockiert oder unterbrochen: Netz oder Firewall pruefen.';
  return '';
}
export function describeError(e, step = 'Start') {
  const name = /^[A-Za-z]{1,40}$/.test(e?.name || '') ? e.name : 'Error';
  const code = safeCode(e);
  const line = String(e?.stack || '').split('\n').filter((l) => /^\s+at /.test(l))
    .map((l) => l.match(/NoLimits_WebhookSecretRotation_\d+\.mjs:(\d+):\d+/)?.[1]).find(Boolean);
  return 'Fehler (' + name + ') im Schritt "' + step + '", Code ' + code + (line ? ', Werkzeug Zeile ' + line : '') + '.' + hint(code);
}

// TLS handshake only (nothing is sent), verified against Node's built-in roots.
const issuerOnly = (host, connect) => new Promise((resolve) => {
  const s = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
    const names = []; const seen = new Set();
    for (let c = s.getPeerCertificate(true)?.issuerCertificate; c?.subject && !seen.has(c.fingerprint256); c = c.issuerCertificate) {
      seen.add(c.fingerprint256); names.push(String(c.subject.CN || c.subject.O || '?').replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 60));
    }
    s.destroy(); resolve(names.join(' / '));
  });
  s.on('error', () => resolve('')); s.setTimeout(10000, () => { s.destroy(); resolve(''); });
});
export async function checkConnections(hosts, { connect = tls.connect, log = console.log } = {}) {
  const failed = [];
  for (const host of hosts) {
    const code = await new Promise((resolve) => {
      const s = connect({ host, port: 443, servername: host, ca: tls.rootCertificates, rejectUnauthorized: true }, () => { s.destroy(); resolve(null); });
      s.on('error', (e) => resolve(safeCode(e)));
      s.setTimeout(10000, () => { s.destroy(); resolve('ETIMEDOUT'); });
    });
    if (!code) { log('OK Verbindung ' + host); continue; }
    const issuers = TLS_CODES.includes(code) ? await issuerOnly(host, connect) : '';
    log('NICHT SICHER ' + host + ': ' + code + (issuers ? ' - Zertifikat ausgestellt von: ' + issuers : ''));
    failed.push(code);
  }
  if (failed.length) stop('Verbindungspruefung fehlgeschlagen (Code ' + failed[0] + '). Es wurden keine Zugangsdaten gesendet.' + hint(failed[0]));
}
export const HOSTS = ['api.cloudflare.com', 'api.cal.com', new URL(CONFIG.webhookUrl).host];
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
  const progress = { step: 'Vorbereitung' };
  async function send(step, url, options) {
    progress.step = step;
    try { return await fetch(url, options); }
    catch (e) { return stop('Netzwerk' + describeError(e, step).replace(/^Fehler/, 'fehler')); }
  }
  const expect = (ok, what) => ok || stop('Unerwartete Antwortform im Schritt "' + progress.step + '": ' + what + ' fehlt.');
  // Errors name method, path, status and numeric codes only: never response text.
  async function cf(path, { method = 'GET', body } = {}) {
    const step = 'Cloudflare ' + method + ' ' + path.replace(/\?.*/, '');
    const res = await send(step, CF + '/accounts/' + account + path, { method, redirect: 'error',
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
    return send('Cal.com ' + method + ' ' + path.replace(/\/webhooks\/.*/, '/webhooks/<id>'), CAL + path, { method, redirect: 'error',
      headers: { Authorization: 'Bearer ' + calKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
  };
  const discard = async (res) => { await res.body?.cancel().catch(() => {}); return res; };
  let workerId;
  async function worker() {
    if (workerId) return workerId;
    const list = await cf('/workers/workers?per_page=100');
    expect(Array.isArray(list), 'Workerliste');
    workerId = list.find((w) => w.name === config.script)?.id;
    return workerId || stop('Worker ' + config.script + ' nicht gefunden.');
  }
  const version = async (id) => {
    const v = await cf('/workers/workers/' + await worker() + '/versions/' + id + '?include=modules');
    expect(Array.isArray(v?.bindings), 'Bindings'); expect(Array.isArray(v?.modules), 'Module');
    return v;
  };
  async function active() {
    const d = (await cf('/workers/scripts/' + config.script + '/deployments'))?.deployments?.[0];
    expect(Array.isArray(d?.versions), 'Deployment');
    if (d.versions.length !== 1 || d.versions[0].percentage !== 100) stop('Aktives Deployment ist aufgeteilt.');
    return d.versions[0].version_id;
  }
  const deploy = (id, message) => cf('/workers/scripts/' + config.script + '/deployments', { method: 'POST',
    body: { strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }], annotations: { 'workers/message': message } } });
  return { env, config, fetch, progress, log, confirm, wait, readState, writeState, cf, cal, discard, worker, version, active, deploy };
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
    } catch (e) { log('FEHLER ' + (e instanceof Abort ? e.message : describeError(e, ctx.progress.step))); }
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

// Complete classic version list, oldest first. Any contradiction stops everything.
async function listVersions(ctx) {
  const all = [];
  for (let page = 1; ; page++) {
    const items = (await ctx.cf('/workers/scripts/' + ctx.config.script + '/versions?per_page=50&page=' + page))?.items;
    if (!Array.isArray(items)) stop('Unerwartete Antwortform: Versionsliste fehlt. Nichts geloescht.');
    all.push(...items);
    if (items.length < 50) break;
    if (page === 20) stop('Versionsliste ist zu lang oder die Seiten wiederholen sich. Nichts geloescht.');
  }
  const unique = (pick) => new Set(all.map(pick)).size === all.length;
  const valid = (v) => UUID.test(v?.id || '') && Number.isInteger(v.number) && v.number > 0 && Number.isFinite(Date.parse(v.metadata?.created_on));
  if (!all.every(valid) || !unique((v) => v.id) || !unique((v) => v.number)) stop('Versionsliste ist widerspruechlich. Nichts geloescht.');
  return all.sort((a, b) => a.number - b.number);
}

// Read-only. Decides what "purge" may delete and prints every version with the decision.
// Versions outside PURGE_RANGE are never requested individually.
export async function plan(ctx) {
  const state = prepared(ctx), { config, log } = ctx, { first, last } = PURGE_RANGE;
  // "verified" is allowed too: purge deletes the old webhook itself.
  if (!['verified', 'rotated'].includes(state.phase)) stop('Erst die Zustellung bestaetigen und "retire" ausfuehren (Phase ' + state.phase + ').');
  const pinned = config.purgeVersions || {}, numbers = Object.keys(pinned).map(Number), ids = new Set(Object.values(pinned));
  if (numbers.length !== last - first + 1 || ids.size !== numbers.length || [...ids].some((id) => !UUID.test(id))
    || numbers.some((n) => !Number.isInteger(n) || n < first || n > last)) {
    stop('Loeschliste muss genau die Nummern ' + first + ' bis ' + last + ' mit je einer eigenen ID enthalten. Nichts geloescht.');
  }
  if (!UUID.test(state.oldWebhookId || '') || state.oldWebhookId === state.newWebhookId) stop('ID des alten Webhooks in der Zustandsdatei ist ungueltig. Nichts geloescht.');
  const live = await check(ctx), keep = new Set([...Object.values(state.versions), live]);
  const all = await listVersions(ctx);
  for (const id of keep) {
    const v = all.find((x) => x.id === id) || stop('Geschuetzte Version ' + id + ' fehlt in der Versionsliste. Nichts geloescht.');
    if (v.number <= last || ids.has(id)) stop('Geschuetzte Version ' + id + ' liegt im Loeschbereich. Nichts geloescht.');
  }
  // Cut-off from Cloudflare's own clock.
  const cutoff = Date.parse(all.find((v) => v.id === state.versions.baseline).metadata.created_on);
  const targets = [], kept = [];
  for (const v of all) {
    if (v.number < first || v.number > last) {
      if (ids.has(v.id)) stop('Version ' + v.id + ' hat die unerwartete Nummer ' + v.number + '. Nichts geloescht.');
      kept.push(v);
      log('SCHUTZ    Nr. ' + v.number + '  ' + v.id + (keep.has(v.id) ? '  (neues Secret' + (v.id === live ? ', aktiv)' : ')') : ''));
      continue;
    }
    const name = 'Nr. ' + v.number + ' (' + v.id + ')';
    if (pinned[v.number] !== v.id) stop(name + ' hat nicht die erwartete ID. Nichts geloescht.');
    if (!(Date.parse(v.metadata.created_on) < cutoff)) stop(name + ' ist nicht aelter als die Rotation. Nichts geloescht.');
    // Classic endpoint: bindings are under resources. No fallback to another shape.
    const detail = await ctx.cf('/workers/scripts/' + config.script + '/versions/' + v.id);
    const bindings = detail?.resources?.bindings;
    if (detail?.id !== v.id || detail?.number !== v.number || !Array.isArray(bindings)) {
      stop('Unerwartete Antwortform bei ' + name + ': resources.bindings fehlt oder die Version passt nicht. Nichts geloescht.');
    }
    if (!bindings.some((b) => b?.name === config.secretName)) stop(name + ' hat kein ' + config.secretName + '. Bestand passt nicht. Nichts geloescht.');
    targets.push(v);
    log('LOESCHEN  Nr. ' + v.number + '  ' + v.id);
  }
  const gone = numbers.filter((n) => !targets.some((t) => t.number === n));
  log('Loeschkandidaten: ' + targets.length + ', geschuetzt: ' + kept.length +
    (gone.length ? ', bereits entfernt: Nr. ' + gone.join(', ') : ''));
  log('Alter Webhook (wird nur von purge geloescht): ' + state.oldWebhookId);
  return { state, targets, kept };
}

export async function purge(ctx) {
  const { log } = ctx;
  if (!ctx.env.CAL_API_KEY) stop('CAL_API_KEY fehlt.');
  const { state, targets, kept } = await plan(ctx);
  const list = targets.map((t) => t.number).join(', ') || 'keine';
  await ctx.confirm('LOESCHEN', 'UNWIDERRUFLICH: ' + targets.length + ' alte Versionen mit altem Secret (Nr. ' + list + ') und den alten Webhook loeschen?');
  await check(ctx); // the deployment may have changed while the question was open
  const base = '/workers/workers/' + await ctx.worker() + '/versions/';
  const failed = new Set();
  for (const t of targets) {
    try { await ctx.cf(base + t.id, { method: 'DELETE' }); }
    catch (e) { failed.add(t); log('FEHLER Nr. ' + t.number + ': ' + (e instanceof Abort ? e.message : describeError(e, ctx.progress.step))); }
  }
  const hook = await ctx.discard(await ctx.cal('/webhooks/' + state.oldWebhookId, 'DELETE'));
  // Trust the list, not the responses.
  const rest = new Set((await listVersions(ctx)).map((v) => v.id));
  for (const t of targets) if (rest.has(t.id)) failed.add(t);
  const deleted = targets.length - failed.size;
  log('Geloescht: ' + deleted + ', fehlgeschlagen: ' + failed.size + ', alter Webhook: HTTP ' + hook.status);
  const lost = kept.filter((v) => !rest.has(v.id));
  if (lost.length) stop('ALARM: geschuetzte Versionen fehlen: Nr. ' + lost.map((v) => v.number).join(', '));
  await check(ctx);
  if (failed.size) stop('Nicht alle alten Versionen geloescht: ' + [...failed].map((t) => 'Nr. ' + t.number + ' ' + t.id).join(', '));
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

let running = { step: 'Start' };
async function main() {
  const [command = 'preflight', ...args] = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const changing = ['rotate', 'deploy', 'retire', 'purge'];
  if (!['netcheck', 'preflight', 'check', 'plan', ...changing].includes(command)) stop('Unbekannter Befehl.');
  if (changing.includes(command) && !args.includes('--execute')) stop('Aendernder Befehl: nur mit --execute.');
  if (command === 'rotate' && !UUID.test(option('--old-webhook-id') || '')) stop('--old-webhook-id <uuid> fehlt.');
  const unsafe = unsafeEnvironment(process.env, process.execArgv);
  if (unsafe.length) stop('Unsichere Einstellungen aktiv: ' + unsafe.join(', ') + '. Variablen entfernen oder neues Terminal verwenden.');
  running.step = 'Verbindungspruefung';
  if (command === 'netcheck') return checkConnections(HOSTS);
  if (!process.stdin.isTTY) stop('Nur interaktiv in einem Terminal ausfuehren (Windows: PowerShell).');
  await checkConnections(HOSTS);
  running.step = 'Eingabe der Zugangsdaten';
  const env = { ...process.env };
  const ask = async (name, label) => {
    if (env[name]) console.log('Hinweis: ' + name + ' stammt aus einer Umgebungsvariable.');
    else env[name] = await promptHidden(label + ' (Eingabe bleibt unsichtbar), dann Enter: ');
  };
  await ask('CF_ACCOUNT_ID', 'Cloudflare Account-ID');
  await ask('CLOUDFLARE_API_TOKEN', 'Cloudflare API-Token');
  if (['rotate', 'retire', 'purge'].includes(command)) await ask('CAL_API_KEY', 'Cal.com API-Key');
  else delete env.CAL_API_KEY;
  running.step = 'Pruefung der Eingaben';
  const ctx = createContext({ env, ...fileState(CONFIG.stateFile),
    confirm: async (word, question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, historySize: 0 });
      const answer = await new Promise((resolve) => rl.question(question + '\nZum Fortfahren ' + word + ' eingeben: ', resolve));
      rl.close();
      if (answer.trim() !== word) stop('Nicht bestaetigt. Abbruch.');
    } });
  running = ctx.progress;
  if (command === 'preflight') await preflight(ctx);
  if (command === 'rotate') await rotate(ctx, { oldWebhookId: option('--old-webhook-id') });
  if (command === 'check') await check(ctx);
  if (command === 'plan') { await plan(ctx); console.log('DRY-RUN: nur gelesen, nichts geloescht oder geaendert.'); }
  if (command === 'deploy') await guardedDeploy(ctx, option('--version'));
  if (command === 'retire') await retire(ctx);
  if (command === 'purge') await purge(ctx);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Unexpected errors show step, class, code and line only, so no request data can reach the log.
  const unexpected = (e) => { console.error('ABBRUCH: ' + (e instanceof Abort ? e.message : 'unerwarteter ' + describeError(e, running.step))); process.exit(1); };
  process.on('uncaughtException', unexpected);
  process.on('unhandledRejection', unexpected);
  main().catch(unexpected);
}

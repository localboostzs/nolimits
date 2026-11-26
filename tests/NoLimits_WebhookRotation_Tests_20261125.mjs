// Offline: the rotation tool against a fake Cloudflare and Cal.com API. Probes and
// booking webhooks run through the real Worker code with the deployed version's secret.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { spawn, spawnSync } from 'node:child_process';
import { CONFIG, createContext, preflight, rotate, check, guardedDeploy, retire, purge,
  plan, PURGE_RANGE, promptHidden, unsafeEnvironment, fileState, describeError, checkConnections, HOSTS } from '../tools/NoLimits_WebhookSecretRotation_20261125.mjs';
import { createMock, secrets } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const mock = createMock();
const backends = mock.fetch;
const OLD = 'previous-secret-value', TOKEN = 'cftokenvalue_0123456789012345678901', CALKEY = 'cal_test_0123456789';
const HOOK = '11111111-2222-4333-8444-555555555555';
const ENV = { CF_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: TOKEN, CAL_API_KEY: CALKEY };
const b64 = (s) => Buffer.from(s).toString('base64');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SOURCES = [32, 35, 36].map((n) => CONFIG.purgeVersions?.[n]);
const config = { ...CONFIG, sources: CONFIG.sources.map((s, i) => ({ ...s, id: SOURCES[i], modules: { 'index.js': 'sha256:' + sha(s.role === 'baseline' ? 'old' : 'new') } })) };
const [BASE, FALL, CAND] = config.sources.map((s) => s.id);
const uid = (n) => n.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
const PINNED = CONFIG.purgeVersions;
const TARGETS = Object.values(PINNED);
const idOf = (n) => PINNED[n] ?? uid(n);
const OLDER = idOf(23);

function world({ calStatus = 201, probeFails = 0, deployFails = 0, live = BASE, undeletable = [], alterCopy = false, retries = 0 } = {}) {
  const w = { requests: [], logs: [], confirmations: [], state: null, deployments: [live], hooks: new Map(), deleted: [], seq: 0, retries };
  const mk = (id, code, vars = [], created = '2026-11-20T00:00:00Z') => ({ id, created, main_module: 'index.js', compatibility_date: '2026-11-01',
    modules: [{ name: 'index.js', content_type: 'application/javascript+module', content_base64: b64(code) }],
    secrets: { CAL_WEBHOOK_SECRET: OLD, CAL_API_KEY: 'x' },
    bindings: [{ name: 'CAL_WEBHOOK_SECRET', type: 'secret_text' }, { name: 'CAL_API_KEY', type: 'secret_text' },
      { name: 'RL_BOOK', type: 'ratelimit' }, { name: 'RL_SLOTS', type: 'ratelimit' }, ...vars] });
  // The real inventory: 1-2 without any binding, 3-21 without the webhook secret,
  // 22-36 with the previous secret (the rotation sources are among them).
  const source = { [BASE]: ['old'], [FALL]: ['new'], [CAND]: ['new', [{ name: 'NL_ALIAS_MODE', type: 'plain_text', text: 'off' }]] };
  w.versions = new Map(Array.from({ length: 36 }, (_, i) => {
    const n = i + 1, id = idOf(n), created = new Date(Date.parse('2026-11-12T00:00:00Z') + n * 3600000).toISOString();
    const [code, vars] = source[id] ?? ['older'];
    const v = { ...mk(id, code, vars, created), number: n };
    if (n <= 21) { v.secrets = {}; v.bindings = n <= 2 ? [] : [{ name: 'RL_BOOK', type: 'ratelimit' }]; }
    return [id, v];
  }));
  w.hooks.set(HOOK, { secret: OLD, active: true });
  const ok = (result, status = 200) => Response.json({ success: true, result }, { status });
  // Beta endpoint: bindings at the top, the key is missing when there are none.
  const beta = ({ secrets: _s, ...v }) => (v.bindings.length ? v : (({ bindings: _b, ...rest }) => rest)(v));
  // Classic endpoint: bindings under resources, always an array.
  const entry = (v) => ({ id: v.id, number: v.number, metadata: { created_on: v.created } });
  const classic = (v) => ({ ...entry(v), resources: { bindings: v.bindings, script: {}, script_runtime: {} } });
  // Cloudflare's clock, deliberately far from the operator's clock.
  let clock = Date.parse('2026-11-21T00:00:00Z');
  w.fetch = async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : null;
    assert.equal(opts.redirect ?? 'error', 'error');
    w.requests.push({ method, host: u.host, path: u.pathname });
    if (u.host === 'api.cloudflare.com') {
      assert.equal(opts.headers.Authorization, 'Bearer ' + TOKEN);
      const p = u.pathname.split('/accounts/')[1].split('/').slice(1).join('/');
      if (p === 'workers/workers') return ok([{ id: 'wid', name: config.script }]);
      if (p.endsWith('/deployments')) {
        if (method === 'POST') {
          if (deployFails-- > 0) return Response.json({ success: false, errors: [{ code: 10220, message: OLD }] }, { status: 400 });
          w.deployments.unshift(body.versions[0].version_id); return ok({});
        }
        return ok({ deployments: [{ versions: [{ version_id: w.deployments[0], percentage: 100 }] }] });
      }
      const scripts = 'workers/scripts/' + config.script + '/versions';
      if (p === scripts) {
        // Newest first, in pages, as Cloudflare returns it.
        const size = Number(u.searchParams.get('per_page')), page = Number(u.searchParams.get('page'));
        const sorted = [...w.versions.values()].sort((x, y) => y.number - x.number);
        return ok({ items: sorted.slice((page - 1) * size, page * size).map(entry) });
      }
      if (p.startsWith(scripts + '/')) {
        assert.equal(method, 'GET', 'the classic endpoint is only read');
        return ok(classic(w.versions.get(p.split('/').at(-1))));
      }
      if (p === 'workers/workers/wid/versions' && method === 'POST') {
        assert.equal(u.searchParams.get('deploy'), 'false');
        const number = 37 + w.seq++, id = uid(1000 + number), own = {};
        for (const b of body.bindings) {
          if (b.type === 'secret_text') own[b.name] = b.text;
          if (b.type === 'inherit') { assert.ok(b.version_id, 'inherit names its source version'); const src = w.versions.get(b.version_id).secrets[b.name]; if (src) own[b.name] = src; }
        }
        const source = w.versions.get(body.bindings.find((b) => b.type === 'inherit').version_id);
        const bindings = body.bindings.map((b) => { const o = source.bindings.find((x) => x.name === b.name);
          return b.type === 'plain_text' ? { ...b, ...(alterCopy ? { text: 'enabled' } : {}) } : { name: b.name, type: o.type }; });
        w.versions.set(id, { ...body, id, number, created: new Date(clock += 1000).toISOString(), secrets: own, bindings });
        return ok({ id });
      }
      const id = p.split('/').at(-1);
      if (method === 'DELETE') {
        if (undeletable.includes(id)) return Response.json({ success: false, errors: [{ code: 10339, message: OLD }] }, { status: 409 });
        assert.equal(p, 'workers/workers/wid/versions/' + id);
        w.versions.delete(id); w.deleted.push(id); return ok({});
      }
      return ok(beta(w.versions.get(id)));
    }
    if (u.host === 'api.cal.com') {
      assert.equal(opts.headers.Authorization, 'Bearer ' + CALKEY);
      assert.notEqual(method, 'GET', 'existing webhooks (and their secrets) are never read');
      if (method === 'POST') {
        if (calStatus !== 201) return Response.json({ message: 'conflict ' + OLD }, { status: calStatus });
        assert.ok(![...w.hooks.values()].some((h) => h.url === body.subscriberUrl));
        assert.deepEqual(body.triggers, config.triggers);
        w.hooks.set('new-hook', { secret: body.secret, active: body.active, url: body.subscriberUrl });
        return Response.json({ data: { id: 'new-hook', secret: body.secret } }, { status: 201 });
      }
      const id = u.pathname.split('/').at(-1);
      if (method === 'PATCH') w.hooks.get(id).active = body.active; else w.hooks.delete(id);
      // Cal.com echoes the secret here: reading this body would be a failure.
      const res = Response.json({ data: { secret: OLD } });
      res.json = res.text = async () => assert.fail('body of update/delete must stay unread');
      return res;
    }
    if (url === config.webhookUrl) {
      if (probeFails-- > 0) throw Error('network ' + OLD);
      return worker.fetch(new Request(url, { method, headers: opts.headers, body: opts.body }), w.versions.get(w.deployments[0]).secrets);
    }
    return assert.fail('unexpected request ' + u.host);
  };
  w.ctx = createContext({ config, env: ENV, fetch: w.fetch, log: (m) => w.logs.push(String(m)), wait: async () => {},
    readState: () => w.state && structuredClone(w.state), writeState: (s) => { w.state = structuredClone(s); },
    confirm: async (word, q) => { w.confirmations.push(word); w.logs.push(q);
      if (w.refuse === word || (word === 'ERNEUT' && w.retries-- <= 0)) throw Error('refused ' + word); } });
  w.run = () => rotate(w.ctx, { oldWebhookId: HOOK });
  w.noLeak = (extra = '') => {
    const text = w.logs.join('\n') + JSON.stringify(w.state) + extra;
    for (const s of [OLD, TOKEN, CALKEY, ...[...w.hooks.values()].map((h) => h.secret), ...[...w.versions.values()].map((v) => v.secrets.CAL_WEBHOOK_SECRET)]) {
      assert.ok(!text.includes(s), 'secret or credential in output');
    }
  };
  return w;
}

// Input checks: mixed-up or missing credentials never leave the machine.
for (const bad of [{ CLOUDFLARE_API_TOKEN: CALKEY }, { CAL_API_KEY: TOKEN }, { CF_ACCOUNT_ID: TOKEN }, { CLOUDFLARE_API_TOKEN: '' }]) {
  assert.throws(() => createContext({ env: { ...ENV, ...bad } }), (e) => !e.message.includes(TOKEN) && !e.message.includes(CALKEY));
}
assert.deepEqual(unsafeEnvironment({ NODE_DEBUG: 'http', NODE_TLS_REJECT_UNAUTHORIZED: '0' }), ['NODE_DEBUG', 'NODE_TLS_REJECT_UNAUTHORIZED']);
assert.deepEqual(unsafeEnvironment({ PATH: 'x', NODE_USE_SYSTEM_CA: '0' }), []);
assert.deepEqual(unsafeEnvironment({ NODE_USE_SYSTEM_CA: '1', NODE_EXTRA_CA_CERTS: 'c.pem' }, ['--use-system-ca']),
  ['NODE_EXTRA_CA_CERTS', 'NODE_USE_SYSTEM_CA', '--use-system-ca']);

// Regression (first real preflight): an HTTPS-decrypting proxy made fetch throw a bare
// "TypeError: fetch failed". The abort must name step and code, and nothing else.
const failing = (code) => async () => { throw new TypeError('fetch failed ' + TOKEN, { cause: Object.assign(Error('detail ' + OLD), { code }) }); };
await assert.rejects(preflight(createContext({ config, env: ENV, fetch: failing('SELF_SIGNED_CERT_IN_CHAIN'), log() {} })), (e) => {
  assert.equal(e.name, 'Error'); assert.match(e.message, /Netzwerkfehler \(TypeError\) im Schritt "Cloudflare GET \/workers\/scripts\/nolimits-booking-test\/deployments", Code SELF_SIGNED_CERT_IN_CHAIN/);
  assert.match(e.message, /nicht abschalten/);
  for (const s of [TOKEN, OLD, ENV.CF_ACCOUNT_ID, 'detail']) assert.ok(!e.message.includes(s));
  return true;
});
await assert.rejects(preflight(createContext({ config, env: ENV, fetch: failing('ENOTFOUND'), log() {} })), /Code ENOTFOUND.*DNS/);
// Unexpected response shapes name the step instead of raising a TypeError.
for (const [result, what] of [[{}, /Deployment fehlt/], [null, /Deployment fehlt/], [{ deployments: [] }, /Deployment fehlt/]]) {
  const ctx = createContext({ config, env: ENV, log() {}, fetch: async () => Response.json({ success: true, result }) });
  await assert.rejects(preflight(ctx), what);
}
for (const [path, bad, what] of [['workers/workers', { items: [] }, /Workerliste/], ['/versions/', { bindings: [] }, /Module/]]) {
  const base = world(), real = base.ctx.fetch;
  const ctx = createContext({ config, env: ENV, log() {}, fetch: (u, o) => String(u).includes(path) ? Response.json({ success: true, result: bad }) : real(u, o) });
  await assert.rejects(preflight(ctx), what);
}
// HTML instead of JSON (block page of a filter): status only, no body.
await assert.rejects(preflight(createContext({ config, env: ENV, log() {}, fetch: async () => new Response('<html>' + OLD, { status: 403 }) })),
  (e) => /HTTP 403/.test(e.message) && !e.message.includes(OLD));
// describeError never repeats messages, even for odd error objects.
{
  const odd = Object.assign(Error(TOKEN), { name: TOKEN + '!', code: 'bad code ' + OLD, cause: { code: CALKEY } });
  const text = describeError(odd, 'Test');
  assert.match(text, /Fehler \(Error\) im Schritt "Test", Code unbekannt/);
  for (const s of [TOKEN, OLD, CALKEY]) assert.ok(!text.includes(s));
}
// Connection check: built-in roots only; a failing host stops everything before any prompt.
{
  const options = [];
  const fake = (bad) => (opts, onConnect) => {
    options.push(opts); const s = new EventEmitter(); s.setTimeout = () => {}; s.destroy = () => {};
    s.getPeerCertificate = () => ({ issuerCertificate: { subject: { CN: 'Inspecting Proxy CA\u001b[31m' }, fingerprint256: 'x' } });
    queueMicrotask(() => (bad && opts.rejectUnauthorized ? s.emit('error', Object.assign(Error(OLD), { code: bad })) : onConnect()));
    return s;
  };
  const lines = [];
  await checkConnections(HOSTS, { connect: fake(null), log: (l) => lines.push(l) });
  assert.equal(lines.filter((l) => l.startsWith('OK Verbindung')).length, 3);
  assert.ok(options.every((o) => o.rejectUnauthorized === true && o.ca === tls.rootCertificates));
  lines.length = 0;
  await assert.rejects(checkConnections(HOSTS, { connect: fake('SELF_SIGNED_CERT_IN_CHAIN'), log: (l) => lines.push(l) }), /keine Zugangsdaten gesendet/);
  assert.match(lines[0], /^NICHT SICHER api\.cloudflare\.com: SELF_SIGNED_CERT_IN_CHAIN - Zertifikat ausgestellt von: Inspecting Proxy CA31m$/);
  assert.ok(!lines.join().includes(OLD) && !lines.join().includes('\u001b'));
}
await assert.rejects(rotate(world().ctx, {}), /old-webhook-id/);

// Hidden input: the pasted value is returned but never written to the terminal.
{
  const input = new PassThrough(), out = new PassThrough(); let shown = '';
  out.on('data', (c) => { shown += c; });
  const pending = promptHidden('Key: ', input, out);
  input.write(CALKEY + '\r');
  assert.equal(await pending, CALKEY);
  // A second prompt on the same terminal works and stays hidden too.
  const next = promptHidden('Token: ', input, out);
  input.write(TOKEN + '\r');
  assert.equal(await next, TOKEN);
  assert.match(shown, /Key: [\s\S]*Token: /); assert.ok(!shown.includes(CALKEY) && !shown.includes(TOKEN) && !shown.includes('cal_'));
}
// Command line: changing commands need --execute, and nothing runs without a terminal.
for (const [args, expected] of [[['rotate'], /--execute/], [['rotate', '--execute'], /old-webhook-id/], [['purge'], /--execute/], [['preflight'], /Terminal/], [['plan'], /Terminal/]]) {
  const run = spawnSync(process.execPath, ['tools/NoLimits_WebhookSecretRotation_20261125.mjs', ...args], { encoding: 'utf8', input: '', env: { ...process.env, NODE_OPTIONS: '', NODE_DEBUG: '', NODE_USE_SYSTEM_CA: '', NODE_EXTRA_CA_CERTS: '' } });
  assert.equal(run.status, 1); assert.match(run.stderr, expected);
}
{
  // The command line refuses added certificate authorities before doing anything else.
  const run = spawnSync(process.execPath, ['tools/NoLimits_WebhookSecretRotation_20261125.mjs', 'netcheck'], { encoding: 'utf8', input: '',
    env: { ...process.env, NODE_OPTIONS: '', NODE_DEBUG: '', NODE_EXTRA_CA_CERTS: '', NODE_USE_SYSTEM_CA: '1' } });
  assert.equal(run.status, 1); assert.match(run.stderr, /NODE_USE_SYSTEM_CA/); assert.equal(run.stdout, '');
}
// The whole command line "preflight": connection check, both hidden prompts, read-only
// calls and the diagnostic output. TTY, TLS and fetch are replaced inside the child.
{
  const stub = `
    import tls from 'node:tls';
    import { EventEmitter } from 'node:events';
    process.stdin.isTTY = true;
    tls.connect = (o, cb) => { const s = new EventEmitter(); s.setTimeout = () => {}; s.destroy = () => {}; queueMicrotask(cb); return s; };
    globalThis.fetch = async (url, o) => {
      if (o.method !== 'GET') throw new Error('write attempted');
      if (process.env.NL_TEST_FAIL) throw new TypeError('fetch failed ' + o.headers.Authorization, { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
      return new Response('{"success":false,"errors":[{"code":10000,"message":"x"}]}', { status: 401 });
    };`;
  const preload = 'data:text/javascript,' + encodeURIComponent(stub);
  const account = 'b'.repeat(32);
  for (const [fail, expected] of [['', /ABBRUCH: Cloudflare GET \/workers\/scripts\/nolimits-booking-test\/deployments -> HTTP 401 Codes 10000/],
    ['1', /ABBRUCH: Netzwerkfehler \(TypeError\) im Schritt "Cloudflare GET [^"]+", Code UND_ERR_CONNECT_TIMEOUT/]]) {
    const env = { ...process.env, NODE_OPTIONS: '', NODE_DEBUG: '', NODE_USE_SYSTEM_CA: '', NODE_EXTRA_CA_CERTS: '', NL_TEST_FAIL: fail,
      CF_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '', CAL_API_KEY: '' };
    const child = spawn(process.execPath, ['--import', preload, 'tools/NoLimits_WebhookSecretRotation_20261125.mjs', 'preflight'], { env });
    let out = '', err = '', step = 0;
    child.stdout.on('data', (c) => { out += c;
      if (step === 0 && out.includes('Account-ID')) { step = 1; child.stdin.write(account + '\r'); }
      else if (step === 1 && out.includes('API-Token')) { step = 2; child.stdin.write(TOKEN + '\r'); } });
    child.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => child.kill(), 20000);
    const status = await new Promise((resolve) => child.on('close', resolve));
    clearTimeout(timer);
    assert.equal(status, 1, out + err); assert.equal(step, 2); assert.match(err, expected);
    assert.equal(out.split('OK Verbindung').length - 1, 3);
    assert.ok(out.indexOf('OK Verbindung') < out.indexOf('Account-ID'), 'connections are checked before any prompt');
    for (const secretText of [TOKEN, account]) assert.ok(!(out + err).includes(secretText));
  }
}
// State file: written atomically, readable, contains no secret fields.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-rot-')), file = path.join(dir, 'state.json'), io = fileState(file);
  assert.equal(io.readState(), null); io.writeState({ phase: 'upload' }); io.writeState({ phase: 'verified' });
  assert.deepEqual(io.readState(), { phase: 'verified' }); assert.deepEqual(fs.readdirSync(dir), ['state.json']);
  fs.rmSync(dir, { recursive: true });
  assert.match(fs.readFileSync('.gitignore', 'utf8'), /^NoLimits_rotation_state\.json\r?$/m);
  assert.equal(path.dirname(CONFIG.stateFile), path.resolve('.'));
}

// Preflight: read-only, no Cal.com call.
let w = world();
await preflight(w.ctx);
assert.ok(w.requests.every((r) => r.method === 'GET' && r.host === 'api.cloudflare.com'));
await assert.rejects(preflight(world({ live: CAND }).ctx), /erwartet/);
const changed = world(); changed.versions.get(CAND).modules[0].content_base64 = b64('tampered');
await assert.rejects(preflight(changed.ctx), /weicht/);

// Declined confirmation: nothing is written.
w = world(); w.refuse = 'ROTIEREN';
await assert.rejects(w.run(), /refused/);
assert.ok(w.requests.every((r) => r.method === 'GET'));

// A copy that differs (even only in a plain-text value) stops before any webhook change.
w = world({ alterCopy: true });
await assert.rejects(w.run(), /weicht ab/); assert.equal(w.hooks.size, 1); assert.deepEqual(w.deployments, [BASE]);

// Cal.com refuses the second webhook: live stays untouched and the error is sanitised.
w = world({ calStatus: 409 });
await assert.rejects(w.run(), (e) => /HTTP 409/.test(e.message) && !e.message.includes(OLD));
assert.deepEqual(w.deployments, [BASE]); w.noLeak();
await assert.rejects(check(w.ctx), /Keine vollstaendig/);

// Stop before the switch: old webhook and live version stay as they are.
w = world(); w.refuse = 'UMSCHALTEN';
await assert.rejects(w.run(), /refused/);
assert.deepEqual(w.deployments, [BASE]); assert.equal(w.hooks.get(HOOK).active, true);
await assert.rejects(check(w.ctx), /ALARM/); await assert.rejects(retire(w.ctx), /ALARM/);

// Failed deployment, then retry inside the same process.
w = world({ deployFails: 1, retries: 1 });
await w.run();
assert.ok(w.confirmations.includes('ERNEUT')); assert.equal(w.deployments.length, 2); w.noLeak();

// Probes never succeed and the operator stops: old webhook stays active, NO rollback.
w = world({ probeFails: 1e9, retries: 2 });
await assert.rejects(w.run(), /refused ERNEUT/);
assert.equal(w.deployments.length, 2, 'deployed once, never rolled back');
assert.equal(w.hooks.get(HOOK).active, true); assert.equal(w.state.phase, 'probe-failed'); w.noLeak();
// Recovery without the secret: check, guarded deploy and retire work; purge stays blocked.
await check(w.ctx); await assert.rejects(purge(w.ctx), /retire/);
await guardedDeploy(w.ctx, w.state.versions.candidate);
await retire(w.ctx); assert.equal(w.hooks.get(HOOK).active, false); w.noLeak();

// Successful rotation.
w = world();
const state = await w.run();
assert.deepEqual(w.confirmations, ['ROTIEREN', 'UMSCHALTEN', 'ALT-AUS']);
assert.deepEqual(w.deployments, [state.versions.baseline, BASE]);
const secret = w.hooks.get('new-hook').secret;
assert.match(secret, /^[0-9a-f]{64}$/);
for (const [role, id] of Object.entries(state.versions)) {
  const v = w.versions.get(id), src = w.versions.get(config.sources.find((s) => s.role === role).id);
  assert.equal(v.secrets.CAL_WEBHOOK_SECRET, secret, role);
  assert.equal(v.secrets.CAL_API_KEY, 'x', 'other secrets inherited');
  assert.equal(v.modules[0].content_base64, src.modules[0].content_base64);
  assert.deepEqual(v.bindings.map((b) => b.name).sort(), src.bindings.map((b) => b.name).sort());
}
assert.equal(w.hooks.get(HOOK).active, false);
assert.equal(await check(w.ctx), state.versions.baseline);
await assert.rejects(w.run(), /bereits/);
w.noLeak();

// Guarded deploy refuses every version with the previous secret.
for (const id of [BASE, FALL, CAND, OLDER, idOf(1)]) await assert.rejects(guardedDeploy(w.ctx, id), /Verweigert/);
await guardedDeploy(w.ctx, state.versions.candidate);
w.deployments.unshift(BASE);
await assert.rejects(check(w.ctx), /ALARM/); await assert.rejects(purge(w.ctx), /ALARM/);
w.deployments.shift();

// ---------- Purge ----------
// The pinned list itself: exactly the numbers 22-36, full and distinct IDs.
assert.deepEqual(PURGE_RANGE, { first: 22, last: 36 });
assert.deepEqual(Object.keys(PINNED).map(Number), Array.from({ length: 15 }, (_, i) => 22 + i));
assert.equal(new Set(TARGETS).size, 15);
assert.ok(TARGETS.every((id) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)));
for (const id of ['63416086-0461-4646-b830-9615b7b3e494', '5e5435b8-a80b-47ea-8610-96229a3069d8', 'da2c8307-6aa8-41e5-8c37-e9a4ad282407',
  '18cf4a49-a4a1-494a-bdfe-f65132b56eed', '95a07dfc-6611-4879-be7d-50b1251069f4']) assert.ok(!TARGETS.includes(id));

async function rotated(options) {
  const x = world(options); await x.run();
  x.logs.length = 0; x.requests.length = 0; x.confirmations.length = 0;
  return x;
}
const listed = (x, word) => x.logs.filter((l) => l.startsWith(word + ' ')).map((l) => Number(l.match(/Nr\. (\d+)/)[1]));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const untouched = (x) => {
  assert.deepEqual(x.deleted, []);
  assert.ok(x.requests.every((r) => r.method === 'GET' && r.host === 'api.cloudflare.com'), 'nothing written');
};

// Dry run: read-only, works without a Cal.com key, lists every version with number and ID.
let p = await rotated();
const planned = await plan(p.ctx);
untouched(p); p.noLeak();
assert.deepEqual(listed(p, 'LOESCHEN'), range(22, 36));
assert.deepEqual(listed(p, 'SCHUTZ'), [...range(1, 21), 37, 38, 39]);
assert.deepEqual(planned.targets.map((t) => t.id), TARGETS);
for (const n of range(22, 36)) assert.ok(p.logs.includes('LOESCHEN  Nr. ' + n + '  ' + idOf(n)));
assert.ok(p.logs.includes('Loeschkandidaten: 15, geschuetzt: 24'));
// Root cause of the real abort: protected versions are never requested one by one.
const asked = p.requests.map((r) => r.path.match(/\/versions\/([^/]+)$/)?.[1]).filter(Boolean);
assert.deepEqual([...new Set(asked)].sort(), [...TARGETS].sort());
{
  const noKey = createContext({ config, env: { ...ENV, CAL_API_KEY: undefined }, fetch: p.fetch, log() {},
    readState: () => structuredClone(p.state), writeState: () => assert.fail('plan writes no state'), confirm: () => assert.fail('plan asks nothing') });
  assert.equal((await plan(noKey)).targets.length, 15);
  await assert.rejects(purge(noKey), /CAL_API_KEY/); untouched(p);
}
// Both real response shapes of version 2: classic has an empty array, beta has no key.
{
  const two = idOf(2);
  assert.deepEqual((await p.ctx.cf('/workers/scripts/' + config.script + '/versions/' + two)).resources.bindings, []);
  assert.equal('bindings' in await p.ctx.cf('/workers/workers/wid/versions/' + two), false);
}

// Purge deletes exactly 22-36 and the old webhook.
p = await rotated();
assert.deepEqual(await purge(p.ctx), { deleted: 15 });
assert.deepEqual(p.deleted, TARGETS);
assert.deepEqual([...p.versions.values()].map((v) => v.number).sort((x, y) => x - y), [...range(1, 21), 37, 38, 39]);
assert.ok(!p.hooks.has(HOOK) && p.hooks.has('new-hook'));
assert.deepEqual(p.confirmations, ['LOESCHEN']);
assert.ok(p.logs.some((l) => l.startsWith('UNWIDERRUFLICH: 15 alte Versionen mit altem Secret (Nr. 22, 23, ')), 'count and numbers are shown first');
assert.ok(p.logs.includes('Geloescht: 15, fehlgeschlagen: 0, alter Webhook: HTTP 200'));
assert.equal(p.requests.filter((r) => r.method === 'DELETE' && r.host === 'api.cal.com').length, 1);
p.noLeak();
// A second run finds nothing left and deletes no version.
p.deleted.length = 0; p.hooks.set(HOOK, { active: false });
assert.deepEqual(await purge(p.ctx), { deleted: 0 }); assert.deepEqual(p.deleted, []);
assert.ok(p.logs.some((l) => l.includes('bereits entfernt: Nr. 22, 23')));

// Other versions stay, even with the secret and even if they are older than the rotation.
p = await rotated();
p.versions.get(idOf(21)).bindings.push({ name: 'CAL_WEBHOOK_SECRET', type: 'secret_text' });
const later = { ...p.versions.get(p.state.versions.candidate), id: uid(2000), number: 40 };
p.versions.set(later.id, later);
await purge(p.ctx);
assert.deepEqual(p.deleted, TARGETS); assert.ok(p.versions.has(idOf(21)) && p.versions.has(later.id));
// More than one page of versions is read completely.
p = await rotated();
for (const n of range(40, 130)) p.versions.set(uid(3000 + n), { ...p.versions.get(p.state.versions.candidate), id: uid(3000 + n), number: n });
assert.equal((await plan(p.ctx)).kept.length, 24 + 91); assert.deepEqual(listed(p, 'LOESCHEN'), range(22, 36));

// Anything unexpected stops before the first deletion and before Cal.com.
const custom = (x, extra = {}) => createContext({ config, env: ENV, fetch: x.fetch, log: (m) => x.logs.push(String(m)), wait: async () => {},
  readState: () => structuredClone(x.state), writeState() {}, confirm: async (w) => { x.confirmations.push(w); }, ...extra });
const rewrite = (x, match, change) => {
  x.ctx = custom(x, { fetch: async (url, o) => {
    const res = await x.fetch(url, o);
    if (!match.test(new URL(url).pathname)) return res;
    const data = await res.json(); data.result = change(data.result); return Response.json(data);
  } });
};
const refuses = async (expected, prepare) => {
  const x = await rotated(); x.ctx = custom(x); prepare(x);
  await assert.rejects(purge(x.ctx), expected); untouched(x); assert.deepEqual(x.confirmations, []); x.noLeak();
};
const swap = (x, from, change) => { const v = x.versions.get(from); x.versions.delete(from); const next = { ...v, ...change }; x.versions.set(next.id, next); };
await refuses(/Nr\. 30 .* nicht die erwartete ID/, (x) => swap(x, idOf(30), { id: uid(4000) }));
await refuses(/unerwartete Nummer 50/, (x) => swap(x, idOf(30), { number: 50 }));
await refuses(/widerspruechlich/, (x) => swap(x, idOf(21), { number: 22 }));
await refuses(/Nr\. 28 .* kein CAL_WEBHOOK_SECRET/, (x) => { x.versions.get(idOf(28)).bindings = []; });
await refuses(/nicht aelter/, (x) => { x.versions.get(idOf(36)).created = '2027-01-01T00:00:00Z'; });
const detailPath = new RegExp('/scripts/[^/]+/versions/' + idOf(25) + '$');
for (const change of [(r) => ({ ...r, resources: undefined }), (r) => ({ id: r.id, number: r.number, bindings: r.resources.bindings }),
  (r) => ({ ...r, id: uid(1) }), (r) => ({ ...r, number: 7 }), () => null]) {
  await refuses(/Unerwartete Antwortform bei Nr\. 25/, (x) => rewrite(x, detailPath, change));
}
const listPath = /\/scripts\/[^/]+\/versions$/;
await refuses(/Versionsliste fehlt/, (x) => rewrite(x, listPath, (r) => r.items));
await refuses(/widerspruechlich/, (x) => rewrite(x, listPath, (r) => ({ items: r.items.map(({ number: _n, ...v }) => v) })));
await refuses(/fehlt in der Versionsliste/, (x) => rewrite(x, listPath, (r) => ({ items: r.items.filter((v) => v.number !== 38) })));
await refuses(/Seiten wiederholen/, (x) => rewrite(x, listPath, () => ({ items: Array.from({ length: 50 }, () => ({})) })));
await refuses(/ALARM/, (x) => x.deployments.unshift(idOf(30)));
await refuses(/ALARM/, (x) => x.deployments.unshift(idOf(5)));
await refuses(/Loeschbereich/, (x) => { x.state.versions.fallback = idOf(30); });
await refuses(/retire/, (x) => { x.state.phase = 'probe-failed'; });
await refuses(/alten Webhooks/, (x) => { x.state.newWebhookId = x.state.oldWebhookId; });
await refuses(/alten Webhooks/, (x) => { delete x.state.oldWebhookId; });
// A manipulated list can never widen the range.
const { 22: _first, ...without22 } = PINNED;
for (const purgeVersions of [{ ...PINNED, 21: idOf(21) }, { ...without22, 21: idOf(21) }, { ...without22, 37: uid(1037) },
  without22, { ...PINNED, 22: PINNED[23] }, { ...PINNED, 22: 'latest' }, {}, undefined]) {
  await refuses(/Loeschliste/, (x) => { x.ctx = custom(x, { config: { ...config, purgeVersions } }); });
}
// Declined confirmation, or the deployment changes while the question is open.
p = await rotated(); p.refuse = 'LOESCHEN';
await assert.rejects(purge(p.ctx), /refused/); untouched(p);
p = await rotated(); p.ctx = custom(p, { confirm: async () => { p.deployments.unshift(idOf(32)); } });
await assert.rejects(purge(p.ctx), /ALARM/); untouched(p);
// Cloudflare refuses some deletions: the rest is deleted, number, ID and code are reported.
const partial = await rotated({ undeletable: [idOf(24), idOf(32)] });
await assert.rejects(purge(partial.ctx), (e) => e.message.includes('Nr. 24 ' + idOf(24)) && e.message.includes('Nr. 32 ' + idOf(32)));
assert.equal(partial.deleted.length, 13);
assert.ok(partial.logs.some((l) => /FEHLER Nr\. 24: .*HTTP 409 Codes 10339/.test(l)));
assert.ok(partial.logs.includes('Geloescht: 13, fehlgeschlagen: 2, alter Webhook: HTTP 200')); partial.noLeak();
partial.logs.length = 0; await plan(partial.ctx); assert.deepEqual(listed(partial, 'LOESCHEN'), [24, 32]);
// A deletion reported as successful but still listed counts as failed.
p = await rotated();
p.ctx = custom(p, { fetch: (url, o) => (o.method === 'DELETE' && String(url).endsWith(idOf(26))
  ? Promise.resolve(Response.json({ success: true, result: {} })) : p.fetch(url, o)) });
await assert.rejects(purge(p.ctx), /Nicht alle.*Nr\. 26/);
assert.ok(p.logs.includes('Geloescht: 14, fehlgeschlagen: 1, alter Webhook: HTTP 200'));

// Delivery: Cal.com sends every event to BOTH webhooks. Exactly one signature verifies
// per Worker version, so each phase produces exactly one customer mail.
globalThis.fetch = backends;
const env = (s) => ({ ...secrets, CAL_WEBHOOK_SECRET: s });
async function deliver(oldHookHits, newHookHits) {
  const booking = mock.addBooking({ eventTypeId: 7888953, start: new Date(Date.now() + 5 * 86400000).toISOString(), email: 'kunde@example.test' });
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', createdAt: new Date().toISOString(),
    payload: { uid: booking.uid, eventTypeId: 7888953, startTime: booking.start, attendees: booking.attendees } });
  mock.mails.length = 0; const keys = [], statuses = [];
  globalThis.fetch = (u, o) => { if (String(u).includes('resend')) keys.push(o.headers['Idempotency-Key'] + '|' + o.body); return backends(u, o); };
  for (const [signedWith, handledBy] of [['old', oldHookHits], ['new', newHookHits]]) {
    const sig = crypto.createHmac('sha256', signedWith).update(body).digest('hex');
    statuses.push((await worker.fetch(new Request('https://w.test/api/webhooks/cal', { method: 'POST', headers: { 'X-Cal-Signature-256': sig }, body }), env(handledBy))).status);
  }
  return { statuses, mails: mock.mails.length, distinct: new Set(keys).size };
}
assert.deepEqual(await deliver('old', 'old'), { statuses: [200, 401], mails: 1, distinct: 1 }, 'before switch');
assert.deepEqual(await deliver('new', 'new'), { statuses: [401, 200], mails: 1, distinct: 1 }, 'after switch');
// Mixed locations during propagation: both calls reach Resend with one key and one body ...
assert.deepEqual(await deliver('old', 'new'), { statuses: [200, 200], mails: 2, distinct: 1 }, 'Resend deduplicates');
// ... and the unlucky combination loses the event: remaining risk, reconcile the window.
assert.deepEqual(await deliver('new', 'old'), { statuses: [401, 401], mails: 0, distinct: 0 }, 'gap');
console.log('PASS: rotation tool - hidden input, no secret in output, retry without rollback, guarded deploy, dry run and purge limited to versions 22-36, delivery phases');

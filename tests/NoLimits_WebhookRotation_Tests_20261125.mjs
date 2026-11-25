// Offline: the rotation tool against a fake Cloudflare and Cal.com API. Probes and
// booking webhooks run through the real Worker code with the deployed version's secret.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { CONFIG, createContext, preflight, rotate, check, guardedDeploy, retire, purge,
  promptHidden, unsafeEnvironment, fileState } from '../tools/NoLimits_WebhookSecretRotation_20261125.mjs';
import { createMock, secrets } from './NoLimits_MockBackend_20261125.mjs';
const { default: worker } = await import('../worker/src/index.js');

const mock = createMock();
const backends = mock.fetch;
const OLD = 'previous-secret-value', TOKEN = 'cftokenvalue_0123456789012345678901', CALKEY = 'cal_test_0123456789';
const HOOK = '11111111-2222-4333-8444-555555555555';
const ENV = { CF_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: TOKEN, CAL_API_KEY: CALKEY };
const b64 = (s) => Buffer.from(s).toString('base64');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const config = { ...CONFIG, sources: CONFIG.sources.map((s) => ({ ...s, modules: { 'index.js': 'sha256:' + sha(s.role === 'baseline' ? 'old' : 'new') } })) };
const [BASE, FALL, CAND] = config.sources.map((s) => s.id);

function world({ calStatus = 201, probeFails = 0, deployFails = 0, live = BASE, undeletable = [], alterCopy = false, retries = 0 } = {}) {
  const w = { requests: [], logs: [], confirmations: [], state: null, deployments: [live], hooks: new Map(), deleted: [], seq: 0, retries };
  const mk = (id, code, vars = [], created = '2026-11-20T00:00:00Z') => ({ id, created, main_module: 'index.js', compatibility_date: '2026-11-01',
    modules: [{ name: 'index.js', content_type: 'application/javascript+module', content_base64: b64(code) }],
    secrets: { CAL_WEBHOOK_SECRET: OLD, CAL_API_KEY: 'x' },
    bindings: [{ name: 'CAL_WEBHOOK_SECRET', type: 'secret_text' }, { name: 'CAL_API_KEY', type: 'secret_text' },
      { name: 'RL_BOOK', type: 'ratelimit' }, { name: 'RL_SLOTS', type: 'ratelimit' }, ...vars] });
  w.versions = new Map([mk(CAND, 'new', [{ name: 'NL_ALIAS_MODE', type: 'plain_text', text: 'off' }]), mk(FALL, 'new'), mk(BASE, 'old'),
    mk('older-version', 'older'), { ...mk('no-webhook-secret', 'x'), bindings: [] }].map((v) => [v.id, v]));
  w.hooks.set(HOOK, { secret: OLD, active: true });
  const ok = (result, status = 200) => Response.json({ success: true, result }, { status });
  const view = ({ secrets: _s, ...v }) => v;
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
      if (p === 'workers/scripts/' + config.script + '/versions') return ok({ items: [...w.versions.values()].map((v) => ({ id: v.id, metadata: { created_on: v.created } })) });
      if (p === 'workers/workers/wid/versions' && method === 'POST') {
        assert.equal(u.searchParams.get('deploy'), 'false');
        const id = 'new-' + (++w.seq), own = {};
        for (const b of body.bindings) {
          if (b.type === 'secret_text') own[b.name] = b.text;
          if (b.type === 'inherit') { assert.ok(b.version_id, 'inherit names its source version'); const src = w.versions.get(b.version_id).secrets[b.name]; if (src) own[b.name] = src; }
        }
        const source = w.versions.get(body.bindings.find((b) => b.type === 'inherit').version_id);
        const bindings = body.bindings.map((b) => { const o = source.bindings.find((x) => x.name === b.name);
          return b.type === 'plain_text' ? { ...b, ...(alterCopy ? { text: 'enabled' } : {}) } : { name: b.name, type: o.type }; });
        w.versions.set(id, { ...body, id, created: new Date(clock += 1000).toISOString(), secrets: own, bindings });
        return ok({ id });
      }
      const id = p.split('/').at(-1);
      if (method === 'DELETE') {
        if (undeletable.includes(id)) return Response.json({ success: false, errors: [{ code: 10999, message: OLD }] }, { status: 400 });
        w.versions.delete(id); w.deleted.push(id); return ok({});
      }
      return ok(view(w.versions.get(id)));
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
assert.deepEqual(unsafeEnvironment({ PATH: 'x' }), []);
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
for (const [args, expected] of [[['rotate'], /--execute/], [['rotate', '--execute'], /old-webhook-id/], [['purge'], /--execute/], [['preflight'], /Terminal/]]) {
  const run = spawnSync(process.execPath, ['tools/NoLimits_WebhookSecretRotation_20261125.mjs', ...args], { encoding: 'utf8', input: '', env: { ...process.env, NODE_OPTIONS: '', NODE_DEBUG: '' } });
  assert.equal(run.status, 1); assert.match(run.stderr, expected);
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
for (const id of [BASE, FALL, CAND, 'older-version']) await assert.rejects(guardedDeploy(w.ctx, id), /Verweigert/);
await guardedDeploy(w.ctx, state.versions.candidate);
w.deployments.unshift(BASE);
await assert.rejects(check(w.ctx), /ALARM/); await assert.rejects(purge(w.ctx), /ALARM/);
w.deployments.shift();

// Purge removes exactly the versions with the previous secret.
await purge(w.ctx);
assert.deepEqual(w.deleted.sort(), [BASE, CAND, FALL, 'older-version'].sort());
assert.ok(Object.values(state.versions).every((id) => w.versions.has(id)) && w.versions.has('no-webhook-secret'));
assert.ok(!w.hooks.has(HOOK)); w.noLeak();
assert.ok(w.logs.some((l) => /UNWIDERRUFLICH: 4 /.test(l)), 'exact count is shown before deleting');
const partial = world({ undeletable: ['older-version'] });
await partial.run();
await assert.rejects(purge(partial.ctx), /older-version/); partial.noLeak();

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
console.log('PASS: rotation tool - hidden input, no secret in output, retry without rollback, guarded deploy, purge, delivery phases');

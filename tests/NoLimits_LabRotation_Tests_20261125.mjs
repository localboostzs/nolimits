// Offline tests of the LAB webhook secret rotation. Fake Cloudflare and Cal.com only.
import assert from 'node:assert/strict';
import { LAB, labContext, labPreflight, labRotate } from '../tools/NoLimits_LabWebhookRotation_20261125.mjs';

const env = { CF_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'dummytoken_'.repeat(4), CAL_API_KEY: 'cal_test_dummy_0123456789' };
function world(options = {}) {
  const w = { calls: [], logs: [], confirms: [], secrets: [], version: 1, webhooks: ['old'], failPost: options.failPost || 0 };
  const json = (result) => Response.json({ success: true, result });
  const fetch = async (url, o = {}) => {
    const u = new URL(url), method = o.method || 'GET';
    w.calls.push(method + ' ' + u.host + u.pathname);
    assert.ok(!u.pathname.includes('nolimits-booking-test'), 'regular worker must never be addressed');
    if (u.host === 'api.cal.com') {
      assert.ok(u.pathname.startsWith('/v2/event-types/' + LAB.eventTypeId), 'only the LAB event type');
      assert.ok(!(method === 'GET' && u.pathname.includes('webhooks')), 'webhooks are never read');
      if (method === 'GET') return new Response('{}', { status: options.wrongAccount ? 404 : 200 });
      if (method === 'DELETE') { w.webhooks = []; return new Response('{"secret":"must-not-be-read"}'); }
      const body = JSON.parse(o.body);
      if (w.failPost > 0) { w.failPost--; return new Response('{}', { status: 500 }); }
      w.webhooks.push(body); return new Response(JSON.stringify({ data: body }), { status: 201 });
    }
    if (u.pathname.endsWith('/subdomain')) return json({ enabled: !!options.open, previews_enabled: false });
    if (u.pathname.endsWith('/secrets')) {
      assert.equal(method, 'PUT'); w.secrets.push(JSON.parse(o.body).text); w.version++; return json({ name: LAB.secretName, type: 'secret_text' });
    }
    if (u.pathname.endsWith('/deployments')) return json({ deployments: [{ versions: [{ version_id: options.stale ? 'other' : 'v' + w.version, percentage: 100 }] }] });
    if (u.pathname.endsWith('/workers/workers')) return json([{ name: LAB.script, id: 'lab' }]);
    if (u.pathname.endsWith('/versions/latest')) return json({ id: 'v' + w.version, modules: [], bindings: [
      { name: LAB.secretName, type: 'secret_text' }, { name: 'NL_ALIAS_STAGING_ONLY', type: 'plain_text', text: options.regular ? 'false' : 'true' }] });
    throw new Error('unexpected ' + u.pathname);
  };
  w.ctx = labContext({ env: { ...env }, fetch, log: (m) => w.logs.push(m),
    confirm: async (word) => { w.confirms.push(word); if (options.deny === word) throw new Error('denied'); } });
  w.writes = () => w.calls.filter((c) => !c.startsWith('GET '));
  return w;
}

// Success: secret first, then delete all LAB webhooks, then one new webhook with the same secret.
{
  const w = world();
  await labRotate(w.ctx);
  assert.deepEqual(w.confirms, ['LAB-ROTIEREN']);
  assert.deepEqual(w.writes().map((c) => c.split(' ')[0]), ['PUT', 'DELETE', 'POST']);
  assert.equal(w.webhooks.length, 1);
  assert.equal(w.webhooks[0].secret, w.secrets[0]);
  assert.match(w.secrets[0], /^[0-9a-f]{64}$/);
  assert.ok(w.webhooks[0].subscriberUrl.startsWith(LAB.webhookUrl + '?k='));
  const output = w.logs.join('\n');
  for (const secret of [w.secrets[0], ...Object.values(env), 'must-not-be-read']) assert.ok(!output.includes(secret));
}
// A failed webhook creation is retried with the same secret and leaves exactly one webhook.
{
  const w = world({ failPost: 1 });
  await labRotate(w.ctx);
  assert.deepEqual(w.confirms, ['LAB-ROTIEREN', 'ERNEUT']);
  assert.equal(new Set(w.secrets).size, 1);
  assert.equal(w.webhooks.length, 1);
}
// Nothing is changed when the LAB is open, stale, not the LAB worker, or the key is wrong.
for (const [options, expected] of [[{ open: true }, /nicht vollstaendig geschlossen/], [{ stale: true }, /nicht die aktive/],
  [{ regular: true }, /Falscher Worker/], [{ wrongAccount: true }, /Falsches Konto/], [{ deny: 'LAB-ROTIEREN' }, /denied/]]) {
  const w = world(options);
  await assert.rejects(labRotate(w.ctx), expected);
  assert.deepEqual(w.writes(), []);
}
{
  const w = world();
  await labPreflight(w.ctx);
  assert.deepEqual(w.writes(), []);
}
console.log('PASS: LAB rotation touches only the LAB, never reads webhooks, never prints secrets, retries safely');

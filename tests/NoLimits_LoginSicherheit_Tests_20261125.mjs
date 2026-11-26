// Offline: runs the real assets/js/account.js against a minimal DOM stub and
// checks the e-mail login handler (no raw server errors, cooldown, no double send).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/js/account.js', 'utf8');

async function run(failure) {
  let now = 1_000_000, tick = null, sends = 0;
  const elements = new Map();
  const element = () => ({ hidden: false, textContent: '', disabled: false, value: '', listeners: {},
    classList: { toggle() {} }, replaceChildren() {}, append() {},
    addEventListener(type, fn) { this.listeners[type] = fn; } });
  const get = (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const button = element();
  Object.assign(get('nl-email-form'), { elements: { email: { value: ' kunde@example.test ' } }, querySelector: () => button });
  Object.assign(get('nl-profile-form'), { elements: {}, querySelector: () => element() });
  const window = { NOLIMITS_ACCOUNT: { enabled: true, user: async () => null,
    socialProviderStatus: async () => ({ google: true }),
    emailSignIn: async (email) => { sends++; assert.equal(email, 'kunde@example.test'); if (failure) throw failure; } } };
  vm.runInNewContext(source, { window, URLSearchParams, CustomEvent: class {},
    document: { getElementById: get, addEventListener() {}, dispatchEvent() {} },
    location: { origin: 'https://example.test', pathname: '/konto/', search: '', hash: '' }, history: {},
    Date: { now: () => now }, setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = null; } });
  const submit = () => get('nl-email-form').listeners.submit({ preventDefault() {} });
  await submit();
  return { submit, button, status: () => get('nl-status').textContent, sends: () => sends,
    advance: (s) => { now += s * 1000; tick?.(); } };
}

// Success: neutral text (no account enumeration), 10s lock, second click sends nothing.
let t = await run(null);
assert.match(t.status(), /Falls dein Postfach zugelassen ist/);
assert.equal(t.button.disabled, true);
await t.submit(); assert.equal(t.sends(), 1);
t.advance(11); assert.equal(t.button.disabled, false);
await t.submit(); assert.equal(t.sends(), 2);

// Server throttle with seconds: lock for that time, capped at 120.
for (const [seconds, lock] of [[29, 29], [5000, 120]]) {
  t = await run({ message: `For security purposes, you can only request this after ${seconds} seconds.` });
  t.advance(lock - 1); assert.equal(t.button.disabled, true);
  await t.submit(); assert.equal(t.sends(), 1);
  t.advance(2); assert.equal(t.button.disabled, false);
}
// Mail quota and unknown errors: German text only; Supabase stays the enforcing control.
for (const failure of [{ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' },
  { message: 'Database error: secret_internal_detail', code: 'unexpected_failure' }]) {
  t = await run(failure);
  assert.doesNotMatch(t.status(), /rate limit|secret_internal_detail|Database/i);
  assert.match(t.status(), /Versandlimit wurde erreicht|konnte nicht versendet werden/);
  assert.equal(t.button.disabled, false);
}
console.log('PASS: e-mail login handler - neutral success text, cooldown, no double send, no raw errors');

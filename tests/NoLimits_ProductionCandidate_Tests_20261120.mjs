// The release candidate is only deployed after explicit approval. It must target the
// existing Worker and keep rate limiting; alias bookings on, duplicate-prone ICS off.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=fs.readFileSync('worker/wrangler.production-candidate.toml','utf8');
const stage=fs.readFileSync('worker/wrangler.alias-staging.toml','utf8');
assert.match(config,/^name = "nolimits-booking-test"$/m);
assert.match(stage,/^name = "nolimits-alias-staging"$/m);
// Alias bookings keep Cal.com's own mails and links away from customers.
for (const line of ['NL_ALIAS_MODE = "enabled"','NL_ALIAS_DOMAIN = "localboost-zs.ch"','NL_ALIAS_PREFIX = "info"','NL_ALIAS_SEPARATOR = "+"']) {
  assert.ok(config.split(/\r?\n/).includes(line), line);
  assert.ok(stage.split(/\r?\n/).includes(line), 'same as the tested LAB: ' + line);
}
assert.doesNotMatch(config,/NL_ALIAS_STAGING_ONLY/);
assert.match(config,/^NL_ICS_ENABLED = "false"$/m);
assert.match(config,/^NL_PUBLIC_SITE_BASE = "https:\/\/localboostzs.github.io\/nolimits"$/m);
assert.match(config,/^ALLOWED_ORIGINS = "https:\/\/localboostzs.github.io"$/m);
assert.match(config,/name = "RL_BOOK"[\s\S]*namespace_id = "1001"[\s\S]*limit = 5, period = 60/);
assert.match(config,/name = "RL_SLOTS"[\s\S]*namespace_id = "1002"[\s\S]*limit = 60, period = 60/);
assert.doesNotMatch(config,/^(?:route|routes|account_id|zone_id)\s*=/m,'no implicit custom domain or account targets');
assert.doesNotMatch(config,/^\s*(?:CAL_API_KEY|CAL_WEBHOOK_SECRET|RESEND_API_KEY|NL_MANAGE_SECRET|NL_SUPABASE_SECRET_KEY)\s*=/m);
console.log('PASS: existing live Worker target with matching rate limits, alias on, ICS off, no secrets');

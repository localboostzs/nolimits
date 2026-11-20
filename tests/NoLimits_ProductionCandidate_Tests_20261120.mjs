// Production release candidate is inert until explicit approval.
// It must target the existing Worker ID and preserve all rate-limiting,
 // while the alias and duplicate-prone ICS feature are disabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=fs.readFileSync('worker/wrangler.production-candidate.toml','utf8');
const stage=fs.readFileSync('worker/wrangler.alias-staging.toml','utf8');
assert.match(config,/^name = "nolimits-booking-test"$/m);
assert.match(stage,/^name = "nolimits-alias-staging"$/m);
assert.match(config,/^NL_ALIAS_MODE = "off"$/m);
assert.match(config,/^NL_ICS_ENABLED = "false"$/m);
assert.match(config,/^NL_PUBLIC_SITE_BASE = "https:\/\/localboostzs.github.io\/nolimits"$/m);
assert.match(config,/^ALLOWED_ORIGINS = "https:\/\/localboostzs.github.io"$/m);
assert.match(config,/name = "RL_BOOK"[\s\S]*namespace_id = "1001"[\s\S]*limit = 5, period = 60/);
assert.match(config,/name = "RL_SLOTS"[\s\S]*namespace_id = "1002"[\s\S]*limit = 60, period = 60/);
assert.doesNotMatch(config,/^(?:route|routes|account_id|zone_id)\s*=/m,'no implicit custom domain or account targets');
assert.doesNotMatch(config,/^\s*(?:CAL_API_KEY|CAL_WEBHOOK_SECRET|RESEND_API_KEY|NL_MANAGE_SECRET|NL_SUPABASE_SECRET_KEY)\s*=/m);
assert.ok(!config.includes('NL_ALIAS_MODE = "enabled"'),'must never deploy enabled by default');
console.log('PASS: existing live Worker target with matching rate limits and strictly disabled alias/ICS, no secrets');

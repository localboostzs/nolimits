#!/usr/bin/env node
// Netlify "ignore" command: exit 0 skips the build, any other exit code builds.
// Every production deploy costs credits on the free plan, so documents, tests and server
// code must not trigger one. In case of doubt the site is built.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { CACHED_COMMIT_REF: before, COMMIT_REF: now, CONTEXT: context } = process.env;
// Only the production branch is built. Deploy previews and branch deploys would publish
// unreviewed pages under public *.netlify.app addresses; the free plan cannot protect them.
if (context && context !== 'production') process.exit(0);
if (!before || !now || before === now) process.exit(1); // first build or manual retry
const site = fs.readFileSync(path.join(here, 'NoLimits_public_allowlist.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const diff = spawnSync('git', ['diff', '--quiet', before, now, '--', ...site, 'deploy', 'netlify.toml'],
  { cwd: path.resolve(here, '..') });
process.exit(diff.status === 0 ? 0 : 1);

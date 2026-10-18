#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * inbuxa: how much of the console is still upstream's, measured against
 * BASE, the upstream release this fork started from. The console no longer
 * takes upstream changes, and is being rewritten until none of upstream's
 * code is left (inbuxa-drafts/specs/console-rewrite-plan.md); each PR of that
 * work states how far it moved these numbers.
 *
 *   node tools/divergence.mjs           the summary, for HEAD
 *   node tools/divergence.mjs <ref>     the summary, for another commit
 *   node tools/divergence.mjs --files   also each file with upstream lines left
 *
 * Lines are counted from git's diff, without package-lock.json or binary
 * files. "Not upstream's" is every line but upstream's: ours, and third-party
 * code such as components taken from shadcn/ui.
 *
 * A file whose header named Stalwart Labs at BASE and no longer does has been
 * rewritten, and none of its lines count as upstream's: the header only
 * changes once the rewrite is done. A rewrite still shares some lines with
 * upstream's file (blank lines, imports, closing brackets, and class lists
 * both took from shadcn/ui), so the summary prints how many, to keep the
 * claim checkable.
 */
import { execFileSync } from 'node:child_process';

// Upstream's web interface v1.0.11, the release this fork started from.
const BASE = process.env.DIVERGENCE_BASE || 'dc462b137fbee9c2193946a6db554ff20bcc9b07';
const EXCLUDE = [':!package-lock.json'];
const DUAL_HEADER = '^\\s*(\\*|//|#)\\s*SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL';
const UPSTREAM_HOLDER = 'SPDX-FileCopyrightText:.*Stalwart Labs';

const args = process.argv.slice(2);
const showFiles = args.includes('--files');
const ref = args.find((a) => !a.startsWith('--')) ?? 'HEAD';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const empty = git('hash-object', '-t', 'tree', '/dev/null').trim();

/** Per-file [added, deleted] between two trees, binary files left out. */
function numstat(from, to) {
  const out = new Map();
  for (const line of git('diff', '--numstat', '--no-renames', from, to, '--', '.', ...EXCLUDE).split('\n')) {
    const [a, d, path] = line.split('\t');
    if (!path || a === '-') continue;
    out.set(path, [Number(a), Number(d)]);
  }
  return out;
}

const sum = (m, i) => [...m.values()].reduce((n, v) => n + v[i], 0);

/** Files at `at` whose lines match `pattern`, as a set of paths. */
function grepFiles(pattern, at) {
  try {
    return new Set(
      git('grep', '-l', '-E', pattern, at, '--')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.slice(at.length + 1)),
    );
  } catch {
    // git grep exits 1 when nothing matches
    return new Set();
  }
}

const baseFiles = numstat(empty, BASE);
const changes = numstat(BASE, ref);
const forkLines = sum(numstat(empty, ref), 0);
const upstreamLines = sum(baseFiles, 0);

const headed = grepFiles(UPSTREAM_HOLDER, BASE);
const stillUpstream = grepFiles(UPSTREAM_HOLDER, ref);
const left = [];
let rewritten = 0;
let shared = 0;
for (const [path, [lines]] of baseFiles) {
  const n = lines - (changes.get(path)?.[1] ?? 0);
  if (n <= 0) continue;
  if (!headed.has(path) || stillUpstream.has(path)) left.push([n, path]);
  else {
    rewritten += 1;
    shared += n;
  }
}
left.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
const upstreamLeft = left.reduce((n, [l]) => n + l, 0);
const notUpstream = forkLines - upstreamLeft;
const dual = grepFiles(DUAL_HEADER, ref).size;

const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const n = (x) => x.toLocaleString('en-US');
console.log(`Against upstream v1.0.11 (${BASE.slice(0, 7)}), at ${git('rev-parse', '--short', ref).trim()}:`);
console.log(`  not upstream's:       ${pct(notUpstream, forkLines)} (${n(notUpstream)} of ${n(forkLines)} lines)`);
console.log(`  upstream lines left:  ${n(upstreamLeft)} of ${n(upstreamLines)}, in ${n(left.length)} files`);
console.log(`  dual-header files:    ${n(dual)}`);
console.log(`  rewritten files:      ${n(rewritten)}, sharing ${n(shared)} lines with upstream's`);
if (showFiles) {
  console.log('');
  for (const [l, path] of left) console.log(`${String(l).padStart(6)}  ${path}`);
}

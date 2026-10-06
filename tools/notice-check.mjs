#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Coffey Labs
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * inbuxa: fails when an upstream file this fork changed doesn't say so
 * (AGPL section 5(a)), as inbuxa-server's tools/fork/notice-check.py does
 * for the server.
 *
 *   node tools/notice-check.mjs          check; exit 1 on a missing notice
 *   node tools/notice-check.mjs --fix    add the notice where it's missing
 *
 * The AGPL asks a modified work to carry a prominent notice that it was
 * modified, with a date. Every upstream file this fork changes carries one
 * beneath upstream's own notice:
 *
 *    * Modified by Coffey Labs in 2026 for INBUXA.
 *
 * "Changed" is measured against BASE, the upstream release this fork is
 * built on, so the list is what actually differs rather than a guess. A file
 * counts as upstream's when its header names Stalwart Labs as a copyright
 * holder; files the fork wrote carry their own copyright and need nothing.
 * When a newer upstream release is merged, move BASE to it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Upstream's web interface v1.0.11, the release this fork started from.
const BASE = process.env.NOTICE_BASE || 'dc462b137fbee9c2193946a6db554ff20bcc9b07';

const HEADER_LINES = 15;
const UPSTREAM_HOLDER = /SPDX-FileCopyrightText:.*Stalwart Labs/;
const NOTICE = /Modified by Coffey Labs in \d{4}/;
const LICENSE_LINE = /^(\s*(?:\*|\/\/|#)\s*)SPDX-License-Identifier:.*$/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function changedUpstreamFiles() {
  try {
    git('cat-file', '-e', `${BASE}^{commit}`);
  } catch {
    console.error(`notice-check: ${BASE} is not in this history; fetch it in full first`);
    process.exit(2);
  }
  // Against the working tree, so it also checks work not yet committed; in
  // CI the two are the same. Renames count: a moved and edited file is
  // still upstream's.
  const out = [];
  for (const line of git('diff', '--name-status', '-M', '--diff-filter=MR', BASE).split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts[0] === 'R100') continue; // moved, not changed
    const path = parts[parts.length - 1];
    let head;
    try {
      head = readFileSync(path, 'utf8').split('\n').slice(0, HEADER_LINES);
    } catch {
      continue;
    }
    if (head.some((l) => UPSTREAM_HOLDER.test(l))) out.push({ path, head });
  }
  return out;
}

/** Put the notice under the license line, in that comment's own style. */
function addNotice(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let n = 0; n < Math.min(lines.length, HEADER_LINES); n++) {
    const m = LICENSE_LINE.exec(lines[n]);
    if (m) {
      const prefix = m[1];
      const year = new Date().getFullYear();
      lines.splice(n + 1, 0, prefix.trimEnd(), `${prefix}Modified by Coffey Labs in ${year} for INBUXA.`);
      writeFileSync(path, lines.join('\n'));
      return true;
    }
  }
  return false;
}

const fix = process.argv.includes('--fix');
const files = changedUpstreamFiles();
let missing = files.filter(({ head }) => !head.some((l) => NOTICE.test(l))).map(({ path }) => path);

if (fix) {
  const unfixable = missing.filter((p) => !addNotice(p));
  for (const p of missing.filter((p) => !unfixable.includes(p)).sort()) console.log(`added: ${p}`);
  missing = unfixable;
}

if (missing.length) {
  console.log(`${missing.length} upstream file(s) changed against ${BASE.slice(0, 7)} without the modification notice:\n`);
  for (const p of missing) console.log(`  ${p}`);
  console.log('\nAdd "Modified by Coffey Labs in <year> for INBUXA." under the license line, or run npm run notice:fix.');
  process.exit(1);
}
console.log(`notice check: clean (${files.length} changed upstream file(s), all marked; against ${BASE.slice(0, 7)}).`);

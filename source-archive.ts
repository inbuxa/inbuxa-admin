/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * The AGPL's offer, for this build: the exact source it was built from,
 * written next to the app as `source.tar.gz`, and an identity for it that the
 * interface shows with the download link.
 *
 * "Exact" includes uncommitted work, new files too: every file git doesn't
 * ignore is written into a throwaway index, never the real one, and the tree
 * that makes is what gets archived. A clean tree is HEAD's tree. Outside a git
 * checkout (a release tarball, say), the project files are packed as they are.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

const EXCLUDE = ['node_modules', 'dist', '.git', '.ignore', 'coverage'];

function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, { cwd, env: env ?? process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** The tree this build is made from: its git tree id, and a name that says whether it has uncommitted work. */
export function sourceIdentity(root: string): { ref: string | null; id: string } {
  try {
    git(['rev-parse', '--is-inside-work-tree'], root);
  } catch {
    return { ref: null, id: 'unversioned' };
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'inbuxa-source-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
    git(['read-tree', 'HEAD'], root, env);
    git(['add', '--all', '.'], root, env);
    const tree = git(['write-tree'], root, env);
    const headTree = git(['rev-parse', 'HEAD^{tree}'], root);
    const head = git(['rev-parse', '--short=12', 'HEAD'], root);
    return tree === headTree ? { ref: tree, id: head } : { ref: tree, id: `${head}+local-${tree.slice(0, 12)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function sourceArchive(root: string, name: string, identity: { ref: string | null; id: string }): Plugin {
  return {
    name: 'inbuxa-source-archive',
    apply: 'build',
    closeBundle() {
      const outDir = path.join(root, 'dist');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const out = path.join(outDir, 'source.tar.gz');
      const prefix = `${name}-${identity.id}/`;
      if (identity.ref) {
        execFileSync('git', ['archive', '--format=tar.gz', `--prefix=${prefix}`, '-o', out, identity.ref], { cwd: root });
      } else {
        execFileSync(
          'tar',
          [...EXCLUDE.map((e) => `--exclude=./${e}`), `--transform=s,^\\.,${prefix.slice(0, -1)},`, '-czf', out, '.'],
          { cwd: root },
        );
      }
    },
  };
}

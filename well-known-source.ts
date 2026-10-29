// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * inbuxa: writes `.well-known/source` into the build, in the form
 * https://coffeylabs.org/specs/well-known-source/ gives it: the console's
 * public repository and the commit it was built from.
 *
 * The commit comes from INBUXA_REVISION, which the image build and the
 * deploy pass in; neither has a .git to ask. A build without a full commit id
 * writes nothing, since a repository without a revision doesn't name the
 * build.
 */
import type { Plugin } from 'vite'

export const REPOSITORY = 'https://git.coffeylabs.org/inbuxa/inbuxa-admin'

/** A full commit id: 40 hex digits (SHA-1) or 64 (SHA-256). */
export function isCommitId(revision: string | undefined): revision is string {
  return revision !== undefined && /^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)
}

/** The document for a build of `version` at `revision`, if it names one. */
export function sourceDocument(version: string, revision: string | undefined): string | undefined {
  if (!isCommitId(revision)) return undefined
  return `${JSON.stringify(
    {
      version: 1,
      software: [
        { name: 'inbuxa Admin', version, license: 'AGPL-3.0-only', repository: REPOSITORY, revision },
      ],
    },
    null,
    2,
  )}\n`
}

export function wellKnownSource(version: string): Plugin {
  return {
    name: 'inbuxa-well-known-source',
    apply: 'build',
    generateBundle() {
      const source = sourceDocument(version, process.env.INBUXA_REVISION)
      if (source) this.emitFile({ type: 'asset', fileName: '.well-known/source', source })
    },
  }
}

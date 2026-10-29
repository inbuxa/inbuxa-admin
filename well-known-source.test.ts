// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { REPOSITORY, sourceDocument } from './well-known-source'

const COMMIT = '808e6e4c2a1d5e8b7f6a9c0d1e2f3a4b5c6d7e8f'

describe('.well-known/source', () => {
  it('names the repository and the commit', () => {
    const doc = JSON.parse(sourceDocument('27.1-rc.2', COMMIT)!)
    expect(doc).toEqual({
      version: 1,
      software: [
        { name: 'inbuxa Admin', version: '27.1-rc.2', license: 'AGPL-3.0-only', repository: REPOSITORY, revision: COMMIT },
      ],
    })
  })

  it('says nothing without a full commit id', () => {
    for (const revision of [undefined, '', '808e6e4', 'v27.1-rc.2', COMMIT.replace(/f/g, 'g')]) {
      expect(sourceDocument('27.1-rc.2', revision)).toBeUndefined()
    }
  })
})

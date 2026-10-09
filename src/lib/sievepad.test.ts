/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { isSieveScriptField, playgroundUrl, sievepadLink } from './sievepad';

function decode(link: string): unknown {
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get('w') ?? '';
  return JSON.parse(inflateRawSync(Buffer.from(token, 'base64url')).toString('utf8'));
}

describe('playgroundUrl', () => {
  it('names the bundled playground, by content hash, beside the console', () => {
    const url = new URL(playgroundUrl());
    expect(url.origin).toBe(new URL(document.baseURI).origin);
    expect(url.pathname).toMatch(/\/sieve-playground\/[0-9a-f]{16}\/index\.html$/);
  });
});

describe('sievepadLink', () => {
  it('encodes the script as a single main entry', async () => {
    const source = 'require "imap4flags";\r\naddflag "\\\\Seen";\r\n';
    const link = await sievepadLink('Filters é', source);

    expect(link.startsWith(`${playgroundUrl()}#w=`)).toBe(true);
    expect(link.slice(`${playgroundUrl()}#w=`.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decode(link)).toEqual({
      v: 1,
      name: 'Filters é',
      scripts: [{ name: 'main', source: 'require "imap4flags";\naddflag "\\\\Seen";\n' }],
      messages: [],
      settings: {},
    });
  });

  it('carries the interpreter settings it is given', async () => {
    const link = await sievepadLink('Filters', 'keep;', { cpuLimit: 5000, capabilities: ['fileinto'] });
    expect((decode(link) as { settings: unknown }).settings).toEqual({ cpuLimit: 5000, capabilities: ['fileinto'] });
  });

  it('truncates long workspace names', async () => {
    const link = await sievepadLink('x'.repeat(200), 'keep;');
    expect((decode(link) as { name: string }).name).toHaveLength(80);
  });
});

describe('isSieveScriptField', () => {
  it('matches only the known script fields', () => {
    expect(isSieveScriptField('x:SieveUserScript', 'contents')).toBe(true);
    expect(isSieveScriptField('x:SieveSystemScript', 'contents')).toBe(true);
    expect(isSieveScriptField('SieveScript', 'blobId')).toBe(true);
    expect(isSieveScriptField('SieveScript', 'name')).toBe(false);
    expect(isSieveScriptField('x:Domain', 'contents')).toBe(false);
  });
});

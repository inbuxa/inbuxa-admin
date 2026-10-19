/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { isSieveScriptField, playgroundUrl, sievepadLink } from './sievepad';

/** What the playground reads back out of a link. */
function workspaceIn(link: string) {
  const w = new URL(link).hash.match(/^#w=([A-Za-z0-9_-]+)$/)?.[1];
  if (!w) throw new Error(`no workspace in ${link}`);
  return JSON.parse(inflateRawSync(Buffer.from(w, 'base64url')).toString('utf8'));
}

describe('the playground link', () => {
  it('points at the playground shipped beside the console', () => {
    const url = new URL(playgroundUrl());
    expect(url.origin).toBe(new URL(document.baseURI).origin);
    expect(url.pathname).toMatch(/\/sieve-playground\/[0-9a-f]{16}\/index\.html$/);
  });

  it('carries the script as the main entry, with Unix line ends', async () => {
    const link = await sievepadLink('Vacation ✈', 'if true {\r\n  keep;\r\n}\r\n');
    expect(link.startsWith(`${playgroundUrl()}#w=`)).toBe(true);
    expect(workspaceIn(link)).toEqual({
      v: 1,
      name: 'Vacation ✈',
      scripts: [{ name: 'main', source: 'if true {\n  keep;\n}\n' }],
      messages: [],
      settings: {},
    });
  });

  it("carries the interpreter's settings", async () => {
    const settings = { maxInstructions: 1000, extensions: ['vacation'] };
    expect(workspaceIn(await sievepadLink('s', 'keep;', settings)).settings).toEqual(settings);
  });

  it('cuts the name to 80 characters', async () => {
    expect(workspaceIn(await sievepadLink('n'.repeat(81), 'keep;')).name).toBe('n'.repeat(80));
  });

  it('holds a large script', async () => {
    const source = Array.from({ length: 5000 }, (_, i) => `# rule ${i} ${Math.random()}`).join('\n');
    expect(workspaceIn(await sievepadLink('big', source)).scripts[0].source).toBe(source);
  });
});

describe('isSieveScriptField', () => {
  it.each([
    ['x:SieveUserScript', 'contents', true],
    ['x:SieveSystemScript', 'contents', true],
    ['SieveScript', 'blobId', true],
    ['SieveScript', 'contents', false],
    ['x:SieveUserScript', 'name', false],
    ['x:Domain', 'contents', false],
  ])('%s.%s → %s', (object, field, expected) => {
    expect(isSieveScriptField(object, field)).toBe(expected);
  });
});

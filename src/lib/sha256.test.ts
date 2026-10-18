/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { sha256 } from './sha256';

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const digest = (s: string) => hex(sha256(new TextEncoder().encode(s)));

describe('sha256', () => {
  // Digests from an independent implementation (Python's hashlib).
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['ünïcödé ✓', 'aec840a69bab19009d54142263564850641d84635514a193da3948f5de76178c'],
  ])('hashes %j', (input, expected) => {
    expect(digest(input)).toBe(expected);
  });

  // 55 bytes is the most that pads into one block; 56 and 64 need a second.
  it.each([
    [55, '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    [56, 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    [64, 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    [1000, '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'],
  ])('hashes %i bytes across the block boundary', (length, expected) => {
    expect(digest('a'.repeat(length))).toBe(expected);
  });

  it('matches crypto.subtle on random input', async () => {
    for (const length of [1, 43, 63, 65, 128, 300]) {
      const data = crypto.getRandomValues(new Uint8Array(length));
      const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      expect(hex(sha256(data))).toBe(hex(expected));
    }
  });
});

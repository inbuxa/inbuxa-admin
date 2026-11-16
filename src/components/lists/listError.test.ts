/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { listErrorOf } from './listError';

const noTracer = { type: 'invalidArguments', description: 'No log tracers configured on the server' };

describe('listErrorOf', () => {
  it('explains a server with no log files on the Logs list', () => {
    expect(listErrorOf('x:Log', noTracer, 'Unknown error')).toEqual({ kind: 'noLogTracer' });
  });

  it('shows the same error on any other list as the server worded it', () => {
    expect(listErrorOf('x:Domain', noTracer, 'Unknown error')).toEqual({
      kind: 'message',
      message: 'No log tracers configured on the server',
    });
  });

  it('prefers the description to the type, and falls back to the type', () => {
    expect(listErrorOf('x:Log', { type: 'forbidden', description: 'Not allowed' }, '?')).toEqual({
      kind: 'message',
      message: 'Not allowed',
    });
    expect(listErrorOf('x:Log', { type: 'serverFail' }, '?')).toEqual({ kind: 'message', message: 'serverFail' });
    expect(listErrorOf('x:Log', {}, 'Unknown error')).toEqual({ kind: 'message', message: 'Unknown error' });
  });
});

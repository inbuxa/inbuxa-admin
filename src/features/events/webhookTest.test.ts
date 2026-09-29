/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { describeTestAnswer } from './webhookTest';

describe('describeTestAnswer', () => {
  it('says what came back', () => {
    expect(describeTestAnswer({ sent: true, status: 204, ms: 84 })).toBe(
      'Delivered: the receiver answered 204 in 84 ms.',
    );
    expect(describeTestAnswer({ sent: false, status: 403 })).toBe(
      'Not accepted: the receiver answered 403. Check the sign-in details or signature key.',
    );
    expect(describeTestAnswer({ sent: false, error: 'connection refused' })).toBe('Not delivered: connection refused');
  });
});

/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { interpreterFor, playgroundSettings } from './sieveLimits';

const CAPABILITIES = [
  'fileinto',
  'vacation',
  'duplicate',
  'variables',
  'comparator-elbonia',
  'vnd.inbuxa.while',
  'vnd.inbuxa.expressions',
];

describe('interpreterFor', () => {
  it('runs system scripts on the system interpreter and the rest on the user one', () => {
    expect(interpreterFor('x:SieveSystemScript')).toBe('system');
    expect(interpreterFor('x:SieveUserScript')).toBe('user');
    expect(interpreterFor('SieveScript')).toBe('user');
  });
});

describe('playgroundSettings', () => {
  it('gives account scripts the live limits, without while or the disabled extensions', () => {
    const settings = playgroundSettings(
      'user',
      {
        disableCapabilities: { duplicate: true },
        maxCpuCycles: 5000,
        maxNestedForEvery: 3,
        maxStringLength: 4096,
        maxVarNameLength: 32,
        maxScriptSize: 102400,
        protectedHeaders: { Received: true, 'Auto-Submitted': true },
        allowedNotifyUris: ['mailto'],
        defaultSubject: 'Automated reply',
        defaultExpiryVacation: 2592000000,
        defaultExpiryDuplicate: 604800000,
        dkimSignDomain: { else: 'false' },
      },
      CAPABILITIES,
    );
    expect(settings).toEqual({
      capabilities: ['fileinto', 'vacation', 'variables', 'comparator-elbonia', 'vnd.inbuxa.expressions'],
      cpuLimit: 5000,
      maxNestedForeverypart: 3,
      maxStringSize: 4096,
      maxVariableNameSize: 32,
      maxScriptSize: 102400,
      maxReceivedHeaders: 4294967295,
      protectedHeaders: ['Received', 'Auto-Submitted'],
      validNotificationUris: ['mailto'],
      vacationDefaultSubject: 'Automated reply',
      defaultVacationExpiry: 2592000,
      defaultDuplicateExpiry: 604800,
    });
  });

  it('gives system scripts while, no mailbox actions and the fixed compiler limits', () => {
    const settings = playgroundSettings(
      'system',
      { maxCpuCycles: 1048576, maxVarSize: 52428800, duplicateExpiry: 604800000, noCapabilityCheck: true },
      CAPABILITIES,
    );
    expect(settings.capabilities).toEqual([
      'variables',
      'comparator-elbonia',
      'vnd.inbuxa.while',
      'vnd.inbuxa.expressions',
    ]);
    expect(settings).toMatchObject({
      noCapabilityCheck: true,
      cpuLimit: 1048576,
      maxVariableSize: 52428800,
      defaultDuplicateExpiry: 604800,
      maxStringSize: 52428800,
      maxHeaderSize: 10240,
      maxIncludes: 10,
      validNotificationUris: ['mailto'],
    });
  });

  it('leaves out what the server did not send', () => {
    expect(playgroundSettings('user', {}, CAPABILITIES)).toEqual({
      capabilities: ['fileinto', 'vacation', 'duplicate', 'variables', 'comparator-elbonia', 'vnd.inbuxa.expressions'],
      maxReceivedHeaders: 4294967295,
    });
  });
});

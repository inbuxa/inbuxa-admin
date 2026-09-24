/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
  describeApplyFailure,
  describeRequestFailure,
  describeServerReload,
  registryWrites,
  reloadActionFor,
  reloadActionsFor,
  serverAppliesWrite,
  writesRegistry,
} from './settingsApply';
import type { JmapMethodResponse } from '@/types/jmap';

describe('reloadActionFor', () => {
  it('reloads settings objects', () => {
    expect(reloadActionFor('x:MtaDeliverySchedule')).toBe('ReloadSettings');
    expect(reloadActionFor('x:SpamPyzor')).toBe('ReloadSettings');
    expect(reloadActionFor('x:NetworkListener')).toBe('ReloadSettings');
  });

  it('reloads a type it has never heard of', () => {
    expect(reloadActionFor('x:SomethingNew')).toBe('ReloadSettings');
  });

  it('uses the narrower action where one exists', () => {
    expect(reloadActionFor('x:Certificate')).toBe('ReloadTlsCertificates');
    expect(reloadActionFor('x:StoreLookup')).toBe('ReloadLookupStores');
    expect(reloadActionFor('x:MemoryLookupKeyValue')).toBe('ReloadLookupStores');
    expect(reloadActionFor('x:BlockedIp')).toBe('ReloadBlockedIps');
  });

  it('skips what the server reloads on write', () => {
    expect(reloadActionFor('x:Directory')).toBeNull();
    expect(reloadActionFor('x:Authentication')).toBeNull();
  });

  it('reloads allowed IPs in full: they are part of the settings, not the blocked list', () => {
    expect(reloadActionFor('x:AllowedIp')).toBe('ReloadSettings');
  });

  it('skips data read live, operations and stores', () => {
    for (const type of [
      'Account',
      'Alert',
      'DnsServer',
      'Domain',
      'DkimSignature',
      'Enterprise',
      'SpamLlm',
      'Tenant',
      'Action',
      'QueuedMessage',
      'DataStore',
      'MetricsStore',
      'TracingStore',
    ]) {
      expect(reloadActionFor(`x:${type}`)).toBeNull();
    }
  });

  it('ignores anything outside the registry', () => {
    expect(reloadActionFor('Email')).toBeNull();
    expect(reloadActionFor('inbuxa:ProtocolPolicy')).toBeNull();
  });
});

describe('reloadActionsFor', () => {
  it('collapses duplicates and puts settings last', () => {
    expect(reloadActionsFor(['x:MtaRoute', 'x:Certificate', 'x:MtaDeliverySchedule', 'x:Account'])).toEqual([
      'ReloadTlsCertificates',
      'ReloadSettings',
    ]);
  });
});

describe('registry writes', () => {
  it('recognizes an x: set call among others', () => {
    expect(writesRegistry([['x:MtaRoute/get', {}, '0']])).toBe(false);
    expect(
      writesRegistry([
        ['Blob/upload', {}, 'b'],
        ['x:MtaRoute/set', {}, '0'],
      ]),
    ).toBe(true);
  });

  it('reports only the types a response changed', () => {
    const responses: JmapMethodResponse[] = [
      ['Blob/upload', { created: { b: {} } }, 'b'],
      ['x:MtaRoute/set', { created: null, updated: { a: null }, destroyed: null }, '0'],
      ['x:SpamPyzor/set', { created: {}, updated: {}, destroyed: [], notUpdated: { singleton: {} } }, '1'],
      ['x:Certificate/set', { destroyed: ['c1'] }, '2'],
      ['error', { type: 'serverFail' }, '3'],
    ];
    expect(registryWrites(responses)).toEqual([{ objectName: 'x:MtaRoute' }, { objectName: 'x:Certificate' }]);
  });

  it("reads the server's own reload report where there is one", () => {
    const responses: JmapMethodResponse[] = [
      ['x:MtaRoute/set', { updated: { a: null }, 'x:settingsReload': { applied: true } }, '0'],
      [
        'x:Tracer/set',
        {
          created: { t: { id: 't1' } },
          'x:settingsReload': { applied: false, description: 'Saved, but the running settings were not reloaded. x' },
        },
        '1',
      ],
      ['x:Domain/set', { created: { d: { id: 'd1' } } }, '2'],
      ['x:MtaHook/set', { updated: { h: null }, 'x:settingsReload': 'yes' }, '3'],
    ];
    expect(registryWrites(responses)).toEqual([
      { objectName: 'x:MtaRoute', serverReload: { applied: true } },
      {
        objectName: 'x:Tracer',
        serverReload: { applied: false, description: 'Saved, but the running settings were not reloaded. x' },
      },
      { objectName: 'x:Domain' },
      // Not the shape a server sends: treated as absent.
      { objectName: 'x:MtaHook' },
    ]);
  });

  it('leaves applying to the server when it reported, except for allowed IPs', () => {
    expect(serverAppliesWrite({ objectName: 'x:MtaRoute', serverReload: { applied: true } })).toBe(true);
    expect(serverAppliesWrite({ objectName: 'x:MtaRoute', serverReload: { applied: false } })).toBe(true);
    expect(serverAppliesWrite({ objectName: 'x:MtaRoute' })).toBe(false);
    expect(serverAppliesWrite({ objectName: 'x:AllowedIp', serverReload: { applied: true } })).toBe(false);
  });
});

describe('describeServerReload', () => {
  it('drops the lead-in the banner already says and names the object', () => {
    expect(
      describeServerReload({
        applied: false,
        description:
          'Saved, but the running settings were not reloaded. Tracer with id b: Only one console tracer is allowed',
      }),
    ).toEqual({
      message: 'Tracer with id b: Only one console tracer is allowed',
      object: { object: 'Tracer', id: 'b' },
    });
  });

  it('keeps a description it does not recognize, and copes with none', () => {
    expect(describeServerReload({ applied: false, description: 'Store unavailable' })).toEqual({
      message: 'Store unavailable',
    });
    expect(describeServerReload({ applied: false })).toEqual({ message: 'The server did not reload its settings.' });
  });
});

describe('describeApplyFailure', () => {
  it('keeps the server message and the object it named', () => {
    expect(
      describeApplyFailure({
        type: 'validationFailed',
        description: 'Failed to resolve Pyzor host',
        objectId: { object: 'SpamPyzor', id: 'singleton' },
      }),
    ).toEqual({ message: 'Failed to resolve Pyzor host', object: { object: 'SpamPyzor', id: 'singleton' } });
  });

  it('spells out validation errors when there is no description', () => {
    const failure = describeApplyFailure({
      type: 'validationFailed',
      objectId: { object: 'MtaRoute', id: 'b' },
      validationErrors: [{ type: 'Required', property: 'address' }],
    });
    expect(failure.message).toBe('address: This field is required.');
    expect(failure.object).toEqual({ object: 'MtaRoute', id: 'b' });
  });

  it('falls back to the error type', () => {
    expect(describeApplyFailure({ type: 'forbidden' }).message).toBe(
      'You do not have permission to perform this action.',
    );
  });
});

describe('describeRequestFailure', () => {
  it('reads thrown errors and method errors', () => {
    expect(describeRequestFailure(new Error('Network down')).message).toBe('Network down');
    expect(describeRequestFailure({ type: 'forbidden', description: 'No' }).message).toBe('No');
    expect(describeRequestFailure(undefined).message).toBe('The server did not answer.');
  });
});

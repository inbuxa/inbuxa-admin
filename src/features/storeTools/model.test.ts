/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  changeActions,
  changeFromServer,
  checkFromServer,
  cleanupKept,
  isBusy,
  checkProblemCount,
  isUnresolved,
  newestFirst,
  planBlocked,
  parseLimit,
  snapshotFromServer,
  type ChangeStatus,
} from './model';

/** A store check as the server sends one (store-check spec, "The object"). */
const CHECK = {
  id: 'b',
  mode: 'full',
  blobsPerSecond: 1000,
  bytesPerSecond: 20000000,
  status: 'done',
  createdAt: '2026-11-10T01:00:00Z',
  finishedAt: '2026-11-10T01:05:00Z',
  createdBy: 'admin',
  node: '2',
  progress: 1,
  blobsChecked: 1200,
  linksChecked: 1300,
  bytesRead: 5000000,
  messagesChecked: 3,
  missing: 1500,
  damaged: 1,
  unlinked: 0,
  unreadable: 0,
  problems: [
    {
      kind: 'missing',
      accountId: 'c',
      accountName: 'jane@example.com',
      object: 'email',
      objectId: 42,
      blobId: 'ab12',
      committed: true,
      detail: '',
    },
    {
      kind: 'missing',
      accountId: null,
      accountName: '',
      object: 'queuedMessage',
      objectId: 7,
      blobId: 'cd34',
      committed: false,
    },
  ],
  error: null,
};

describe('store check', () => {
  it('reads what the server sends', () => {
    const c = checkFromServer(CHECK);
    expect(c.mode).toBe('full');
    expect(c.status).toBe('done');
    expect(c.problems).toHaveLength(2);
    expect(c.problems[0]).toMatchObject({ accountId: 'c', objectId: '42', committed: true });
    // A queued message belongs to no account.
    expect(c.problems[1]).toMatchObject({ accountId: null, object: 'queuedMessage', committed: false, detail: '' });
  });

  it('counts every problem, not just the 1,000 kept', () => {
    expect(checkProblemCount(checkFromServer(CHECK))).toBe(1501);
  });

  it('keeps an unknown status or kind from breaking the page', () => {
    const c = checkFromServer({ id: 'x', status: 'later', problems: [{ kind: 'odd' }], progress: 7 });
    expect(c.status).toBe('running');
    expect(c.mode).toBe('quick');
    expect(c.progress).toBe(1);
    expect(c.problems[0].kind).toBe('missing');
  });
});

describe('store snapshot', () => {
  it('reads what the server sends', () => {
    const s = snapshotFromServer({
      id: 'a',
      status: 'done',
      createdAt: '2026-11-10T01:30:00Z',
      finishedAt: '2026-11-10T01:30:04Z',
      createdBy: 'admin',
      node: '1',
      name: '20261110T013000Z',
      path: '/var/lib/inbuxa/data/snapshots/20261110T013000Z',
      holds: ['data', 'blobs'],
      size: 1024,
      blobFiles: 12,
      error: null,
    });
    expect(s).toMatchObject({ status: 'done', holds: ['data', 'blobs'], size: 1024, blobFiles: 12, error: null });
  });
});

describe('blob store change', () => {
  const change = (status: ChangeStatus) =>
    changeFromServer({
      id: 'a',
      from: 'filesystem /srv/blobs (depth 2)',
      to: 'data store',
      changedAt: '2026-11-10T00:00:00Z',
      node: '1',
      status,
      problems: [{ kind: 'damaged', blobId: 'ef', holder: 'email', accountId: 'c', objectId: 3, detail: 'hash' }],
    });

  it('reads what the server sends', () => {
    const c = change('incomplete');
    expect(c.copyStartedAt).toBeNull();
    expect(c.problems[0]).toMatchObject({ kind: 'damaged', holder: 'email', accountId: 'c', objectId: '3' });
  });

  it('is unresolved until copied or moved back (BM-3, BM-4)', () => {
    const unresolved: ChangeStatus[] = ['pending', 'copying', 'incomplete', 'stopped', 'failed', 'interrupted'];
    for (const s of unresolved) expect(isUnresolved(change(s)), s).toBe(true);
    expect(isUnresolved(change('copied'))).toBe(false);
    expect(isUnresolved(change('reverted'))).toBe(false);
  });

  it('offers a copy while unresolved, a stop while copying, and a dismissal unless copying (BM-5 to BM-7)', () => {
    expect(changeActions(change('pending'))).toEqual({
      copy: true,
      stop: false,
      dismiss: true,
      apply: false,
      cleanUp: false,
    });
    expect(changeActions(change('incomplete'))).toEqual({
      copy: true,
      stop: false,
      dismiss: true,
      apply: false,
      cleanUp: false,
    });
    expect(changeActions(change('copying'))).toEqual({
      copy: false,
      stop: true,
      dismiss: false,
      apply: false,
      cleanUp: false,
    });
    expect(changeActions(change('copied'))).toEqual({
      copy: false,
      stop: false,
      dismiss: true,
      apply: false,
      cleanUp: false,
    });
    expect(changeActions(change('reverted'))).toEqual({
      copy: false,
      stop: false,
      dismiss: true,
      apply: false,
      cleanUp: false,
    });
  });

  it('reads a change from before copy ahead as changed (CA-1)', () => {
    const c = change('pending');
    expect(c).toMatchObject({ stage: 'changed', copiedAhead: null, appliedAt: null });
  });

  const planned = (status: ChangeStatus, extra: Record<string, unknown> = {}) =>
    changeFromServer({
      id: 'p',
      stage: 'planned',
      from: 'data store',
      to: 'filesystem /srv/new (depth 2)',
      changedAt: null,
      node: null,
      status,
      ...extra,
    });

  it('never reads a planned change through, and applies it only once a copy ahead ended copied (CA-3, CA-7)', () => {
    const c = planned('pending');
    expect(c).toMatchObject({ stage: 'planned', changedAt: null, node: null });
    expect(isUnresolved(c)).toBe(false);
    expect(changeActions(c)).toEqual({ copy: true, stop: false, dismiss: true, apply: false, cleanUp: false });
    expect(changeActions(planned('copying'))).toEqual({
      copy: false,
      stop: true,
      dismiss: false,
      apply: false,
      cleanUp: false,
    });
    expect(changeActions(planned('incomplete')).apply).toBe(false);
    expect(changeActions(planned('copied'))).toEqual({
      copy: true,
      stop: false,
      dismiss: true,
      apply: true,
      cleanUp: false,
    });
    expect(changeActions(planned('copied', { appliedAt: '2026-11-10T01:00:00Z', appliedBy: 'admin' })).apply).toBe(
      false,
    );
  });

  it('keeps what the copy ahead did (CA-5)', () => {
    const c = changeFromServer({
      id: 'p',
      stage: 'changed',
      status: 'pending',
      copiedAhead: {
        startedAt: '2026-11-10T00:00:00Z',
        finishedAt: '2026-11-10T00:10:00Z',
        status: 'copied',
        copied: 7,
        alreadyThere: 2,
        bytesCopied: 900,
        problems: 0,
      },
    });
    expect(c.copiedAhead).toMatchObject({ status: 'copied', copied: 7, alreadyThere: 2, bytesCopied: 900 });
  });

  it('offers a cleanup only for a copied change whose old store is kept (OC-1, OC-3)', () => {
    const copied = (extra: Record<string, unknown>) =>
      changeFromServer({ id: 'a', from: 'old', to: 'new', status: 'copied', ...extra });
    expect(changeActions(copied({})).cleanUp).toBe(false);
    expect(copied({}).oldStoreKept).toBe(false);
    expect(changeActions(copied({ oldStoreKept: true }))).toEqual({
      copy: false,
      stop: false,
      dismiss: true,
      apply: false,
      cleanUp: true,
    });
    expect(changeActions(changeFromServer({ id: 'b', status: 'pending', oldStoreKept: true })).cleanUp).toBe(false);
    expect(changeActions(planned('copied', { oldStoreKept: true })).cleanUp).toBe(false);
  });

  it('reads a cleanup, and stops rather than dismisses while one runs (OC-4 to OC-6)', () => {
    const c = changeFromServer({
      id: 'a',
      status: 'copied',
      oldStoreKept: true,
      problems: [],
      cleanup: {
        status: 'running',
        dryRun: false,
        startedAt: '2026-11-10T02:00:00Z',
        startedBy: 'admin',
        finishedAt: null,
        node: '1',
        progress: 0.5,
        blobsChecked: 40,
        deleted: 30,
        bytesFreed: 9000,
        notThere: 5,
        missing: 1,
        damaged: 2,
        different: 3,
        unreadable: 0,
        problems: [{ kind: 'different', blobId: 'ab', holder: 'temporary', detail: 'sizes differ' }],
        snapshotsBefore: 2,
        error: null,
      },
    });
    expect(c.cleanup).toMatchObject({ status: 'running', deleted: 30, bytesFreed: 9000, snapshotsBefore: 2 });
    expect(c.cleanup?.problems[0].kind).toBe('different');
    expect(cleanupKept(c.cleanup!)).toBe(6);
    expect(isBusy(c)).toBe(true);
    expect(changeActions(c)).toEqual({ copy: false, stop: true, dismiss: false, apply: false, cleanUp: false });
  });

  it('plans one change at a time, and none while another is unresolved (CA-1)', () => {
    expect(planBlocked([])).toBeNull();
    expect(planBlocked([change('copied'), change('reverted')])).toBeNull();
    expect(planBlocked([change('pending')])).toBe('unresolved');
    expect(planBlocked([planned('pending')])).toBe('planned');
  });
});

describe('limits', () => {
  it('sends nothing for empty, a whole number otherwise, and refuses the rest', () => {
    expect(parseLimit('')).toBeNull();
    expect(parseLimit(' 0 ')).toBe(0);
    expect(parseLimit('500')).toBe(500);
    expect(parseLimit('1.5')).toBe('invalid');
    expect(parseLimit('-1')).toBe('invalid');
    expect(parseLimit('20MB')).toBe('invalid');
  });
});

it('lists newest first', () => {
  const items = [{ at: '2026-11-09T00:00:00Z' }, { at: '2026-11-10T00:00:00Z' }, { at: '2026-11-08T00:00:00Z' }];
  expect(newestFirst(items, (i) => i.at).map((i) => i.at.slice(8, 10))).toEqual(['10', '09', '08']);
});

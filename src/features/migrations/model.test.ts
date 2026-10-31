/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  actions,
  attention,
  emptyForm,
  fileName,
  formProblem,
  fromServer,
  looksLikeGoogleKey,
  ordered,
  parseAccounts,
  percent,
  resumes,
  secretKind,
  startable,
  toCreate,
  toForm,
  toPatch,
  type Migration,
} from './model';

/** A migration as the server sends one: the fields a get with no properties returns. */
const WIRE = {
  id: 'b',
  description: 'From the old Dovecot',
  sourceKind: 'imap',
  source: { url: 'imaps://old.example.org', login: '{email}*master', cleartext: false, tenant: '', clientId: '' },
  accounts: ['a@example.org', 'b@example.org'],
  createAccounts: true,
  parallel: 4,
  status: 'idle',
  run: 'move',
  result: 'unfinished',
  error: null,
  progress: { total: 2, finished: 1, unfinished: 1, read: 6, written: 5, failed: 1 },
  failures: [{ email: 'b@example.org', step: 'export', detail: '1 message over the size limit' }],
  nodeId: '7',
  heartbeat: '2026-10-30T20:00:30Z',
  moved: true,
  diskUsed: 2048,
  passwordsWaiting: true,
  reportBlobId: 'blob1',
  createdAt: '2026-10-30T19:58:00Z',
  createdBy: 'admin@example.com',
  startedAt: '2026-10-30T20:00:00Z',
  finishedAt: '2026-10-30T20:01:00Z',
};

const migration = (over: Partial<Migration> = {}): Migration => ({ ...fromServer(WIRE), ...over });

describe('fromServer', () => {
  it('reads every field the server sends', () => {
    const m = fromServer(WIRE);
    expect(m.sourceKind).toBe('imap');
    expect(m.source.login).toBe('{email}*master');
    expect(m.progress).toEqual({ total: 2, finished: 1, unfinished: 1, read: 6, written: 5, failed: 1 });
    expect(m.failures[0].step).toBe('export');
    expect(m.nodeId).toBe('7');
    expect(m.reportBlobId).toBe('blob1');
  });

  it('keeps going on what an older or newer server leaves out', () => {
    const m = fromServer({ id: 'c', sourceKind: 'something-new', status: 'paused', run: null });
    expect(m.sourceKind).toBe('imap');
    expect(m.status).toBe('idle');
    expect(m.run).toBeNull();
    expect(m.accounts).toEqual([]);
    expect(m.parallel).toBe(4);
    expect(m.failures).toEqual([]);
  });
});

describe('ordered', () => {
  it('puts running ones first, then the newest, closed ones last', () => {
    const list = [
      migration({ id: 'old', createdAt: '2026-10-01T00:00:00Z' }),
      migration({ id: 'closed', status: 'closed', createdAt: '2026-10-31T00:00:00Z' }),
      migration({ id: 'new', createdAt: '2026-10-29T00:00:00Z' }),
      migration({ id: 'running', status: 'running', createdAt: '2026-09-01T00:00:00Z' }),
    ];
    expect(ordered(list).map((m) => m.id)).toEqual(['running', 'new', 'old', 'closed']);
  });
});

describe('parseAccounts', () => {
  it('reads pasted lines and a CSV with a header, lowercased, each once', () => {
    expect(parseAccounts('A@example.org\nb@example.org, c@example.org\n\na@example.org').accounts).toEqual([
      'a@example.org',
      'b@example.org',
    ]);
    const csv = 'name,email\r\nAnn,"ann@example.org"\r\nBob,bob@example.org\r\n';
    expect(parseAccounts(csv)).toEqual({ accounts: ['ann@example.org', 'bob@example.org'], bad: [] });
  });

  it('says which lines looked meant as an address and weren’t', () => {
    expect(parseAccounts('a@example.org\nbroken@\nb@nodot').bad).toEqual(['broken@', 'b@nodot']);
  });
});

describe('formProblem', () => {
  const form = { ...emptyForm(), url: 'imaps://old.example.org', accounts: 'a@example.org' };

  it('passes a filled-in form', () => {
    expect(formProblem(form)).toBeNull();
  });

  it('names what the server would refuse first', () => {
    expect(formProblem({ ...form, url: 'old.example.org' })).toBe('imapUrl');
    expect(formProblem({ ...form, login: 'master' })).toBe('imapLogin');
    expect(formProblem({ ...form, sourceKind: 'jmap', url: 'imaps://x' })).toBe('jmapUrl');
    expect(formProblem({ ...form, sourceKind: 'microsoft', tenant: 'contoso' })).toBe('microsoft');
    expect(formProblem({ ...form, accounts: '' })).toBe('noAccounts');
    expect(formProblem({ ...form, accounts: 'a@example.org\nnope@' })).toBe('badAccounts');
    expect(formProblem({ ...form, parallel: 17 })).toBe('parallel');
  });

  it('asks Google for nothing but the accounts; its key is the secret', () => {
    expect(formProblem({ ...form, sourceKind: 'google', url: '' })).toBeNull();
  });
});

describe('toCreate and toPatch', () => {
  it('sends only the source fields the kind uses', () => {
    const create = toCreate({
      ...emptyForm(),
      sourceKind: 'microsoft',
      url: 'imaps://left.over',
      tenant: ' contoso.onmicrosoft.com ',
      clientId: 'app-1',
      accounts: 'A@contoso.com',
    });
    expect(create.source).toEqual({
      url: '',
      login: '',
      cleartext: false,
      tenant: 'contoso.onmicrosoft.com',
      clientId: 'app-1',
    });
    expect(create.accounts).toEqual(['a@contoso.com']);
  });

  it('sends what changed and nothing else', () => {
    const m = migration({ moved: false });
    expect(toPatch(toForm(m), m)).toEqual({});
    const f = { ...toForm(m), description: 'Renamed', accounts: 'a@example.org\nb@example.org\nc@example.org' };
    expect(toPatch(f, m)).toEqual({
      description: 'Renamed',
      accounts: ['a@example.org', 'b@example.org', 'c@example.org'],
    });
  });

  it('leaves the source alone once accounts were moved', () => {
    const m = migration({ moved: true });
    const f = { ...toForm(m), url: 'imaps://elsewhere.example.org', parallel: 8 };
    expect(toPatch(f, m)).toEqual({ parallel: 8 });
  });
});

describe('actions', () => {
  it('runs, edits and closes only while idle', () => {
    const idle = actions(migration());
    expect(idle).toMatchObject({ preview: true, move: true, finalPass: true, stop: false, edit: true, close: true });
    const running = actions(migration({ status: 'running' }));
    expect(running).toMatchObject({
      preview: false,
      move: false,
      stop: true,
      edit: false,
      close: false,
      report: false,
    });
  });

  it('offers a new secret once a run has used one', () => {
    expect(actions(migration()).newSecret).toBe(true);
    expect(actions(migration({ run: null })).newSecret).toBe(false);
    expect(actions(migration({ status: 'running' })).newSecret).toBe(false);
    expect(startable(migration())).toEqual(['preview', 'move', 'finalPass']);
    expect(startable(migration({ moved: false }))).toEqual(['preview', 'move']);
  });

  it('offers the final pass only after a move', () => {
    expect(actions(migration({ moved: false })).finalPass).toBe(false);
  });

  it('offers the passwords while they wait, and the report once there is one', () => {
    expect(actions(migration()).passwords).toBe(true);
    expect(actions(migration({ passwordsWaiting: false, reportBlobId: null }))).toMatchObject({
      passwords: false,
      report: false,
    });
    expect(actions(migration({ status: 'closed' })).passwords).toBe(false);
  });
});

describe('resumes', () => {
  it('is a move cut short', () => {
    expect(resumes(migration({ run: 'move', result: 'interrupted' }))).toBe(true);
    expect(resumes(migration({ run: 'move', result: 'done' }))).toBe(false);
    expect(resumes(migration({ run: 'preview', result: 'stopped' }))).toBe(false);
  });
});

describe('secretKind', () => {
  it('asks each source for its own secret', () => {
    expect(secretKind(migration())).toBe('password');
    expect(secretKind(migration({ sourceKind: 'jmap', source: { ...migration().source, login: '' } }))).toBe('apiKey');
    expect(secretKind(migration({ sourceKind: 'jmap' }))).toBe('password');
    expect(secretKind(migration({ sourceKind: 'microsoft' }))).toBe('clientSecret');
    expect(secretKind(migration({ sourceKind: 'google' }))).toBe('googleKey');
  });

  it('knows a Google key file when it sees one', () => {
    const key = { type: 'service_account', client_email: 'm@p.iam.gserviceaccount.com', private_key: '-----BEGIN' };
    expect(looksLikeGoogleKey(JSON.stringify(key))).toBe(true);
    expect(looksLikeGoogleKey('{"type":"authorized_user"}')).toBe(false);
    expect(looksLikeGoogleKey('not json')).toBe(false);
  });
});

describe('attention', () => {
  const now = new Date('2026-10-30T20:02:00Z');

  it('says nothing about a migration that is fine', () => {
    const fine = migration({ result: 'done', passwordsWaiting: false });
    expect(attention(fine, now)).toEqual([]);
    expect(attention(migration({ status: 'running', heartbeat: '2026-10-30T20:01:40Z' }), now)).toEqual([]);
    expect(attention(migration({ status: 'closed', result: 'failed' }), now)).toEqual([]);
  });

  it('names accounts that didn’t finish, and the passwords waiting', () => {
    expect(attention(migration(), now)).toEqual([{ kind: 'unfinished', count: 1 }, { kind: 'passwords' }]);
  });

  it('says a run failed, or was cut off by a restart', () => {
    const failed = migration({ result: 'failed', error: 'no such host', passwordsWaiting: false });
    expect(attention(failed, now)).toEqual([{ kind: 'failed', error: 'no such host' }]);
    const cut = migration({ result: 'interrupted', passwordsWaiting: false });
    expect(attention(cut, now)).toEqual([{ kind: 'interrupted' }]);
  });

  it('says when a running migration’s node has gone quiet', () => {
    const quiet = migration({ status: 'running', heartbeat: '2026-10-30T19:58:00Z' });
    expect(attention(quiet, now)).toEqual([{ kind: 'quiet', since: '2026-10-30T19:58:00Z' }]);
  });
});

describe('percent and fileName', () => {
  it('counts finished and unfinished accounts as through', () => {
    expect(percent({ total: 4, finished: 1, unfinished: 1, read: 0, written: 0, failed: 0 })).toBe(50);
    expect(percent({ total: 0, finished: 0, unfinished: 0, read: 0, written: 0, failed: 0 })).toBe(0);
  });

  it('names a download after the migration', () => {
    expect(fileName(migration(), 'report')).toBe('From-the-old-Dovecot-b-report.csv');
    expect(fileName(migration({ description: '' }), 'passwords')).toBe('migration-b-passwords.csv');
  });
});

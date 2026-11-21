/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  cutsOffThisConsole,
  draftOf,
  draftProblem,
  fromServer,
  newSecret,
  originOf,
  originProblem,
  patchOf,
  urlProblem,
  type FrontEnds,
} from './model';

const base: FrontEnds = {
  adminUrl: 'https://admin.example.com',
  webmailUrl: null,
  webmailClientSecretSet: false,
  extraOrigins: [],
  environmentAdminUrl: null,
  environmentWebmailUrl: null,
  environmentWebmailClientSecret: false,
  changedAt: null,
  changedBy: null,
};
const SECRET = 'x'.repeat(32);

describe('reading the singleton', () => {
  it('takes what the server sends and treats empty strings as unset', () => {
    const f = fromServer({
      id: 'singleton',
      adminUrl: '',
      webmailUrl: 'https://mail.example.com',
      webmailClientSecret: null,
      webmailClientSecretSet: true,
      extraOrigins: ['https://a.example', 7],
      environmentAdminUrl: 'https://env.example',
      environmentWebmailUrl: null,
      environmentWebmailClientSecret: false,
      changedAt: 1_700_000_000,
      changedBy: 'b',
    });
    expect(f.adminUrl).toBeNull();
    expect(f.webmailUrl).toBe('https://mail.example.com');
    expect(f.webmailClientSecretSet).toBe(true);
    expect(f.extraOrigins).toEqual(['https://a.example']);
    expect(f.environmentAdminUrl).toBe('https://env.example');
    expect(f.changedAt).toBe(1_700_000_000);
  });
});

describe('origins', () => {
  it('match the server: lowercased, default port dropped, path ignored', () => {
    expect(originOf('HTTPS://Admin.Example.com:443/console/')).toBe('https://admin.example.com');
    expect(originOf('http://h:8080/x')).toBe('http://h:8080');
    expect(originOf('ftp://h')).toBeNull();
    expect(originOf('nonsense')).toBeNull();
  });

  it('extra origins are origins only, once each', () => {
    expect(originProblem('https://a.example', [])).toBeNull();
    expect(originProblem('https://a.example/path', [])).toMatch(/no path/);
    expect(originProblem('a.example', [])).toMatch(/http or https/);
    expect(originProblem('https://A.example:443', ['https://a.example'])).toMatch(/Already/);
    expect(originProblem('  ', [])).toMatch(/Type/);
  });

  it('addresses may have a path but no credentials, query or fragment', () => {
    expect(urlProblem('')).toBeNull();
    expect(urlProblem('https://mail.example.com/webmail')).toBeNull();
    expect(urlProblem('mail.example.com')).toMatch(/https:\/\//);
    expect(urlProblem('https://u:p@mail.example.com')).toMatch(/user name/);
    expect(urlProblem('https://mail.example.com/?a=1')).toMatch(/query/);
  });
});

describe('what gets saved', () => {
  it('nothing when nothing changed, a trailing slash included', () => {
    expect(patchOf({ ...draftOf(base), adminUrl: 'https://admin.example.com/' }, base)).toEqual({});
  });

  it('only the properties that changed, with empty as null', () => {
    const d = { ...draftOf(base), adminUrl: '', extraOrigins: ['https://B.example:443'] };
    expect(patchOf(d, base)).toEqual({ adminUrl: null, extraOrigins: ['https://b.example'] });
  });

  it('a new secret is sent; forgetting one sends null', () => {
    const stored = { ...base, webmailClientSecretSet: true };
    expect(patchOf({ ...draftOf(stored), webmailClientSecret: SECRET }, stored)).toEqual({
      webmailClientSecret: SECRET,
    });
    expect(patchOf({ ...draftOf(stored), forgetSecret: true }, stored)).toEqual({ webmailClientSecret: null });
    expect(patchOf({ ...draftOf(base), forgetSecret: true }, base)).toEqual({});
  });
});

describe('what the server would refuse', () => {
  it('a webmail address needs a secret from somewhere', () => {
    const d = { ...draftOf(base), webmailUrl: 'https://mail.example.com' };
    expect(draftProblem(d, base)).toMatch(/client secret/);
    expect(draftProblem({ ...d, webmailClientSecret: SECRET }, base)).toBeNull();
    expect(draftProblem(d, { ...base, webmailClientSecretSet: true })).toBeNull();
    expect(draftProblem(d, { ...base, environmentWebmailClientSecret: true })).toBeNull();
    expect(draftProblem({ ...d, forgetSecret: true }, { ...base, webmailClientSecretSet: true })).toMatch(
      /client secret/,
    );
  });

  it('a short secret, or one the environment would replace', () => {
    expect(draftProblem({ ...draftOf(base), webmailClientSecret: 'short' }, base)).toMatch(/32/);
    expect(
      draftProblem(
        { ...draftOf(base), webmailClientSecret: SECRET },
        { ...base, environmentWebmailClientSecret: true },
      ),
    ).toMatch(/INBUXA_WEBMAIL_CLIENT_SECRET/);
  });

  it('a bad address', () => {
    expect(draftProblem({ ...draftOf(base), adminUrl: 'admin.example.com' }, base)).toMatch(/Console address/);
  });
});

describe('cutting off the console in use', () => {
  const here = 'https://admin.example.com';
  const api = 'https://mail.example.com';

  it('warns when the address it is used from is taken out', () => {
    const d = { ...draftOf(base), adminUrl: 'https://console.example.com' };
    expect(cutsOffThisConsole(d, base, here, api)).toBe(true);
  });

  it('not when it stays allowed another way', () => {
    const moved = { ...draftOf(base), adminUrl: 'https://console.example.com' };
    expect(cutsOffThisConsole({ ...moved, extraOrigins: [here] }, base, here, api)).toBe(false);
    expect(cutsOffThisConsole(moved, { ...base, environmentAdminUrl: `${here}/` }, here, api)).toBe(false);
    expect(cutsOffThisConsole({ ...draftOf(base), adminUrl: `${here}/new-path` }, base, here, api)).toBe(false);
  });

  it('not for a console the server serves itself, or one never on the list', () => {
    const cleared = { ...draftOf(base), adminUrl: '' };
    expect(cutsOffThisConsole(cleared, base, api, api)).toBe(false);
    expect(cutsOffThisConsole(cleared, base, 'http://localhost:5174', api)).toBe(false);
  });

  it('also when it was only an extra origin', () => {
    const f = { ...base, adminUrl: null, extraOrigins: [here] };
    expect(cutsOffThisConsole({ ...draftOf(f), extraOrigins: [] }, f, here, api)).toBe(true);
  });
});

describe('a new secret', () => {
  it('is 48 URL-safe characters, long enough for the server', () => {
    const s = newSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{48}$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(newSecret()).not.toBe(s);
  });

  it('uses every byte without bias', () => {
    const s = newSecret((b) => b.map((_, i) => i * 4 + 3));
    expect(s.slice(0, 4)).toBe('DHLP');
  });
});

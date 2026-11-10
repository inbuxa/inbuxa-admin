/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
  entries,
  entryOf,
  otherSenderRules,
  parseEntry,
  planAdd,
  planCertificates,
  planRemove,
  planReorder,
  planRequire,
  rowsFirst,
  SENDER_TLS,
  strategyWeakened,
  type Current,
} from './model';

const RETRY = { if: "retry_num > 0 && last_error == 'tls'", then: "'invalid-tls'" };
const RELAY = { if: "mx == 'smtp.example.net'", then: "'relay-tls'" };

const stock: Current = {
  tls: { match: { '0': RETRY }, else: "'default'" },
  tlsStrategies: [
    { id: 'a', name: 'default' },
    { id: 'b', name: 'invalid-tls' },
  ],
};

const withOne: Current = {
  tls: {
    match: { '0': { if: "sender == 'secure@b.org'", then: `'${SENDER_TLS}'` }, '1': RELAY, '2': RETRY },
    else: "'default'",
  },
  tlsStrategies: [...stock.tlsStrategies, { id: 'c', name: SENDER_TLS, allowInvalidCerts: false, startTls: 'require' }],
};

describe('parseEntry', () => {
  it('reads addresses and domains, lowercased', () => {
    expect(parseEntry(' Secure@B.org ')).toEqual({ kind: 'address', value: 'secure@b.org' });
    expect(parseEntry('b.org')).toEqual({ kind: 'domain', value: 'b.org' });
    expect(parseEntry('@Secure.B.org')).toEqual({ kind: 'domain', value: 'secure.b.org' });
    expect(parseEntry('xn--bcher-kva.example')).toEqual({ kind: 'domain', value: 'xn--bcher-kva.example' });
  });
  it('refuses what is neither', () => {
    for (const bad of ['', 'localhost', 'a b@c.org', '@', 'a@', "o'brien@b.org", 'a@-b.org', 'a@b', 'a@b..org'])
      expect(parseEntry(bad), bad).toBeNull();
  });
});

describe('entryOf', () => {
  it('only claims its own rows', () => {
    expect(entryOf({ if: "sender_domain == 'b.org'", then: `'${SENDER_TLS}'` })).toEqual({
      kind: 'domain',
      value: 'b.org',
    });
    expect(entryOf({ if: '  sender=="x@b.org" ', then: `"${SENDER_TLS}"` })).toEqual({
      kind: 'address',
      value: 'x@b.org',
    });
    // Points elsewhere, or is a condition this page didn't write.
    expect(entryOf({ if: "sender == 'x@b.org'", then: "'require-tls'" })).toBeNull();
    expect(entryOf({ if: "sender == 'x@b.org' && rcpt_domain == 'c.org'", then: `'${SENDER_TLS}'` })).toBeNull();
    expect(entryOf(RETRY)).toBeNull();
  });
});

describe('planAdd', () => {
  it('creates the strategy and puts the row above the retry row', () => {
    const p = planAdd(stock, { kind: 'address', value: 'secure@b.org' });
    expect(p.tlsCreate).toMatchObject({ name: SENDER_TLS, startTls: 'require', allowInvalidCerts: false });
    expect(p.tls).toEqual({
      match: { '0': { if: "sender == 'secure@b.org'", then: `'${SENDER_TLS}'` }, '1': RETRY },
      else: "'default'",
    });
  });

  it('keeps every other row, in order, after its own', () => {
    const p = planAdd(withOne, { kind: 'domain', value: 'c.org' });
    expect(p.tlsCreate).toBeUndefined();
    expect(Object.values(p.tls!.match)).toEqual([
      { if: "sender == 'secure@b.org'", then: `'${SENDER_TLS}'` },
      { if: "sender_domain == 'c.org'", then: `'${SENDER_TLS}'` },
      RELAY,
      RETRY,
    ]);
    expect(p.tls!.else).toBe("'default'");
  });

  it('does nothing for an entry that is already there', () => {
    expect(planAdd(withOne, { kind: 'address', value: 'secure@b.org' })).toEqual({});
  });

  it('quotes what it writes', () => {
    const p = planAdd(stock, { kind: 'address', value: 'a\\b@c.org' });
    expect(p.tls!.match['0'].if).toBe("sender == 'a\\\\b@c.org'");
    expect(entries({ tls: p.tls!, tlsStrategies: [] })).toEqual([{ kind: 'address', value: 'a\\b@c.org' }]);
  });
});

describe('planRemove', () => {
  it('drops only that row', () => {
    const p = planRemove(withOne, { kind: 'address', value: 'secure@b.org' });
    expect(p.tls).toEqual({ match: { '0': RELAY, '1': RETRY }, else: "'default'" });
    expect(p.tlsCreate).toBeUndefined();
  });
  it('ignores an entry that is not there', () => {
    expect(planRemove(withOne, { kind: 'domain', value: 'b.org' })).toEqual({});
  });
});

describe('order', () => {
  const moved: Current = {
    ...withOne,
    tls: { match: { '0': RETRY, '1': { if: "sender == 'secure@b.org'", then: `'${SENDER_TLS}'` } }, else: "'d'" },
  };
  it('notices its rows below another row and moves them back', () => {
    expect(rowsFirst(withOne)).toBe(true);
    expect(rowsFirst(stock)).toBe(true);
    expect(rowsFirst(moved)).toBe(false);
    expect(Object.values(planReorder(moved).tls!.match)).toEqual([
      { if: "sender == 'secure@b.org'", then: `'${SENDER_TLS}'` },
      RETRY,
    ]);
    expect(planReorder(withOne)).toEqual({});
  });
  it('re-adding an entry also restores the order', () => {
    expect(planAdd(moved, { kind: 'address', value: 'secure@b.org' }).tls).toBeDefined();
  });
  it('reads keys as numbers, not strings', () => {
    const many: Current = {
      ...stock,
      tls: {
        match: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [
            String(i),
            i === 10 ? RETRY : { if: `sender_domain == 'd${i}.org'`, then: `'${SENDER_TLS}'` },
          ]),
        ),
        else: "'default'",
      },
    };
    expect(rowsFirst(many)).toBe(true);
    expect(entries(many).map((e) => e.value)[2]).toBe('d2.org');
  });
});

describe('other rules', () => {
  it('lists sender rules it does not own', () => {
    const cur: Current = {
      ...withOne,
      tls: {
        ...withOne.tls,
        match: { ...withOne.tls.match, '3': { if: "sender == 'x@b.org'", then: "'require-tls'" } },
      },
    };
    expect(otherSenderRules(cur)).toEqual([{ if: "sender == 'x@b.org'", then: "'require-tls'" }]);
    expect(otherSenderRules(withOne)).toEqual([]);
  });
});

describe('strategy settings', () => {
  it('switches certificate checks', () => {
    expect(planCertificates(withOne, false)).toEqual({});
    expect(planCertificates(withOne, true)).toEqual({ tlsUpdate: { id: 'c', patch: { allowInvalidCerts: true } } });
    expect(planCertificates(stock, true).tlsCreate).toMatchObject({ name: SENDER_TLS, allowInvalidCerts: true });
  });
  it('notices STARTTLS no longer required', () => {
    const weak: Current = {
      ...withOne,
      tlsStrategies: [{ id: 'c', name: SENDER_TLS, startTls: 'optional' }],
    };
    expect(strategyWeakened(withOne)).toBe(false);
    expect(strategyWeakened(weak)).toBe(true);
    expect(planRequire(weak)).toEqual({ tlsUpdate: { id: 'c', patch: { startTls: 'require' } } });
    expect(planRequire(withOne)).toEqual({});
  });
});

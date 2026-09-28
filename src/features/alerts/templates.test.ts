/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { alertConditionWords, describeAlert, recognize, templateCondition, TEMPLATES } from './templates';

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;

describe('alert templates', () => {
  it('write conditions over metrics', () => {
    expect(templateCondition(byId('queue'), 500)).toBe("metric('queue.count') > 500");
    expect(templateCondition(byId('memory'), 2048)).toBe(`metric('server.memory') > ${2048 * 1024 * 1024}`);
    expect(templateCondition(byId('dns'), 0)).toBe(
      "metric('dns.record-creation-failed') + metric('dns.record-deletion-failed') > 0",
    );
  });

  it('recognise every condition they write, with its threshold', () => {
    for (const t of TEMPLATES) {
      const n = t.threshold?.value ?? 0;
      expect(recognize(templateCondition(t, n))).toEqual({ template: t, n });
    }
    expect(recognize("metric('queue.count') > 10 && true")).toBeNull();
  });

  it('describe an alert in a sentence', () => {
    expect(
      describeAlert({
        condition: { match: {}, else: "metric('queue.count') > 500" },
        emailAlert: { '@type': 'Enabled', to: { 'ops@example.org': true } },
        eventAlert: { '@type': 'Disabled' },
      }),
    ).toBe('When more than 500 messages are waiting to be delivered, email ops@example.org.');
    expect(
      describeAlert({
        enable: false,
        condition: { match: {}, else: "metric('smtp.connection-start') > 9" },
        emailAlert: { '@type': 'Disabled' },
        eventAlert: { '@type': 'Enabled' },
      }),
    ).toBe("When the condition metric('smtp.connection-start') > 9 is true, raise an event for webhooks. (off)");
  });
});

describe('alertConditionWords', () => {
  it('names a template condition, and leaves others alone', () => {
    expect(alertConditionWords({ match: {}, else: "metric('queue.count') > 500" })).toMatch(/^More than 500 /);
    expect(alertConditionWords({ match: {}, else: "metric('x') > 1" })).toBeNull();
    expect(alertConditionWords({ match: { a: {} }, else: "metric('queue.count') > 500" })).toBeNull();
  });
});

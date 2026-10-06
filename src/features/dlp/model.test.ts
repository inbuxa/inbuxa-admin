/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { DETECTORS, TEMPLATES, describeRule, detectorName, newRule, type Rule } from './model';

describe('detectors and templates', () => {
  it('match the server tables', () => {
    // 49 detectors in crates/features/src/mailflow/detectors; regenerate
    // model.ts from there when that changes
    expect(DETECTORS).toHaveLength(49);
    expect(new Set(DETECTORS.map((d) => d.id)).size).toBe(DETECTORS.length);
    for (const template of TEMPLATES) {
      for (const id of template.detectors) {
        expect(
          DETECTORS.some((d) => d.id === id),
          `${template.id}: ${id}`,
        ).toBe(true);
      }
    }
    expect(detectorName('payment-card')).toBe('Payment card number');
    expect(detectorName('unknown')).toBe('unknown');
  });
});

describe('rules in words', () => {
  it('describes a DLP rule', () => {
    const rule: Rule = {
      ...newRule('dlp'),
      name: 'Cards leaving',
      conditions: [
        { type: 'recipientOutside' },
        {
          type: 'detected',
          detectors: [
            { id: 'payment-card', atLeast: 5 },
            { id: 'iban', atLeast: 1 },
          ],
        },
      ],
      exceptions: [{ type: 'senderDomain', domains: ['finance.example.com'] }],
      actions: [{ type: 'hold', notice: 'Held', notifySender: true }],
    };
    expect(describeRule(rule)).toBe(
      'If a recipient is outside this server and the message contains 5 or more Payment card number or IBAN, unless the sender is at finance.example.com: hold it for review.',
    );
  });

  it('describes a mail flow rule with no conditions', () => {
    const rule: Rule = {
      ...newRule('transport'),
      direction: 'incoming',
      conditions: [],
      actions: [
        { type: 'prefixSubject', text: '[External]' },
        { type: 'addHeader', name: 'X-Origin', value: 'outside' },
      ],
    };
    expect(describeRule(rule)).toBe(
      'For all mail arriving here: start the subject with “[External]”, then add the header X-Origin: outside.',
    );
  });

  it('starts new rules the way the server accepts them', () => {
    const dlp = newRule('dlp');
    expect(dlp.direction).toBe('outgoing');
    expect(dlp.actions).toHaveLength(1);
    expect(newRule('transport').actions[0].type).toBe('addDisclaimer');
  });
});

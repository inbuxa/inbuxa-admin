/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { hrefFor, linkForMetrics } from './links';
import { summarizeQueue } from './serverFacts';
import { weeklyGrid } from './rhythm';

describe('linkForMetrics', () => {
  it('sends each number to where you act on it', () => {
    expect(linkForMetrics(['queue.count'])?.viewName).toBe('x:QueuedMessage');
    expect(linkForMetrics(['user.count'])?.viewName).toBe('x:Account/User');
    expect(linkForMetrics(['queue.message-queued'])?.viewName).toBe('x:Trace/InboundDelivery');
    expect(linkForMetrics(['queue.authenticated-message-queued'])?.viewName).toBe('x:Trace/OutboundDelivery');
    expect(linkForMetrics(['security.scan-ban'])).toMatchObject({ viewName: 'x:BlockedIp', section: 'Settings' });
    expect(linkForMetrics(['incoming-report.tls-report-with-warnings'])?.viewName).toBe('x:TlsExternalReport');
  });

  it('takes the first metric that has a home', () => {
    expect(linkForMetrics(['no.such', 'domain.count'])?.viewName).toBe('x:Domain');
    expect(linkForMetrics(['no.such'])).toBeNull();
  });

  it('carries filters the list page understands', () => {
    expect(hrefFor({ viewName: 'x:QueuedMessage', section: 'Management', label: '', filters: { to: 'a.com' } })).toBe(
      '/Management/x:QueuedMessage?f.to=a.com',
    );
  });
});

describe('summarizeQueue', () => {
  it('groups outstanding recipients by destination, busiest first', () => {
    const { waiting, retrying } = summarizeQueue([
      {
        recipients: {
          'a@gmail.com': { status: { '@type': 'TemporaryFailure' } },
          'b@gmail.com': { status: { '@type': 'Scheduled' } },
          'c@example.org': { status: { '@type': 'Completed' } },
        },
      },
      { recipients: { 'd@Example.org': { status: { '@type': 'PermanentFailure' } } } },
      { recipients: { 'e@gmail.com': {} } },
    ]);
    expect(waiting).toEqual([
      { domain: 'gmail.com', scheduled: 2, retrying: 1, failed: 0 },
      { domain: 'example.org', scheduled: 0, retrying: 0, failed: 1 },
    ]);
    expect(retrying).toBe(1);
  });
});

describe('weeklyGrid', () => {
  it('buckets samples by local weekday (Monday first) and hour', () => {
    const at = (d: Date, count: number, metric = 'queue.message-queued') => ({
      '@type': 'Counter' as const,
      metric,
      count,
      timestamp: d.toISOString(),
    });
    const monday9 = new Date(2024, 0, 1, 9, 30);
    const sunday23 = new Date(2024, 0, 7, 23, 5);
    const grid = weeklyGrid([at(monday9, 3), at(monday9, 2), at(sunday23, 1), at(monday9, 50, 'other.metric')]);
    expect(grid[0][9]).toBe(5);
    expect(grid[6][23]).toBe(1);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(6);
  });
});

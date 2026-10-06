/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { httpMetricsEndpoint, newPassword, otelValue, providerOf, scrapeConfig, scrapeUrl } from './connect';

describe('prometheus', () => {
  it('scrapes /metrics/prometheus on the server', () => {
    expect(scrapeUrl('https://mail.example.org/')).toBe('https://mail.example.org/metrics/prometheus');
  });

  it('writes a scrape job, with basic auth when there is a user', () => {
    expect(scrapeConfig('https://mail.example.org', 'prometheus', 's3cret')).toBe(
      [
        'scrape_configs:',
        '  - job_name: inbuxa',
        '    scheme: https',
        '    metrics_path: /metrics/prometheus',
        '    static_configs:',
        "      - targets: ['mail.example.org']",
        '    basic_auth:',
        "      username: 'prometheus'",
        "      password: 's3cret'",
        '',
      ].join('\n'),
    );
    expect(scrapeConfig('http://localhost:8080', '', null)).not.toContain('basic_auth');
    expect(scrapeConfig('http://localhost:8080', '', null)).toContain("targets: ['localhost:8080']");
  });

  it('makes long random passwords', () => {
    const a = newPassword();
    expect(a).toMatch(/^[A-Za-z0-9]{20,24}$/);
    expect(newPassword()).not.toBe(a);
  });
});

describe('opentelemetry', () => {
  it('adds the signal path to a bare HTTP collector address', () => {
    expect(httpMetricsEndpoint('http://collector:4318')).toBe('http://collector:4318/v1/metrics');
    expect(httpMetricsEndpoint('http://collector:4318/v1/metrics/')).toBe('http://collector:4318/v1/metrics');
  });

  it('builds each provider’s settings, and reads them back', () => {
    const hc = otelValue('honeycomb', { endpoint: '', key: 'abc', extra: '' });
    expect(hc).toMatchObject({
      '@type': 'Http',
      endpoint: 'https://api.honeycomb.io/v1/metrics',
      httpHeaders: { 'x-honeycomb-team': 'abc', 'x-honeycomb-dataset': 'inbuxa' },
    });
    const gc = otelValue('grafana', {
      endpoint: 'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp',
      key: 'tok',
      extra: '123456',
    });
    expect(gc).toMatchObject({
      endpoint: 'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/metrics',
      httpAuth: { '@type': 'Basic', username: '123456', secret: 'tok' },
    });
    expect(providerOf(hc)).toBe('honeycomb');
    expect(providerOf(gc)).toBe('grafana');
    expect(providerOf(otelValue('collectorGrpc', { endpoint: 'http://c:4317', key: '', extra: '' }))).toBe(
      'collectorGrpc',
    );
    expect(providerOf({ '@type': 'Disabled' })).toBe('off');
  });
});

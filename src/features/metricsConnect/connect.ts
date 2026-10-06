/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: sending the server's metrics somewhere (settings-reorg, second
 * wave). Two ways, both on x:Metrics:
 *
 * - Prometheus scrapes GET /metrics/prometheus on the server's own web
 *   address, optionally behind Basic authentication (http/src/request.rs).
 * - The server pushes to an OpenTelemetry endpoint over HTTP or gRPC. An
 *   HTTP endpoint set in the settings is used exactly as given
 *   (opentelemetry-otlp resolve_http_endpoint), so it must end in
 *   /v1/metrics; the guide adds that to a bare collector address. Counters
 *   go out as deltas (Temporality::Delta).
 */

export type OtelProvider = 'off' | 'honeycomb' | 'grafana' | 'collectorHttp' | 'collectorGrpc';

export interface OtelInput {
  endpoint: string;
  /** Honeycomb API key, or Grafana Cloud token. */
  key: string;
  /** Honeycomb dataset, or Grafana Cloud instance ID. */
  extra: string;
}

export function scrapeUrl(base: string): string {
  return `${base.replace(/\/+$/, '')}/metrics/prometheus`;
}

/** A Prometheus scrape job for this server, ready to paste into prometheus.yml. */
export function scrapeConfig(base: string, username: string, password: string | null): string {
  const url = new URL(scrapeUrl(base));
  const lines = [
    'scrape_configs:',
    '  - job_name: inbuxa',
    `    scheme: ${url.protocol.replace(':', '')}`,
    `    metrics_path: ${url.pathname}`,
    '    static_configs:',
    `      - targets: ['${url.host}']`,
  ];
  if (username) {
    lines.push(
      '    basic_auth:',
      `      username: '${username}'`,
      `      password: '${password ?? '<the password you set>'}'`,
    );
  }
  return lines.join('\n') + '\n';
}

/** An OTLP/HTTP metrics URL: a bare collector address gets the signal path. */
export function httpMetricsEndpoint(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '');
  if (/\/v1\/metrics$/.test(s)) return s;
  return `${s}/v1/metrics`;
}

/** What x:Metrics.openTelemetry becomes for a provider. */
export function otelValue(provider: OtelProvider, input: OtelInput): Record<string, unknown> {
  switch (provider) {
    case 'off':
      return { '@type': 'Disabled' };
    case 'honeycomb':
      return {
        '@type': 'Http',
        endpoint: 'https://api.honeycomb.io/v1/metrics',
        httpAuth: { '@type': 'Unauthenticated' },
        httpHeaders: { 'x-honeycomb-team': input.key.trim(), 'x-honeycomb-dataset': input.extra.trim() || 'inbuxa' },
      };
    case 'grafana':
      return {
        '@type': 'Http',
        endpoint: httpMetricsEndpoint(input.endpoint.replace(/\/otlp\/?$/, '') + '/otlp'),
        httpAuth: { '@type': 'Basic', username: input.extra.trim(), secret: input.key },
        httpHeaders: {},
      };
    case 'collectorHttp':
      return {
        '@type': 'Http',
        endpoint: httpMetricsEndpoint(input.endpoint),
        httpAuth: { '@type': 'Unauthenticated' },
        httpHeaders: {},
      };
    case 'collectorGrpc':
      return { '@type': 'Grpc', endpoint: input.endpoint.trim() || null };
  }
}

/** Which provider a saved value most likely is. */
export function providerOf(value: Record<string, unknown> | null | undefined): OtelProvider {
  const type = value?.['@type'];
  if (type === 'Grpc') return 'collectorGrpc';
  if (type !== 'Http') return 'off';
  const endpoint = String(value?.endpoint ?? '');
  if (endpoint.includes('honeycomb.io')) return 'honeycomb';
  if (endpoint.includes('grafana.net')) return 'grafana';
  return 'collectorHttp';
}

/** A password for the scrape endpoint, made in the browser and shown once. */
export function newPassword(bytes = 18): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a))
    .replace(/[+/=]/g, '')
    .slice(0, 24);
}

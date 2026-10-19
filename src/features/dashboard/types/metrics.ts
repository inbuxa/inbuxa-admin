/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type MetricId = string;

/**
 * A metric sample (`x:Metric`, or the live stream). Counters and histograms
 * are running totals; a histogram's mean is `sum / count`. `nodeId` is the
 * node that wrote it, on servers from 2026.9.30 on.
 */
export type Metric =
  | { '@type': 'Counter'; metric: MetricId; count: number; timestamp?: string; nodeId?: number }
  | { '@type': 'Gauge'; metric: MetricId; count: number; timestamp?: string; nodeId?: number }
  | { '@type': 'Histogram'; metric: MetricId; count: number; sum: number; timestamp?: string; nodeId?: number };

/** What the dashboard shows: a preset ending now, or a fixed window (a zoom). */
export type Period = { kind: 'preset'; preset: PresetKey } | { kind: 'custom'; from: Date; to: Date };

export type PresetKey = '24h' | '7d' | '30d' | '90d';

export const PRESET_KEYS: PresetKey[] = ['24h', '7d', '30d', '90d'];

const DAY_MS = 86_400_000;

export const PRESET_MS: Record<PresetKey, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
};

/** How many slices a chart cuts each preset into. */
export const BUCKET_CONFIG: Record<PresetKey, number> = {
  '24h': 48,
  '7d': 56,
  '30d': 60,
  '90d': 90,
};

export function presetLabel(t: (key: string, fallback: string) => string, key: PresetKey): string {
  switch (key) {
    case '24h':
      return t('dashboard.preset24h', 'Last 24 hours');
    case '7d':
      return t('dashboard.preset7d', 'Last 7 days');
    case '30d':
      return t('dashboard.preset30d', 'Last 30 days');
    case '90d':
      return t('dashboard.preset90d', 'Last 90 days');
  }
}

/**
 * History is sampled hourly unless set otherwise (`metricsCollectionInterval`),
 * so a zoomed window gets a slice per hour, between 3 and this many, and is
 * never under 3 hours.
 */
export const CUSTOM_BUCKET_COUNT = 60;
export const HOUR_MS = 3_600_000;
export const MIN_ZOOM_MS = 3 * HOUR_MS;

/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The dashboards the server's schema describes (`schema.dashboards`), as it sends them. */

export type Dashboard = {
  id: string;
  label: string;
  cards?: Card[];
  charts?: Chart[];
};

/** A single figure, from the live stream or from history. */
export type Card = {
  title: string;
  icon: string;
  source: CardSource;
  /** The metrics it adds up (or averages, with `aggregate: 'avg'`). */
  metrics: string[];
  aggregate?: Aggregate;
  format: MetricFormat;
  description?: string;
  sparkline?: boolean;
  delta?: boolean;
};

/** A chart over the dashboard's period, one line, area or bar group per series. */
export type Chart = {
  title: string;
  kind: ChartKind;
  series: Series[];
  stacked?: boolean;
  valueFormat?: MetricFormat;
  description?: string;
};

export type Series = {
  label: string;
  metrics: string[];
  aggregate?: Aggregate;
};

export type Aggregate = 'sum' | 'avg';
export type ChartKind = 'line' | 'area' | 'bar';
export type CardSource = 'live' | 'history';
export type MetricFormat = 'number' | 'bytes' | 'duration' | 'percent';

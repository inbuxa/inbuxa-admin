/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Metric, Period } from '../types/metrics';
import type { ServerFacts } from '../serverFacts';
import { bucketTimestamps, formatValue, gaugeReading, getBucketCount } from '../helpers';
import {
  DECK_METRICS,
  AUTH_FAILED,
  BANS,
  HAM,
  LATENCIES,
  RECEIVED,
  SENT,
  SPAM,
  load,
  mean,
  queueHealth,
  series,
  total,
  zoneOf,
  type Zone,
} from '../commandCenter';
import type { Tone } from '../tones';
import { Gauge } from './Gauge';
import { Panel } from './Panel';
import { LiveConnections } from './LiveConnections';
import { Latencies } from './Latencies';
import { MailFlow } from './MailFlow';
import { QueueWaiting } from './QueueWaiting';
import { StorageTreemap } from './StorageTreemap';
import { WeeklyHeatmap } from './WeeklyHeatmap';
import { Breakdown } from './Breakdown';

const CONNECTIONS = DECK_METRICS.network.filter((m) => m !== 'delivery.attempt-start');
const LEGACY = ['imap.connection-start', 'pop3.connection-start', 'manage-sieve.connection-start'];
const THREATS = ['security.ip-blocked', ...BANS, ...AUTH_FAILED];

interface TrendDeckProps {
  id: string;
  samples: Metric[];
  window: { from: Date; to: Date };
  period: Period;
  periodName: string;
  live: boolean;
  liveValues: Map<string, number>;
  facts: ServerFacts | null;
  /** The dials, or the panels under the readouts. */
  part: 'gauges' | 'panels';
}

const ZONE_TONE: Record<Zone, Tone> = { good: 'primary', fair: 'warn', slow: 'crit' };
const pct = (share: number) => `${Math.round(share * 100)}`;

/**
 * The instruments at the head of a trend page, in the command center's
 * manner: a row of dials for the page's vital signs, then the panels that
 * show its current state. Which ones depends on the page; a page this
 * doesn't know gets none, and keeps its readouts and charts.
 */
export function TrendDeck({ id, samples, window, period, periodName, live, liveValues, facts, part }: TrendDeckProps) {
  const { t } = useTranslation();
  const { from, to } = window;
  const buckets = getBucketCount(period);
  const slice = (ms: number) => {
    const min = Math.round(ms / 60_000);
    return min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
  };
  const per = t('cc.perSlice', '/{{slice}}', { slice: slice((to.getTime() - from.getTime()) / buckets) });

  const zoneGauge = (metric: string, label: string) => {
    const l = LATENCIES.find((x) => x.metric === metric)!;
    const ms = mean(samples, [metric]);
    const zone = ms === null ? null : zoneOf(ms, l);
    const full = l.bad * 2;
    return (
      <Gauge
        key={metric}
        value={ms === null ? null : ms / full}
        tone={zone ? ZONE_TONE[zone] : 'primary'}
        reading={ms === null ? '—' : formatValue(ms, 'duration')}
        label={label}
        detail={t('cc.g.zoneDetail', 'fine under {{good}} · slow over {{bad}}', {
          good: formatValue(l.good, 'duration'),
          bad: formatValue(l.bad, 'duration'),
        })}
        bands={[
          { from: 0, to: l.good / full, tone: 'primary' },
          { from: l.good / full, to: 0.5, tone: 'warn' },
          { from: 0.5, to: 1, tone: 'crit' },
        ]}
      />
    );
  };

  const loadGauge = (ids: string[], label: string, tone: Tone = 'primary') => {
    const b = load(series(samples, ids, from, to, buckets));
    return (
      <Gauge
        key={label}
        value={b.peak > 0 ? b.ratio : null}
        tone={tone}
        reading={formatValue(b.now, 'number')}
        unit={per}
        label={label}
        detail={
          b.peak > 0
            ? t('cc.g.loadDetail', '{{pct}}% of peak ({{peak}})', {
                pct: pct(b.ratio),
                peak: formatValue(b.peak, 'number'),
              })
            : t('cc.g.quiet', 'Nothing recorded yet')
        }
      />
    );
  };

  const splitGauge = (
    key: string,
    a: number,
    b: number,
    label: string,
    aText: string,
    bText: string,
    bTone: Tone = 'crit',
  ) => (
    <Gauge
      key={key}
      value={a + b ? a / (a + b) : null}
      reverse={a + b ? { value: b / (a + b), tone: bTone } : undefined}
      reading={formatValue(a + b, 'number')}
      label={label}
      detail={
        a + b ? (
          <span className="inline-flex flex-wrap justify-center gap-x-2">
            <span className="text-primary">{aText}</span>
            <span style={{ color: bTone === 'crit' ? 'var(--destructive)' : 'var(--chart-3)' }}>{bText}</span>
          </span>
        ) : (
          t('cc.g.quiet', 'Nothing recorded yet')
        )
      }
    />
  );

  // Memory now against its highest in the period, both summed over the nodes:
  // the live feed is one node's, so the reading comes from the stored history.
  const memoryGauge = () => {
    const MEMORY = ['server.memory'];
    const now = gaugeReading(samples, MEMORY);
    const peak = Math.max(0, now ?? 0, ...series(samples, MEMORY, from, to, buckets));
    return (
      <Gauge
        key="memory"
        value={now === null || now === undefined || !peak ? null : now / peak}
        tone="neutral"
        reading={now === null || now === undefined ? '—' : formatValue(now, 'bytes')}
        label={t('cc.g.memory', 'Memory')}
        detail={
          peak
            ? t('cc.g.memoryDetail', 'all nodes · peak {{peak}}', { peak: formatValue(peak, 'bytes') })
            : t('cc.g.quiet', 'Nothing recorded yet')
        }
      />
    );
  };

  const received = series(samples, RECEIVED, from, to, buckets);
  const sent = series(samples, SENT, from, to, buckets);
  const times = bucketTimestamps(from, to, buckets);
  const n = (v: number) => formatValue(v, 'number');

  let gauges: ReactNode[];
  let panels: ReactNode;

  switch (id) {
    case 'network': {
      const smtpIn = total(samples, ['smtp.connection-start']);
      const smtpOut = total(samples, ['delivery.attempt-start']);
      const web = total(samples, ['http.connection-start']);
      const legacy = total(samples, LEGACY);
      gauges = [
        loadGauge(CONNECTIONS, t('cc.g.connLoad', 'Connection load')),
        splitGauge(
          'smtp',
          smtpIn,
          smtpOut,
          t('cc.g.smtpSplit', 'SMTP sessions'),
          t('cc.g.smtpIn', '{{n}} in', { n: n(smtpIn) }),
          t('cc.g.smtpOut', '{{n}} out', { n: n(smtpOut) }),
          'neutral',
        ),
        splitGauge(
          'access',
          web,
          legacy,
          t('cc.g.access', 'Mailbox access'),
          t('cc.g.web', '{{n}} web & JMAP', { n: n(web) }),
          t('cc.g.legacy', '{{n}} IMAP/POP3/Sieve', { n: n(legacy) }),
          'neutral',
        ),
      ];
      panels = (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <LiveConnections values={liveValues} live={live} />
          <WeeklyHeatmap
            samples={samples}
            metrics={CONNECTIONS}
            title={t('cc.h.connections', 'When people connect')}
            subtitle={t('cc.h.connectionsSub', 'New connections by hour and day, over the period above')}
            color="var(--chart-3)"
          />
        </div>
      );
      break;
    }
    case 'security': {
      const spam = total(samples, SPAM);
      const ham = total(samples, HAM);
      const authBans = total(samples, ['security.authentication-ban']);
      const otherBans = total(samples, BANS) - authBans;
      gauges = [
        loadGauge(THREATS, t('cc.g.threats', 'Threat pressure'), 'crit'),
        splitGauge(
          'spam',
          ham,
          spam,
          t('cc.g.received', 'Mail received'),
          t('cc.g.clean', '{{n}} to inboxes', { n: n(ham) }),
          t('cc.g.filtered', '{{n}} spam filtered', { n: n(spam) }),
        ),
        splitGauge(
          'bans',
          authBans,
          otherBans,
          t('cc.g.bans', 'Addresses banned'),
          t('cc.g.authBans', '{{n}} for sign-ins', { n: n(authBans) }),
          t('cc.g.otherBans', '{{n}} abuse & scans', { n: n(otherBans) }),
          'warn',
        ),
      ];
      panels = (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <Breakdown
            title={t('cc.b.stopped', 'What got stopped')}
            totalLabel={t('cc.b.total', 'Stopped in all')}
            aside={periodName}
            rows={[
              {
                label: t('cc.b.blocked', 'Blocked connections'),
                value: total(samples, ['security.ip-blocked']),
                tone: 'crit',
              },
              { label: t('cc.b.authFailed', 'Failed sign-ins'), value: total(samples, AUTH_FAILED), tone: 'warn' },
              { label: t('cc.b.spam', 'Spam filtered'), value: spam, tone: 'neutral' },
              { label: t('cc.b.authBans', 'Sign-in bans'), value: authBans, tone: 'crit' },
              {
                label: t('cc.b.abuseBans', 'Abuse & scan bans'),
                value: total(samples, ['security.abuse-ban', 'security.scan-ban']),
                tone: 'crit',
              },
              {
                label: t('cc.b.loiterBans', 'Loiter bans'),
                value: total(samples, ['security.loiter-ban']),
                tone: 'warn',
              },
            ]}
          />
          <WeeklyHeatmap
            samples={samples}
            metrics={AUTH_FAILED}
            title={t('cc.h.attacks', 'When sign-ins fail')}
            subtitle={t('cc.h.attacksSub', 'Failed sign-ins by hour and day: a night-time block is usually a bot')}
            color="var(--destructive)"
          />
        </div>
      );
      break;
    }
    case 'delivery': {
      const inTotal = total(samples, RECEIVED);
      const outTotal = total(samples, SENT);
      const ok = queueHealth(facts?.waiting);
      gauges = [
        <Gauge
          key="queue"
          value={facts?.waiting ? ok : null}
          tone={ok >= 0.9 ? 'ok' : ok >= 0.6 ? 'warn' : 'crit'}
          reading={facts?.waiting ? pct(ok) : '—'}
          unit="%"
          label={t('cc.g.queue', 'Queue on schedule')}
          detail={
            facts?.queued !== undefined
              ? t('cc.g.queueDetail', '{{n}} queued · {{r}} retrying', { n: facts.queued, r: facts.retrying ?? 0 })
              : undefined
          }
          bands={[
            { from: 0, to: 0.6, tone: 'crit' },
            { from: 0.6, to: 0.9, tone: 'warn' },
            { from: 0.9, to: 1, tone: 'ok' },
          ]}
        />,
        loadGauge([...RECEIVED, ...SENT], t('cc.g.load', 'Load')),
        splitGauge(
          'flow',
          inTotal,
          outTotal,
          t('cc.g.flow', 'Messages handled'),
          t('cc.g.flowIn', '{{n}} in', { n: n(inTotal) }),
          t('cc.g.flowOut', '{{n}} out', { n: n(outTotal) }),
          'neutral',
        ),
        zoneGauge('delivery.attempt-time', t('cc.g.attempt', 'Delivery attempt')),
      ];
      panels = (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <MailFlow received={received} sent={sent} times={times} periodLabel={periodName} />
          {facts?.waiting && <QueueWaiting waiting={facts.waiting} />}
        </div>
      );
      break;
    }
    case 'performance':
      gauges = [
        zoneGauge('message-ingest.time', t('cc.g.ingest', 'Take-in time')),
        zoneGauge('message-ingest.index-time', t('cc.g.index', 'Index time')),
        zoneGauge('dns.lookup-time', t('cc.g.dns', 'DNS lookup')),
        zoneGauge('delivery.attempt-time', t('cc.g.attempt', 'Delivery attempt')),
        memoryGauge(),
      ];
      panels = <Latencies samples={samples} />;
      break;
    case 'storage': {
      const quotaAccounts = facts?.storage?.filter((a) => a.quota) ?? [];
      const used = quotaAccounts.reduce((s, a) => s + a.used, 0);
      const quota = quotaAccounts.reduce((s, a) => s + (a.quota ?? 0), 0);
      gauges = [
        zoneGauge('store.data-read-time', t('cc.g.dataRead', 'Data read')),
        zoneGauge('store.data-write-time', t('cc.g.dataWrite', 'Data write')),
        zoneGauge('store.blob-read-time', t('cc.g.blobRead', 'Blob read')),
        zoneGauge('store.blob-write-time', t('cc.g.blobWrite', 'Blob write')),
      ];
      if (quota > 0)
        gauges.push(
          <Gauge
            key="quota"
            value={used / quota}
            tone={used / quota >= 0.9 ? 'crit' : used / quota >= 0.75 ? 'warn' : 'primary'}
            reading={pct(used / quota)}
            unit="%"
            label={t('cc.g.storage', 'Quota used')}
            detail={t('cc.g.storageDetail', '{{used}} of {{quota}}', {
              used: formatValue(used, 'bytes'),
              quota: formatValue(quota, 'bytes'),
            })}
          />,
        );
      panels = facts?.storage ? <StorageTreemap storage={facts.storage} /> : null;
      break;
    }
    default:
      return null;
  }

  if (part === 'panels') return panels;
  return (
    <Panel
      title={t('cc.instruments', 'Instruments')}
      aside={<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{periodName}</span>}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {gauges}
      </div>
    </Panel>
  );
}

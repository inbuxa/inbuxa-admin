/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: under the ports table, whether each port can be reached from
 * outside (settings-reorg, Ports). In a cluster, each node as the other
 * nodes see it over the real network, refreshed by the server every ten
 * minutes. On a single server, only whether each port is listening, and
 * said plainly: a server can't see its own firewall from inside.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleDashed, Globe, Loader2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/services/api';
import { cellFor, oldestCheck, type CellState, type ReachabilityAnswer } from './reachability';

const ICON: Record<CellState, ReactNode> = {
  reachable: <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />,
  partly: <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  blocked: <XCircle className="h-4 w-4 text-destructive" />,
  pending: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
};

async function fetchAnswer(): Promise<ReachabilityAnswer> {
  const res = await apiFetch('/api/ports/check');
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
    throw new Error(problem.detail ?? problem.title ?? `The check failed (${res.status}).`);
  }
  return (await res.json()) as ReachabilityAnswer;
}

export function ReachabilityCard() {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState<ReachabilityAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setAnswer(await fetchAnswer());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    fetchAnswer()
      .then((a) => live && setAnswer(a))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const oldest = answer ? oldestCheck(answer) : null;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Globe className="h-5 w-5 text-primary" />
        <p className="flex-1 font-medium">{t('reachability.title', 'Reachable from outside')}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {answer?.mode === 'cluster' && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(
              'reachability.clusterBody',
              'Each server tries the others’ ports every {{minutes}} minutes, over the internet, by their public names.',
              { minutes: Math.round(answer.intervalSeconds / 60) },
            )}
            {oldest !== null &&
              ` ${t('reachability.since', 'Oldest result: {{time}}.', { time: new Date(oldest * 1000).toLocaleTimeString() })}`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">{t('ports.port', 'Port')}</th>
                  {answer.nodes.map((n) => (
                    <th key={n.hostname} className="py-1 pr-3 font-medium">
                      {n.hostname}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {answer.ports.map((port) => (
                  <tr key={port} className="border-t">
                    <td className="py-1.5 pr-3 font-mono">{port}</td>
                    {answer.nodes.map((n) => {
                      const cell = cellFor(n, port);
                      return (
                        <td key={n.hostname} className="py-1.5 pr-3">
                          <span className="flex items-start gap-1.5" title={cell.detail}>
                            <span className="mt-0.5 shrink-0">{ICON[cell.state]}</span>
                            <span className={cell.state === 'reachable' ? 'text-muted-foreground' : ''}>
                              {cell.detail}
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {answer?.mode === 'local' && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(
              'reachability.localBody',
              'A single server can’t see its own firewall from inside, so this only says whether each port is listening here. To check from outside, try from another network: nc -vz <this server’s name> <port>.',
            )}
          </p>
          {answer.listening.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reachability.none', 'No listeners to check.')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {answer.listening.map((l) => (
                <li key={`${l.address}:${l.port}`} className="flex items-center gap-2">
                  {l.listening ? ICON.reachable : ICON.blocked}
                  <span className="font-mono">{l.port}</span>
                  <span className="text-muted-foreground">
                    {l.listening
                      ? t('reachability.listening', 'listening on this server')
                      : t('reachability.notListening', 'not listening on this server')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: at the top of TLS Reports (admin UX roadmap, item 6): whether other
 * mail servers reached each of our domains securely, and when they couldn't,
 * why, in plain words. The list of raw reports stays underneath.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { fetchTlsReports, type TlsExternalReport } from './api';
import { summarizeTls, type TlsFailureKind } from './summarize';

const num = (n: number) => n.toLocaleString();

/** What each failure means for us, the receiving side. */
function useExplain() {
  const { t } = useTranslation();
  return (kind: TlsFailureKind): string => {
    switch (kind) {
      case 'startTlsNotSupported':
        return t('inTls.startTlsNotSupported', 'Your server didn’t offer encryption (STARTTLS).');
      case 'certificateHostMismatch':
        return t(
          'inTls.certificateHostMismatch',
          'Your certificate doesn’t cover the MX host name senders connected to.',
        );
      case 'certificateExpired':
        return t('inTls.certificateExpired', 'Your certificate had expired.');
      case 'certificateNotTrusted':
        return t('inTls.certificateNotTrusted', 'Senders didn’t trust who issued your certificate.');
      case 'validationFailure':
        return t('inTls.validationFailure', 'Senders couldn’t validate your certificate.');
      case 'tlsaInvalid':
        return t('inTls.tlsaInvalid', 'Your DANE (TLSA) records don’t match your certificate.');
      case 'dnssecInvalid':
        return t('inTls.dnssecInvalid', 'Your DNSSEC signatures didn’t validate.');
      case 'daneRequired':
        return t('inTls.daneRequired', 'DANE was required but senders couldn’t use it.');
      case 'stsPolicyFetchError':
        return t('inTls.stsPolicyFetchError', 'Senders couldn’t download your MTA-STS policy.');
      case 'stsPolicyInvalid':
        return t('inTls.stsPolicyInvalid', 'Your MTA-STS policy file is invalid.');
      case 'stsWebpkiInvalid':
        return t('inTls.stsWebpkiInvalid', 'The certificate on your MTA-STS policy site wasn’t valid.');
      default:
        return t('inTls.other', 'Another TLS problem the report didn’t name.');
    }
  };
}

export function TlsSummaryCard() {
  const { t } = useTranslation();
  const explain = useExplain();
  const [reports, setReports] = useState<TlsExternalReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTlsReports()
      .then((r) => live && setReports(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const summaries = useMemo(() => (reports ? summarizeTls(reports) : []), [reports]);

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-medium">{t('inTls.title', 'Secure delivery to your domains')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('inTls.hint', 'Other mail servers report whether they could reach you over an encrypted connection.')}
          </p>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !reports ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'inTls.empty',
            'No reports yet. Large providers send one a day for each domain with a TLS-RPT record (_smtp._tls).',
          )}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {summaries.map((s) => (
            <li key={s.domain} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{s.domain}</span>
                <span className="text-sm text-muted-foreground">
                  {t('inTls.sessions', '{{succeeded}} secure deliveries, {{failed}} failed', {
                    succeeded: num(s.succeeded),
                    failed: num(s.failed),
                  })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{s.reporters.join(', ')}</span>
              </div>
              {s.failures.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {s.failures.map((f) => (
                    <li key={f.kind} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <span>
                        {explain(f.kind)}{' '}
                        <span className="text-muted-foreground">
                          {t('inTls.failedSessions', {
                            count: f.sessions,
                            defaultValue_one: '({{count}} connection',
                            defaultValue_other: '({{count}} connections',
                          })}
                          {f.hosts.length > 0 && `, ${f.hosts.join(', ')}`})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

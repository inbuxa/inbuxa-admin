/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const code = 'rounded bg-muted px-1 py-0.5 font-mono text-xs';

/**
 * The Logs page on a server with no Log tracer (#217). The server's log is
 * still there, in the system journal or the container's output, which this
 * page can't read; it reads the files a Log tracer writes. The installer
 * sets servers up that way, so this is the usual first sight of the page,
 * not a fault.
 */
export function NoLogTracerNote() {
  const { t } = useTranslation();
  return (
    <div role="status" className="space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
      <p className="font-medium">{t('logs.noTracerTitle', 'This server isn’t writing log files yet')}</p>
      <p className="text-muted-foreground">
        {t(
          'logs.noTracerJournal',
          'This page reads log files, and the server is only sending its log to the system journal. On a server set up by the installer, you can follow it with:',
        )}
      </p>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          {t('logs.onHost', 'Installed on the host:')} <code className={code}>journalctl -u inbuxa-server -f</code>
        </li>
        <li>
          {t('logs.inContainers', 'In containers, from the install folder:')}{' '}
          <code className={code}>docker compose logs -f server</code>
        </li>
      </ul>
      <p className="text-muted-foreground">
        {t('logs.noTracerAdd', 'To read the log here, add a tracer of type Log with a folder the server can write to.')}{' '}
        <Link to="/Settings/x:Tracer" className="underline underline-offset-2 hover:text-foreground">
          {t('logs.openTracers', 'Open Tracers')}
        </Link>
      </p>
    </div>
  );
}

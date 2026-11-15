/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how Let’s Encrypt reaches this server for names checked without
 * DNS, port 80 or port 443 (#206). The certificates guide asks it.
 */

import { useTranslation } from 'react-i18next';
import type { Direct } from './direct';

export function DirectChoice({ value, onChange }: { value: Direct; onChange: (v: Direct) => void }) {
  const { t } = useTranslation();
  const choice = (v: Direct, title: string, body: string) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${value === v ? 'border-primary bg-primary/5' : ''}`}
    >
      <input type="radio" name="acme-direct" className="mt-1" checked={value === v} onChange={() => onChange(v)} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground">{body}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">
        {t('certSetup.directTitle', 'How Let’s Encrypt reaches this server')}
      </legend>
      {choice(
        'Http01',
        t('certSetup.directHttp', 'Port 80 (HTTP-01)'),
        t(
          'certSetup.directHttpHint',
          'A web server in front of this one holds port 443 and passes /.well-known/acme-challenge/ on port 80 to it. The installer sets it up this way.',
        ),
      )}
      {choice(
        'TlsAlpn01',
        t('certSetup.directTls', 'Port 443 (TLS-ALPN-01)'),
        t('certSetup.directTlsHint', 'This server answers HTTPS on port 443 itself.'),
      )}
    </fieldset>
  );
}

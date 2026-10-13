/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: "Test this directory" on a saved directory's page (admin #109).
 * The guided setup tests a directory as it goes; one added or changed here
 * had no way to. First check the connection, then, once it works, try a
 * person: the same server test the guide uses, on the saved settings.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHECK_ADDRESS, testDirectory, type DirectoryTestResult } from './directoryTest';
import { DirectoryTestResults, TestLine } from './DirectoryTestResults';

interface Props {
  directoryId: string;
  /** The saved directory's variant: Ldap, Sql or Oidc. */
  kind: string | undefined;
  /** Unsaved changes on the form: the test would try the saved settings, not these. */
  dirty: boolean;
}

export function DirectoryTestCard({ directoryId, kind, dirty }: Props) {
  const { t } = useTranslation();
  const oidc = kind === 'Oidc';
  const [check, setCheck] = useState<DirectoryTestResult | null>(null);
  const [person, setPerson] = useState<DirectoryTestResult | null>(null);
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'check' | 'person' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An edit changes what the server will test, so earlier results no longer hold.
  const [wasDirty, setWasDirty] = useState(dirty);
  if (dirty !== wasDirty) {
    setWasDirty(dirty);
    if (dirty) {
      setCheck(null);
      setPerson(null);
    }
  }

  const run = async (which: 'check' | 'person') => {
    setBusy(which);
    setError(null);
    if (which === 'check') setPerson(null);
    try {
      const body =
        which === 'check'
          ? await testDirectory(directoryId, CHECK_ADDRESS)
          : await testDirectory(directoryId, address, password);
      const result = body ?? {
        opened: false,
        error: t('dirSetup.notLoaded', 'The server hasn’t loaded the directory yet.'),
      };
      if (which === 'check') setCheck(result);
      else setPerson(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Looking up an address nobody has still searches the directory: an error there is a connection problem.
  const connected = !!check?.opened && !check.lookup?.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('dirTest.title', 'Test this directory')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {dirty
            ? t('dirTest.saveFirst', 'Save your changes first. The test uses the saved settings.')
            : t(
                'dirTest.how',
                'The test uses the saved settings. Nothing is created, and a wrong password doesn’t count against anyone.',
              )}
        </p>

        <Button type="button" variant="outline" onClick={() => void run('check')} disabled={dirty || busy !== null}>
          {busy === 'check' && <Loader2 className="h-4 w-4 animate-spin" />}
          {oidc ? t('dirSetup.testOidc', 'Check the provider') : t('dirTest.check', 'Check the connection')}
        </Button>

        {check && (
          <ul className="space-y-2 text-sm">
            <TestLine ok={connected}>
              {!check.opened
                ? t('dirSetup.notOpened', 'The directory didn’t open: {{error}}', { error: check.error ?? '' })
                : check.lookup?.error
                  ? t('dirTest.searchFailed', 'The directory opened, but searching it failed: {{error}}', {
                      error: check.lookup.error,
                    })
                  : check.oidc
                    ? t('dirSetup.oidcOk', 'The provider answered, as {{issuer}}.', { issuer: check.oidc.issuer })
                    : t('dirTest.connected', 'The server can connect to this directory and search it.')}
            </TestLine>
          </ul>
        )}

        {connected && !oidc && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="dir-test-addr">{t('dirSetup.testAddress', 'A person to test with')}</Label>
                <Input id="dir-test-addr" type="email" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dir-test-pass">{t('dirSetup.testPassword', 'Their password (optional)')}</Label>
                <Input
                  id="dir-test-pass"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void run('person')}
                disabled={dirty || busy !== null || !address.trim()}
              >
                {busy === 'person' && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('dirSetup.test', 'Test')}
              </Button>
            </div>
            {person && <DirectoryTestResults result={person} />}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

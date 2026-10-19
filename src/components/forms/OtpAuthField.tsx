/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

import { checkSetupCode, groupedSecret, newTotp, readOtp, withoutSpaces } from './otp';

interface OtpAuthFieldProps {
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
}

interface Setup {
  totp: OTPAuth.TOTP;
  url: string;
}

const CODE_INPUT = 'font-mono tracking-widest text-center max-w-[12rem]';

function CodeInput({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      value={value}
      onChange={(e) => onChange(withoutSpaces(e.target.value))}
      maxLength={10}
      className={CODE_INPUT}
    />
  );
}

/**
 * Two-factor sign-in for an account. Turning it on shows a new secret as a
 * QR code and as text, and takes it only once the app's first code checks
 * out; once on, any change to the account needs a current code.
 */
export function OtpAuthField({ value, onChange, readOnly }: OtpAuthFieldProps) {
  const { t } = useTranslation();
  const { configured, code } = readOtp(value);
  const current = (value ?? {}) as object;

  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setupUrl = setup?.url ?? null;
  useEffect(() => {
    if (!setupUrl) return;
    let live = true;
    QRCode.toDataURL(setupUrl, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (live) setQr(dataUrl);
      })
      .catch((err) => console.error('Failed to render QR code', err));
    return () => {
      live = false;
    };
  }, [setupUrl]);

  const endSetup = () => {
    setSetup(null);
    setSetupCode('');
    setSetupError(null);
    setCopied(false);
  };

  const startSetup = () => {
    setSetup(newTotp());
    setSetupCode('');
    setSetupError(null);
  };

  const confirmSetup = () => {
    if (!setup) return;
    switch (checkSetupCode(setup.totp, setupCode)) {
      case 'missing':
        setSetupError(t('otp.enterCodePrompt', 'Enter the code shown in your authenticator.'));
        return;
      case 'wrong':
        setSetupError(t('otp.codeIncorrect', 'That code is incorrect. Make sure your authenticator clock is in sync.'));
        return;
      case 'ok':
        onChange({ otpUrl: setup.url, otpCode: setupCode.trim() });
        endSetup();
    }
  };

  const copySecret = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.totp.secret.base32);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: t('otp.copyFailed', 'Copy failed'),
        description: t('otp.clipboardBlocked', 'Your browser blocked clipboard access.'),
        variant: 'destructive',
      });
    }
  };

  if (readOnly) {
    return (
      <div className="text-sm text-muted-foreground">
        {configured
          ? t('otp.statusEnabled', 'Two-factor authentication is enabled.')
          : t('otp.statusDisabled', 'Two-factor authentication is not enabled.')}
      </div>
    );
  }

  if (!configured && setup) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('otp.scanPrompt', 'Scan with your authenticator app')}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              'otp.scanDescription',
              'Scan the QR code below with Google Authenticator, 1Password, Authy, or any other TOTP app, then enter the 6-digit code it shows to confirm setup.',
            )}
          </p>
        </div>
        <div className="flex justify-center">
          {qr ? (
            <img
              src={qr}
              alt={t('otp.qrCodeAlt', 'TOTP QR code')}
              width={220}
              height={220}
              className="rounded-md border bg-white p-2"
            />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t('otp.manualEntryLabel', 'Or enter this code manually')}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              'otp.manualEntryDescription',
              'If you cannot scan the QR code, enter this secret into your authenticator app instead.',
            )}
          </p>
          <div className="flex gap-2">
            <code className="flex-1 rounded bg-muted p-2 text-sm font-mono break-all select-all">
              {groupedSecret(setup.totp.secret.base32)}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copySecret}
              aria-label={t('otp.copySecret', 'Copy secret')}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t('otp.confirmationCodeLabel', 'Confirmation code')}</Label>
          <CodeInput value={setupCode} onChange={setSetupCode} />
          {setupError && <p className="text-xs text-destructive">{setupError}</p>}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={endSetup}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" size="sm" onClick={confirmSetup}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t('common.confirm', 'Confirm')}
          </Button>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('otp.statusDisabled', 'Two-factor authentication is not enabled.')}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={startSetup}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          {t('otp.setUp', 'Set up TOTP')}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium">{t('otp.statusEnabled', 'Two-factor authentication is enabled.')}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'otp.currentCodePrompt',
          'Enter your current 6-digit code to authorise any change to this account (including disabling two-factor authentication).',
        )}
      </p>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{t('otp.currentCodeLabel', 'Current code')}</Label>
        <CodeInput value={code} onChange={(otpCode) => onChange({ ...current, otpCode })} />
      </div>
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onChange({ ...current, otpUrl: null })}
          disabled={!code.trim()}
        >
          <ShieldOff className="mr-2 h-4 w-4" />
          {t('otp.disable', 'Disable')}
        </Button>
      </div>
    </div>
  );
}

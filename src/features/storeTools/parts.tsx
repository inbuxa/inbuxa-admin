/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: what the store check, snapshot and blob store change pages show
 * alike: progress, facts, the limits two of them take, a confirmation and a
 * table of problems.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { number } from './hooks';

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">{children}</div>;
}

export function ProgressBar({ share, label }: { share: number; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(share * 100)}
    >
      <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(2, share * 100)}%` }} />
    </div>
  );
}

/** Label and value pairs, in a grid that wraps on a phone. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The two throttles a check and a copy take (SV-6, BM-5). Empty means the server's default. */
export function LimitFields({
  blobs,
  bytes,
  onBlobs,
  onBytes,
}: {
  blobs: string;
  bytes: string;
  onBlobs: (v: string) => void;
  onBytes: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('storeTools.blobsPerSecond', 'Blobs a second')}</span>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={blobs}
            placeholder="1000"
            onChange={(e) => onBlobs(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('storeTools.bytesPerSecond', 'Bytes a second')}</span>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={bytes}
            placeholder="20971520"
            onChange={(e) => onBytes(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'storeTools.limitsHint',
          'Keeps it from holding up mail. Leave empty for 1,000 blobs and 20 MB a second; 0 means no limit.',
        )}
      </p>
    </div>
  );
}

/** A yes-or-cancel question before something that can't be taken back. */
export function Confirm({
  title,
  body,
  action,
  destructive,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  action: string;
  destructive?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Problems as rows; scrolls sideways inside itself on a narrow screen. */
export function ProblemTable({
  heads,
  rows,
  kept,
  total,
}: {
  heads: string[];
  rows: { key: string; cells: ReactNode[] }[];
  kept: number;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {heads.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t align-top">
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > kept && (
        <p className="text-xs text-muted-foreground">
          {t(
            'storeTools.problemsKept',
            'Showing the first {{kept}} of {{total}}. Every one is in the log as a store.data-corruption event.',
            { kept: number(kept), total: number(total) },
          )}
        </p>
      )}
    </div>
  );
}

/** A blob id, short enough for a table, whole on hover and when copied. */
export function BlobId({ id }: { id: string }) {
  return (
    <code className="font-mono text-xs" title={id}>
      {id.length > 16 ? `${id.slice(0, 16)}…` : id}
    </code>
  );
}

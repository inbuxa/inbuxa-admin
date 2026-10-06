/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** INBUXA: the audit log's words for actions and sign-in methods. */

import type { AuditAction, AuditVia } from './auditLog';

type T = (key: string, fallback: string, options?: Record<string, unknown>) => string;

export function actionLabel(t: T, action: AuditAction): string {
  switch (action) {
    case 'create':
      return t('audit.action.create', 'Created');
    case 'update':
      return t('audit.action.update', 'Changed');
    case 'destroy':
      return t('audit.action.destroy', 'Deleted');
    case 'signIn':
      return t('audit.action.signIn', 'Signed in');
    case 'signInFailed':
      return t('audit.action.signInFailed', 'Sign-in failed');
    case 'accountAccess':
      return t('audit.action.accountAccess', 'Opened another account');
    case 'blobAccess':
      return t('audit.action.blobAccess', 'Read another account’s file');
    case 'export':
      return t('audit.action.export', 'Exported the audit log');
    case 'verify':
      return t('audit.action.verify', 'Checked for tampering');
  }
}

export function viaLabel(t: T, via: AuditVia | null): string {
  if (!via) return '';
  switch (via.kind) {
    case 'password':
      return t('audit.via.password', 'password');
    case 'appPassword':
      return t('audit.via.appPassword', 'app password');
    case 'apiKey':
      return t('audit.via.apiKey', 'API key');
    case 'oauth':
      return t('audit.via.oauth', 'app {{client}}', { client: shortClient(via.client) });
    case 'directory':
      return t('audit.via.directory', 'directory token');
    case 'master':
      return t('audit.via.master', 'as master user {{name}}', { name: via.name });
    case 'recovery':
      return t('audit.via.recovery', 'recovery administrator');
  }
}

/** First-party client ids are names; registered ones are long tokens. */
function shortClient(client: string): string {
  return client.length > 24 ? `${client.slice(0, 12)}…` : client;
}


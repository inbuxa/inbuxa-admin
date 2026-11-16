/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** What a list shows when the server turns its query down. */
export type ListError = { kind: 'noLogTracer' } | { kind: 'message'; message: string };

/**
 * Reads a JMAP method error for a list. The server's description says what
 * went wrong; its type ("invalidArguments") only says which kind of thing, so
 * it's the fallback. The Logs list has one error of its own: a server with no
 * Log tracer has no log files to read (inbuxa-admin #217), which is how every
 * installer setup starts, so that gets its own explanation instead.
 */
export function listErrorOf(objectName: string, err: Record<string, unknown>, unknown: string): ListError {
  const type = typeof err.type === 'string' ? err.type : '';
  const description = typeof err.description === 'string' ? err.description.trim() : '';
  if (objectName === 'x:Log' && type === 'invalidArguments' && /no log tracers/i.test(description)) {
    return { kind: 'noLogTracer' };
  }
  return { kind: 'message', message: description || type || unknown };
}

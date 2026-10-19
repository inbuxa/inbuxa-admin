/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Shapes from JMAP core (RFC 8620), and the errors the server adds to them. */

/** One method call or response: name, arguments, call id. */
export type JmapMethodCall = [string, Record<string, unknown>, string];
export type JmapMethodResponse = [string, Record<string, unknown>, string];

/** The body of a response (RFC 8620 §3.4). */
export interface JmapResponse {
  methodResponses: JmapMethodResponse[];
  sessionState?: string;
}

/** `<type>/query` (§5.5). The server leaves `limit` out once it has sent everything. */
export interface JmapQueryResponse {
  accountId: string;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: string[];
  total?: number;
  limit?: number;
}

/** `<type>/set` (§5.3): what happened to each create, update and destroy. */
export interface JmapSetResponse {
  accountId: string;
  oldState: string;
  newState: string;
  created: Record<string, Record<string, unknown>> | null;
  notCreated: Record<string, JmapSetError> | null;
  /** Null for an update that changed nothing the server computes. */
  updated: Record<string, null | Record<string, unknown>> | null;
  notUpdated: Record<string, JmapSetError> | null;
  destroyed: string[] | null;
  notDestroyed: Record<string, JmapSetError> | null;
}

/** Why one create, update or destroy failed. */
export interface JmapSetError {
  type: string;
  description?: string;
  properties?: string[];
  /** For `alreadyExists`: the object that's already there. */
  existingId?: string;
  /** The object the error is about; a failed reload names the settings object that didn't build. */
  objectId?: string | JmapObjectRef;
  /** Objects tied to this one, when that is why it failed. */
  linkedObjects?: string[];
  validationErrors?: ValidationError[];
}

/** A registry object as an error names it: its type without `x:`, and its id. */
export interface JmapObjectRef {
  object: string;
  id: string;
}

/** A property that failed the server's checks, and the bound it broke. */
export interface ValidationError {
  type: 'Invalid' | 'Required' | 'MaxLength' | 'MinLength' | 'MaxValue' | 'MinValue';
  property: string;
  value?: string;
  required?: number;
}

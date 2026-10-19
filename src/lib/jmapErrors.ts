/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The server's JMAP errors in words an admin can act on. */
import i18n from '@/i18n';
import type { JmapSetError, ValidationError } from '@/types/jmap';

const t = i18n.t.bind(i18n);

/** The message under a field the server refused. */
export function validationErrorMessage({ type, required, value }: ValidationError): string {
  if (type === 'Required') return t('form.required', 'This field is required.');
  if (type === 'MaxLength') return t('form.maxLengthIs', 'Maximum length is {{max}}.', { max: required });
  if (type === 'MinLength') return t('form.minLengthIs', 'Minimum length is {{min}}.', { min: required });
  if (type === 'MaxValue') return t('form.maxValueIs', 'Maximum value is {{max}}.', { max: required });
  if (type === 'MinValue') return t('form.minValueIs', 'Minimum value is {{min}}.', { min: required });
  // 'Invalid': the server's own reason, when it gave one.
  return value || t('form.invalidValue', 'Invalid value.');
}

const SET_ERRORS: Record<string, () => string> = {
  forbidden: () => t('jmapErrors.forbidden', 'You do not have permission to perform this action.'),
  notFound: () => t('jmapErrors.notFound', 'The item was not found. It may have been already deleted.'),
  objectIsLinked: () => t('jmapErrors.objectIsLinked', 'This item is referenced by other items and cannot be deleted.'),
  invalidForeignKey: () => t('jmapErrors.invalidForeignKey', 'This item references another item that does not exist.'),
  primaryKeyViolation: () => t('jmapErrors.primaryKeyViolation', 'An item with the same key already exists.'),
  alreadyExists: () => t('jmapErrors.alreadyExists', 'An item with the same identifier already exists.'),
  overQuota: () => t('jmapErrors.overQuota', 'The operation exceeds your storage quota.'),
  tooLarge: () => t('jmapErrors.tooLarge', 'The item is too large.'),
  rateLimit: () => t('jmapErrors.rateLimit', 'Too many requests. Please try again later.'),
  singleton: () => t('jmapErrors.singleton', 'This item is a singleton and cannot be deleted.'),
  mailboxHasChild: () => t('jmapErrors.mailboxHasChild', 'This mailbox has child mailboxes. Delete them first.'),
  mailboxHasEmail: () => t('jmapErrors.mailboxHasEmail', 'This mailbox contains messages. Remove them first.'),
  calendarHasEvent: () => t('jmapErrors.calendarHasEvent', 'This calendar contains events. Remove them first.'),
  addressBookHasContents: () =>
    t('jmapErrors.addressBookHasContents', 'This address book has contacts. Remove them first.'),
  nodeHasChildren: () => t('jmapErrors.nodeHasChildren', 'This item has children. Delete them first.'),
  validationFailed: () => t('jmapErrors.validationFailed', 'The data did not pass validation.'),
};

/** Why a create, update or delete failed: the server's description if it sent one, else ours for the type. */
export function friendlySetError(err: JmapSetError): string {
  if (err.description) return err.description;
  const known = Object.hasOwn(SET_ERRORS, err.type) ? SET_ERRORS[err.type] : undefined;
  return known ? known() : t('jmapErrors.unexpected', 'Unexpected error ({{type}}).', { type: err.type });
}

/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what the schema-driven forms add for the AI objects (spec, "INBUXA
 * Admin"): the default prompt when the classifier is switched on, local
 * example placeholders on the model form, and the notices above both forms.
 * DynamicForm calls these at three marked points; everything else about the
 * forms stays as the schema draws them.
 */

import { DEFAULT_PROMPT, EXAMPLE_URLS, locality, RECOMMENDED_MODEL } from './localAi';

/** Values to prefill when a form switches to a variant. */
export function variantPrefill(objectName: string, variant: string): Record<string, unknown> {
  if (objectName === 'x:SpamLlm' && variant === 'Enable') return { prompt: DEFAULT_PROMPT };
  return {};
}

/** A placeholder for a field the schema gives none. */
export function fieldPlaceholder(objectName: string, fieldName: string): string | undefined {
  if (objectName !== 'x:AiModel') return undefined;
  if (fieldName === 'url') return EXAMPLE_URLS.llamaCpp;
  if (fieldName === 'model') return RECOMMENDED_MODEL.model;
  return undefined;
}

export interface FormNotice {
  tone: 'info' | 'warning';
  /** An i18n key and its English default. */
  key: string;
  text: string;
}

/** Notices to show above a form, from what it currently holds. */
export function formNotices(objectName: string, data: Record<string, unknown>): FormNotice[] {
  if (objectName === 'x:AiModel') {
    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (!url) return [];
    switch (locality(url)) {
      case 'remote':
        return [
          {
            tone: 'warning',
            key: 'localAi.remoteWarning',
            text:
              'This address is outside your network. The spam filter will send the subject and text of ' +
              'incoming mail to it. For privacy, run the model on your own machines.',
          },
        ];
      case 'unknown':
        return [
          {
            tone: 'info',
            key: 'localAi.nameNotice',
            text:
              'If this name points outside your network, message text will leave it. The server checks when ' +
              'you save and warns in its log.',
          },
        ];
      default:
        return [];
    }
  }
  if (objectName === 'x:SpamLlm') {
    return [
      {
        tone: 'info',
        key: 'localAi.neverHoldsMail',
        text:
          "The model's opinion is one signal among many, and adds at most a few points. If the model is " +
          'slow or unavailable, mail is never held up: the message is scored without it.',
      },
    ];
  }
  return [];
}

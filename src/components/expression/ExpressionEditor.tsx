/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useBufferedValue } from '@/hooks/useBufferedValue';

import {
  nextConditionKey,
  withAddedCondition,
  withConditionPart,
  withElse,
  withoutCondition,
  type ExpressionValue,
} from './conditions';
import { SimpleExpressionEditor } from './SimpleExpressionEditor';
import type { ExpressionHints } from './simple';

type TextInputProps = { value: string; onCommit: (text: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
>;

/** An input that hands its text on when left or on Enter, not at every key. */
function CommittingInput({ value, onCommit, ...rest }: TextInputProps) {
  const [text, setText] = useBufferedValue(value);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <Input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground w-12 shrink-0';
const SMALL_ACTION = 'h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground';

interface ExpressionEditorProps {
  value: ExpressionValue;
  onChange: (value: ExpressionValue) => void;
  readOnly?: boolean;
  /** What the field accepts, from the schema; with it, the field opens as choices. */
  hints?: ExpressionHints;
}

/** An expression as IF/THEN conditions and an ELSE, or as choices when the schema says what fits. */
export function ExpressionEditor({ value, onChange, readOnly = false, hints }: ExpressionEditorProps) {
  const { t } = useTranslation();
  const [nextKey, setNextKey] = useState(() => nextConditionKey(value.match));
  const [asText, setAsText] = useState(false);

  if (hints && !asText) {
    return (
      <SimpleExpressionEditor
        value={value}
        onChange={onChange}
        hints={hints}
        readOnly={readOnly}
        onEditAsText={() => setAsText(true)}
      />
    );
  }

  const conditions = Object.entries(value.match);
  const hasConditions = conditions.length > 0;

  const add = () => {
    setNextKey(nextKey + 1);
    onChange(withAddedCondition(value, String(nextKey)));
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {conditions.map(([key, condition], i) => (
        <div key={key}>
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className={LABEL}>{t('expression.if', 'IF')}</span>
              <CommittingInput
                value={condition.if}
                onCommit={(text) => onChange(withConditionPart(value, key, 'if', text))}
                disabled={readOnly}
                placeholder={t('expression.condition', 'Condition')}
                className="flex-1"
              />
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(withoutCondition(value, key))}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={LABEL}>{t('expression.then', 'THEN')}</span>
              <CommittingInput
                value={condition.then}
                onCommit={(text) => onChange(withConditionPart(value, key, 'then', text))}
                disabled={readOnly}
                placeholder={t('expression.result', 'Result')}
                className="flex-1"
              />
              {!readOnly && <div className="w-8 shrink-0" />}
            </div>
          </div>
          {i < conditions.length - 1 && <Separator className="my-3" />}
        </div>
      ))}

      {!readOnly && (
        <div className={hints ? 'flex justify-between' : 'flex justify-end'}>
          {hints && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsText(false)} className={SMALL_ACTION}>
              <ListChecks className="h-3 w-3" />
              {t('expression.editAsChoices', 'Edit as choices')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={add} className={SMALL_ACTION}>
            <Plus className="h-3 w-3" />
            {t('expression.addCondition', 'Add condition')}
          </Button>
        </div>
      )}

      {hasConditions && <Separator />}
      <div className="flex items-center gap-2">
        {hasConditions && <span className={LABEL}>{t('expression.else', 'ELSE')}</span>}
        <CommittingInput
          value={value.else}
          onCommit={(text) => onChange(withElse(value, text))}
          disabled={readOnly}
          placeholder={hasConditions ? t('expression.defaultValue', 'Default value') : t('expression.value', 'Value')}
          className="flex-1"
        />
        {!readOnly && hasConditions && <div className="w-8 shrink-0" />}
      </div>
    </div>
  );
}

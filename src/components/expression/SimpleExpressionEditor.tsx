/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: an expression field as choices rather than code (settings-reorg).
 * A value that is one of the field's constants is a dropdown; a condition
 * that is one comparison is "variable / is / value". What can't be shown that
 * way stays text, and "Edit as text" always gives the full IF / THEN / ELSE
 * editor back.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code2, Plus, X } from 'lucide-react';
import { useBufferedValue } from '@/hooks/useBufferedValue';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  constantLabel,
  formatCondition,
  OPERATORS,
  operatorLabel,
  parseCondition,
  summarize,
  variableLabel,
  type ExpressionHints,
  type Operator,
} from './simple';

type Value = { match: Record<string, { if: string; then: string }>; else: string };

const CUSTOM = '__custom__';

function TextInput({
  value,
  onCommit,
  className,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
>) {
  const [local, setLocal] = useBufferedValue(value);
  const commit = () => {
    if (local !== value) onCommit(local);
  };
  return (
    <Input
      {...rest}
      className={cn('font-mono text-[13px]', className)}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

/** A THEN / ELSE value: a choice among the constants, or text when it's something else. */
function ValueField({
  value,
  hints,
  onCommit,
  readOnly,
}: {
  value: string;
  hints: ExpressionHints;
  onCommit: (v: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const isConstant = value.trim() === '' || hints.constants.includes(value.trim());

  if (hints.constants.length === 0 || custom || !isConstant) {
    return (
      <div className="flex flex-1 items-center gap-2">
        <TextInput
          value={value}
          onCommit={(v) => {
            onCommit(v);
            if (hints.constants.includes(v.trim())) setCustom(false);
          }}
          disabled={readOnly}
          placeholder={t('expression.value', 'Value')}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <Select
      value={value.trim() || undefined}
      disabled={readOnly}
      onValueChange={(v) => (v === CUSTOM ? setCustom(true) : onCommit(v))}
    >
      <SelectTrigger className="flex-1">
        <SelectValue placeholder={t('expression.choose', 'Choose…')} />
      </SelectTrigger>
      <SelectContent>
        {hints.constants.map((c) => (
          <SelectItem key={c} value={c}>
            {constantLabel(c)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={CUSTOM}>{t('expression.customValue', 'Custom expression…')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** An IF: "variable / is / value" when it's one comparison, text otherwise. */
function ConditionField({
  text,
  hints,
  onCommit,
  readOnly,
}: {
  text: string;
  hints: ExpressionHints;
  onCommit: (v: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const parsed = parseCondition(text, hints.variables);
  // A new, empty condition starts in the simple form, held here until it has a value to write.
  const [draft, setDraft] = useState<{ variable: string; op: Operator }>({ variable: '', op: '==' });

  if (!parsed && text.trim() !== '') {
    return (
      <TextInput
        value={text}
        onCommit={onCommit}
        disabled={readOnly}
        placeholder={t('expression.condition', 'Condition')}
        className="flex-1"
      />
    );
  }

  const variable = parsed?.variable ?? draft.variable;
  const op: Operator = parsed?.op ?? draft.op;
  const literal = parsed?.value ?? '';
  const write = (next: { variable?: string; op?: Operator; value?: string }) => {
    const c = { variable, op, value: literal, ...next };
    if (!c.variable) return;
    if (c.value === '') {
      setDraft({ variable: c.variable, op: c.op });
      return;
    }
    onCommit(formatCondition(c));
  };

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Select value={variable || undefined} disabled={readOnly} onValueChange={(v) => write({ variable: v })}>
        <SelectTrigger className="w-auto min-w-44 flex-1">
          <SelectValue placeholder={t('expression.chooseVariable', 'Choose what to check…')} />
        </SelectTrigger>
        <SelectContent>
          {hints.variables.map((v) => (
            <SelectItem key={v} value={v}>
              {variableLabel(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={op} disabled={readOnly || !variable} onValueChange={(v) => write({ op: v as Operator })}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((o) => (
            <SelectItem key={o} value={o}>
              {operatorLabel(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TextInput
        value={literal}
        onCommit={(v) => write({ value: v })}
        disabled={readOnly || !variable}
        placeholder={t('expression.conditionValue', 'Value')}
        className="w-40 font-sans"
      />
    </div>
  );
}

export function SimpleExpressionEditor({
  value,
  onChange,
  hints,
  readOnly = false,
  onEditAsText,
}: {
  value: Value;
  onChange: (v: Value) => void;
  hints: ExpressionHints;
  readOnly?: boolean;
  onEditAsText: () => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(value.match);
  const summary = entries.length > 0 ? summarize(value, hints) : null;

  const setRule = (key: string, part: 'if' | 'then', v: string) =>
    onChange({ ...value, match: { ...value.match, [key]: { ...value.match[key], [part]: v } } });
  const addRule = () => {
    const keys = Object.keys(value.match).map(Number).filter(Number.isFinite);
    const key = String(keys.length > 0 ? Math.max(...keys) + 1 : 0);
    onChange({ ...value, match: { ...value.match, [key]: { if: '', then: '' } } });
  };
  const removeRule = (key: string) => {
    const { [key]: _gone, ...rest } = value.match;
    void _gone;
    onChange({ ...value, match: rest });
  };

  const label = 'w-20 shrink-0 text-xs font-medium text-muted-foreground';

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}

      {entries.map(([key, rule]) => (
        <div key={key} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <span className={cn(label, 'pt-2.5')}>{t('expression.when', 'When')}</span>
            <ConditionField text={rule.if} hints={hints} onCommit={(v) => setRule(key, 'if', v)} readOnly={readOnly} />
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeRule(key)}
                aria-label={t('expression.removeCondition', 'Remove condition')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={label}>{t('expression.use', 'Use')}</span>
            <ValueField value={rule.then} hints={hints} onCommit={(v) => setRule(key, 'then', v)} readOnly={readOnly} />
            {!readOnly && <div className="w-9 shrink-0" />}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        {entries.length > 0 && <span className={label}>{t('expression.otherwise', 'Otherwise')}</span>}
        <ValueField
          value={value.else}
          hints={hints}
          onCommit={(v) => onChange({ ...value, else: v })}
          readOnly={readOnly}
        />
        {!readOnly && entries.length > 0 && <div className="w-9 shrink-0" />}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRule}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('expression.addACondition', 'Add a condition')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEditAsText}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Code2 className="h-3 w-3" />
            {t('expression.editAsText', 'Edit as text')}
          </Button>
        </div>
      )}
    </div>
  );
}

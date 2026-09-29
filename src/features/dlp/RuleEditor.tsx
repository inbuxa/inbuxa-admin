/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the form for a DLP rule or a mail flow rule (spec §2.2–§2.4, §3):
 * conditions, exceptions, actions, and the rule in words as it's built.
 * The server checks everything again when it's saved.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { ObjectPicker } from '@/components/common/ObjectPicker';
import { useObjectLabel } from '@/lib/objectOptions';
import { useSchemaStore } from '@/stores/schemaStore';
import { saveRule } from './api';
import { DETECTORS, TEMPLATES, describeRule, type Action, type Condition, type Direction, type Rule } from './model';

/** One entry per line (commas work too). */
function toList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const CONDITION_TYPES: { type: Condition['type']; label: string; dlpOnly?: boolean }[] = [
  { type: 'recipientOutside', label: 'A recipient is outside this server' },
  { type: 'detected', label: 'Contains sensitive data (detectors)', dlpOnly: true },
  { type: 'words', label: 'Contains words or phrases' },
  { type: 'pattern', label: 'Matches a pattern' },
  { type: 'senderAddress', label: 'Sender is…' },
  { type: 'senderDomain', label: 'Sender’s domain is…' },
  { type: 'recipientAddress', label: 'A recipient is…' },
  { type: 'recipientDomain', label: 'A recipient’s domain is…' },
  { type: 'senderGroup', label: 'Sender is in a group' },
  { type: 'recipientGroup', label: 'A recipient is in a group' },
  { type: 'senderTenant', label: 'Sender is in a tenant' },
  { type: 'header', label: 'A header…' },
  { type: 'attachmentExtension', label: 'An attachment ends in…' },
  { type: 'attachmentType', label: 'An attachment’s type is…' },
  { type: 'attachmentName', label: 'An attachment’s name matches…' },
  { type: 'attachmentSizeOver', label: 'An attachment is over a size' },
  { type: 'attachmentCountOver', label: 'More than a number of attachments' },
  { type: 'cantBeInspected', label: 'An attachment can’t be inspected' },
  { type: 'messageSizeOver', label: 'The message is over a size' },
];

function blankCondition(type: Condition['type']): Condition {
  switch (type) {
    case 'senderAddress':
    case 'recipientAddress':
      return { type, addresses: [] };
    case 'senderDomain':
    case 'recipientDomain':
      return { type, domains: [] };
    case 'words':
      return { type, words: [], atLeast: 1 };
    case 'pattern':
      return { type, pattern: '', atLeast: 1 };
    case 'header':
      return { type, name: '', contains: '' };
    case 'attachmentType':
      return { type, types: [] };
    case 'attachmentExtension':
      return { type, extensions: [] };
    case 'attachmentName':
      return { type, pattern: '' };
    case 'attachmentSizeOver':
    case 'messageSizeOver':
      return { type, bytes: 10 * 1024 * 1024 };
    case 'attachmentCountOver':
      return { type, count: 10 };
    case 'detected':
      return { type, detectors: [] };
    case 'senderGroup':
      return { type, groups: [] };
    case 'senderTenant':
      return { type, tenants: [] };
    case 'recipientGroup':
      return { type, groups: [] };
    default:
      return { type: type as 'recipientOutside' };
  }
}

function DetectorPicker({
  value,
  onChange,
}: {
  value: Condition & { type: 'detected' };
  onChange: (c: Condition) => void;
}) {
  const { t } = useTranslation();
  const chosen = new Map(value.detectors.map((d) => [d.id, d.atLeast]));
  const set = (next: Map<string, number>) =>
    onChange({ type: 'detected', detectors: [...next].map(([id, atLeast]) => ({ id, atLeast })) });
  const regions = [...new Set(DETECTORS.map((d) => d.region))];
  return (
    <div className="space-y-2">
      <Select
        value=""
        onValueChange={(id) => {
          const template = TEMPLATES.find((tpl) => tpl.id === id);
          if (!template) return;
          const next = new Map(chosen);
          for (const d of template.detectors) if (!next.has(d)) next.set(d, 1);
          set(next);
        }}
      >
        <SelectTrigger className="w-72">
          <SelectValue placeholder={t('rules.addTemplate', 'Add a template…')} />
        </SelectTrigger>
        <SelectContent>
          {TEMPLATES.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>
              {tpl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="max-h-64 space-y-3 overflow-auto rounded-md border p-2">
        {regions.map((region) => (
          <div key={region}>
            <p className="text-xs font-medium uppercase text-muted-foreground">{region}</p>
            {DETECTORS.filter((d) => d.region === region).map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-0.5 text-sm">
                <Checkbox
                  checked={chosen.has(d.id)}
                  onCheckedChange={(on) => {
                    const next = new Map(chosen);
                    if (on) next.set(d.id, 1);
                    else next.delete(d.id);
                    set(next);
                  }}
                />
                <span className="flex-1">
                  {d.name}
                  {d.needsWord && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t('rules.needsWord', '(with a word nearby)')}
                    </span>
                  )}
                </span>
                {chosen.has(d.id) && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    {t('rules.atLeast', 'at least')}
                    <Input
                      type="number"
                      min={1}
                      className="h-7 w-16"
                      value={chosen.get(d.id)}
                      onChange={(e) => {
                        const next = new Map(chosen);
                        next.set(d.id, Math.max(1, Number(e.target.value) || 1));
                        set(next);
                      }}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function IdChip({ labelObject, id, onRemove }: { labelObject: string; id: string; onRemove: () => void }) {
  const schema = useSchemaStore((s) => s.schema);
  const { label } = useObjectLabel(labelObject, id, schema!);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      {label ?? id}
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Groups or tenants, picked from the directory. */
function IdPicker({
  objectName,
  labelObject,
  ids,
  onChange,
  placeholder,
}: {
  objectName: string;
  labelObject: string;
  ids: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const schema = useSchemaStore((s) => s.schema);
  if (!schema) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => (
        <IdChip key={id} labelObject={labelObject} id={id} onRemove={() => onChange(ids.filter((x) => x !== id))} />
      ))}
      <ObjectPicker
        schema={schema}
        objectName={objectName}
        value=""
        onChange={(id) => {
          if (id && !ids.includes(id)) onChange([...ids, id]);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

function ConditionFields({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
  const { t } = useTranslation();
  const listField = (items: string[], build: (items: string[]) => Condition, hint: string) => (
    <Textarea
      rows={2}
      placeholder={hint}
      defaultValue={items.join('\n')}
      onBlur={(e) => onChange(build(toList(e.target.value)))}
    />
  );
  const count = (n: number, build: (n: number) => Condition) => (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {t('rules.atLeast', 'at least')}
      <Input
        type="number"
        min={1}
        className="w-20"
        value={n}
        onChange={(e) => onChange(build(Math.max(1, Number(e.target.value) || 1)))}
      />
      {t('rules.times', 'times')}
    </label>
  );
  const megabytes = (bytes: number, build: (b: number) => Condition) => (
    <label className="flex items-center gap-2 text-sm">
      <Input
        type="number"
        min={0}
        className="w-28"
        value={Math.round(bytes / (1024 * 1024))}
        onChange={(e) => onChange(build(Math.max(0, Number(e.target.value) || 0) * 1024 * 1024))}
      />
      MB
    </label>
  );
  switch (value.type) {
    case 'senderAddress':
    case 'recipientAddress':
      return listField(value.addresses, (addresses) => ({ type: value.type, addresses }), 'name@example.com');
    case 'senderDomain':
    case 'recipientDomain':
      return listField(value.domains, (domains) => ({ type: value.type, domains }), 'example.com');
    case 'words':
      return (
        <div className="space-y-2">
          {listField(
            value.words,
            (words) => ({ ...value, words }),
            t('rules.wordsHint', 'One word or phrase per line'),
          )}
          {count(value.atLeast, (atLeast) => ({ ...value, atLeast }))}
        </div>
      );
    case 'pattern':
      return (
        <div className="space-y-2">
          <Input
            className="font-mono"
            value={value.pattern}
            onChange={(e) => onChange({ ...value, pattern: e.target.value })}
          />
          {count(value.atLeast, (atLeast) => ({ ...value, atLeast }))}
        </div>
      );
    case 'header':
      return (
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-48"
            placeholder="X-Classification"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
          <Input
            className="flex-1"
            placeholder={t('rules.headerContains', 'contains… (empty: the header exists)')}
            value={value.contains ?? ''}
            onChange={(e) => onChange({ type: 'header', name: value.name, contains: e.target.value || null })}
          />
        </div>
      );
    case 'attachmentType':
      return listField(value.types, (types) => ({ type: 'attachmentType', types }), 'application/zip');
    case 'attachmentExtension':
      return listField(value.extensions, (extensions) => ({ type: 'attachmentExtension', extensions }), 'exe');
    case 'attachmentName':
      return (
        <Input
          className="font-mono"
          value={value.pattern}
          onChange={(e) => onChange({ ...value, pattern: e.target.value })}
        />
      );
    case 'attachmentSizeOver':
    case 'messageSizeOver':
      return megabytes(value.bytes, (bytes) => ({ type: value.type, bytes }));
    case 'attachmentCountOver':
      return (
        <Input
          type="number"
          min={0}
          className="w-24"
          value={value.count}
          onChange={(e) => onChange({ ...value, count: Math.max(0, Number(e.target.value) || 0) })}
        />
      );
    case 'detected':
      return <DetectorPicker value={value} onChange={onChange} />;
    case 'senderGroup':
    case 'recipientGroup':
      return (
        <IdPicker
          objectName="x:Account/Group"
          labelObject="x:Account"
          ids={value.groups}
          onChange={(groups) => onChange({ type: value.type, groups })}
          placeholder={t('rules.pickGroup', 'Add a group…')}
        />
      );
    case 'senderTenant':
      return (
        <IdPicker
          objectName="x:Tenant"
          labelObject="x:Tenant"
          ids={value.tenants}
          onChange={(tenants) => onChange({ type: 'senderTenant', tenants })}
          placeholder={t('rules.pickTenant', 'Add a tenant…')}
        />
      );
    default:
      return null;
  }
}

function ConditionList({
  kind,
  items,
  onChange,
  addLabel,
}: {
  kind: Rule['kind'];
  items: Condition[];
  onChange: (items: Condition[]) => void;
  addLabel: string;
}) {
  const { t } = useTranslation();
  const label = (type: Condition['type']) => CONDITION_TYPES.find((c) => c.type === type)?.label ?? type;
  return (
    <div className="space-y-2">
      {items.map((condition, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t(`rules.cond.${condition.type}`, label(condition.type))}</span>
            <Button variant="ghost" size="icon" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ConditionFields value={condition} onChange={(c) => onChange(items.map((x, j) => (j === i ? c : x)))} />
        </div>
      ))}
      <Select value="" onValueChange={(type) => onChange([...items, blankCondition(type as Condition['type'])])}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder={addLabel} />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_TYPES.filter((c) => kind === 'dlp' || !c.dlpOnly).map((c) => (
            <SelectItem key={c.type} value={c.type}>
              {t(`rules.cond.${c.type}`, c.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const TRANSPORT_ACTIONS: { type: Action['type']; label: string }[] = [
  { type: 'addDisclaimer', label: 'Add a disclaimer' },
  { type: 'prefixSubject', label: 'Start the subject with…' },
  { type: 'addHeader', label: 'Add a header' },
  { type: 'removeHeader', label: 'Remove a header' },
  { type: 'addRecipient', label: 'Send a copy to…' },
  { type: 'redirect', label: 'Send it to someone else instead' },
  { type: 'route', label: 'Send it through a queue' },
  { type: 'refuse', label: 'Refuse it' },
];

function blankAction(type: Action['type']): Action {
  switch (type) {
    case 'addDisclaimer':
      return { type, text: '', position: 'bottom' };
    case 'addHeader':
      return { type, name: '', value: '' };
    case 'removeHeader':
      return { type, name: '' };
    case 'prefixSubject':
      return { type, text: '' };
    case 'addRecipient':
      return { type, address: '' };
    case 'redirect':
      return { type, addresses: [] };
    case 'route':
      return { type, queue: '' };
    case 'refuse':
      return { type, text: '' };
    case 'block':
    case 'warn':
      return { type, notice: '' };
    case 'hold':
      return { type, notice: '', notifySender: true };
  }
}

function ActionFields({ value, onChange }: { value: Action; onChange: (a: Action) => void }) {
  const { t } = useTranslation();
  switch (value.type) {
    case 'addDisclaimer':
      return (
        <div className="space-y-2">
          <Textarea
            rows={3}
            placeholder={t('rules.disclaimerText', 'The disclaimer')}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
          <Textarea
            rows={2}
            className="font-mono text-xs"
            placeholder={t('rules.disclaimerHtml', 'HTML version (optional; the text is used otherwise)')}
            value={value.html ?? ''}
            onChange={(e) => onChange({ ...value, html: e.target.value || null })}
          />
          <Select
            value={value.position}
            onValueChange={(position) => onChange({ ...value, position: position as 'top' | 'bottom' })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom">{t('rules.bottom', 'At the bottom')}</SelectItem>
              <SelectItem value="top">{t('rules.top', 'At the top')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case 'addHeader':
      return (
        <div className="flex gap-2">
          <Input
            className="w-48"
            placeholder="X-Tag"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
          <Input
            className="flex-1"
            value={value.value}
            onChange={(e) => onChange({ ...value, value: e.target.value })}
          />
        </div>
      );
    case 'removeHeader':
      return (
        <Input
          className="w-64"
          placeholder="X-Tag"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      );
    case 'prefixSubject':
      return (
        <Input
          className="w-64"
          placeholder="[External]"
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      );
    case 'addRecipient':
      return (
        <Input
          className="w-72"
          placeholder="archive@example.com"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      );
    case 'redirect':
      return (
        <Textarea
          rows={2}
          placeholder="name@example.com"
          defaultValue={value.addresses.join('\n')}
          onBlur={(e) => onChange({ ...value, addresses: toList(e.target.value) })}
        />
      );
    case 'route':
      return (
        <Input
          className="w-64"
          placeholder={t('rules.queueName', 'Queue name')}
          value={value.queue}
          onChange={(e) => onChange({ ...value, queue: e.target.value })}
        />
      );
    case 'refuse':
      return (
        <Textarea
          rows={2}
          placeholder={t('rules.refuseText', 'What the sender is told')}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      );
    case 'block':
    case 'warn':
    case 'hold':
      return null;
  }
}

function DlpAction({ value, onChange }: { value: Action; onChange: (a: Action) => void }) {
  const { t } = useTranslation();
  const notice = 'notice' in value ? value.notice : '';
  const choices: { type: 'block' | 'warn' | 'hold'; label: string; body: string }[] = [
    {
      type: 'warn',
      label: t('rules.warn', 'Warn'),
      body: t('rules.warnBody', 'The sender sees the notice and may send anyway, giving a reason that’s recorded.'),
    },
    {
      type: 'hold',
      label: t('rules.hold', 'Hold for review'),
      body: t('rules.holdBody', 'It waits under Held mail until a reviewer releases or rejects it.'),
    },
    {
      type: 'block',
      label: t('rules.block', 'Block'),
      body: t('rules.blockBody', 'It isn’t sent, and the sender sees the notice.'),
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((choice) => (
          <button
            key={choice.type}
            type="button"
            onClick={() =>
              onChange(
                choice.type === 'hold' ? { type: 'hold', notice, notifySender: true } : { type: choice.type, notice },
              )
            }
            className={`rounded-md border p-3 text-left text-sm ${value.type === choice.type ? 'border-primary bg-primary/5' : ''}`}
          >
            <p className="font-medium">{choice.label}</p>
            <p className="text-xs text-muted-foreground">{choice.body}</p>
          </button>
        ))}
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t('rules.notice', 'Notice the sender sees')}</span>
        <Textarea rows={2} value={notice} onChange={(e) => onChange({ ...value, notice: e.target.value } as Action)} />
      </label>
      {value.type === 'hold' && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.notifySender ?? false}
            onCheckedChange={(on) => onChange({ ...value, notifySender: on === true })}
          />
          {t('rules.notifySender', 'Tell the sender it’s held')}
        </label>
      )}
    </div>
  );
}

export function RuleEditor({ initial, onClose, onSaved }: { initial: Rule; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [rule, setRule] = useState<Rule>(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const dlp = rule.kind === 'dlp';
  const patch = (next: Partial<Rule>) => setRule((r) => ({ ...r, ...next }));

  const save = async () => {
    setBusy(true);
    try {
      await saveRule(rule, reason);
      toast({ title: t('rules.saved', 'Rule saved') });
      onSaved();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('rules.notSaved', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule.id
              ? t('rules.editTitle', 'Change “{{name}}”', { name: initial.name })
              : dlp
                ? t('rules.newDlp', 'New DLP rule')
                : t('rules.newFlow', 'New mail flow rule')}
          </DialogTitle>
          <DialogDescription>{describeRule(rule)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t('rules.name', 'Name')}</span>
            <Input value={rule.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t('rules.priority', 'Order')}</span>
            <Input
              type="number"
              className="w-24"
              value={rule.priority}
              onChange={(e) => patch({ priority: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Switch checked={rule.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
            {t('rules.enabled', 'On')}
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('rules.description', 'Description (optional)')}</span>
          <Textarea rows={2} value={rule.description} onChange={(e) => patch({ description: e.target.value })} />
        </label>
        {!dlp && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('rules.direction', 'Which mail')}</span>
            <Select value={rule.direction} onValueChange={(direction) => patch({ direction: direction as Direction })}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outgoing">{t('rules.outgoing', 'Mail sent from here')}</SelectItem>
                <SelectItem value="incoming">{t('rules.incoming', 'Mail arriving here')}</SelectItem>
                <SelectItem value="any">{t('rules.any', 'All mail')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('rules.conditions', 'When all of these are true')}</h3>
          <ConditionList
            kind={rule.kind}
            items={rule.conditions}
            onChange={(conditions) => patch({ conditions })}
            addLabel={t('rules.addCondition', 'Add a condition…')}
          />
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('rules.exceptions', 'Except when any of these is true')}</h3>
          <ConditionList
            kind={rule.kind}
            items={rule.exceptions}
            onChange={(exceptions) => patch({ exceptions })}
            addLabel={t('rules.addException', 'Add an exception…')}
          />
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('rules.then', 'Then')}</h3>
          {dlp ? (
            <DlpAction
              value={rule.actions[0] ?? { type: 'warn', notice: '' }}
              onChange={(a) => patch({ actions: [a] })}
            />
          ) : (
            <div className="space-y-2">
              {rule.actions.map((action, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t(
                        `rules.act.${action.type}`,
                        TRANSPORT_ACTIONS.find((a) => a.type === action.type)?.label ?? action.type,
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => patch({ actions: rule.actions.filter((_, j) => j !== i) })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ActionFields
                    value={action}
                    onChange={(a) => patch({ actions: rule.actions.map((x, j) => (j === i ? a : x)) })}
                  />
                </div>
              ))}
              <Select
                value=""
                onValueChange={(type) => patch({ actions: [...rule.actions, blankAction(type as Action['type'])] })}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder={t('rules.addAction', 'Add an action…')} />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_ACTIONS.map((a) => (
                    <SelectItem key={a.type} value={a.type}>
                      {t(`rules.act.${a.type}`, a.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={rule.stopProcessing}
                  onCheckedChange={(on) => patch({ stopProcessing: on === true })}
                />
                {t('rules.stop', 'Stop here: later rules don’t run for this message')}
              </label>
            </div>
          )}
        </section>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('rules.reason', 'Reason, for the audit log (optional)')}</span>
          <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('rules.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !rule.name.trim() || rule.actions.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('rules.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

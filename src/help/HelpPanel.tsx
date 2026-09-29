/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, CircleHelp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSchemaStore } from '@/stores/schemaStore';
import { resolveList, resolveObject, resolveSchema } from '@/lib/schemaResolver';
import { humanize } from '@/lib/humanize';
import type { Schema } from '@/types/schema';
import { fieldHelp, PAGE_HELP } from './texts';
import { manualUrl } from './manual';

interface OptionHelp {
  id: string;
  label: string;
  text: string;
}

/**
 * Everything the panel says about a page: what it's for, what people do
 * there, and every option on its form with its explanation, in form order.
 */
function pageHelp(schema: Schema, viewName: string) {
  const obj = resolveObject(schema, viewName);
  if (!obj) {
    // inbuxa: a page with no object of its own (the Security page) brings its own list
    const own = PAGE_HELP[viewName];
    if (!own) return null;
    return {
      id: viewName,
      about: own.about,
      tasks: own.tasks ?? [],
      options: (own.options ?? []).map((o) => ({ id: `${viewName}.${o.label}`, ...o })),
      optionsTitle: own.optionsTitle,
    };
  }
  const sch = resolveSchema(schema, obj.objectName);
  const ours = PAGE_HELP[viewName] ?? PAGE_HELP[obj.objectName];
  const about =
    ours?.about ?? (schema.objects[obj.objectName] as { description?: string } | undefined)?.description ?? '';

  // A view of one variant (People is x:Account of @type User) shows that variant's options.
  const list = resolveList(schema, viewName, obj.objectName);
  const variantName = (list?.filtersStatic as Record<string, unknown> | undefined)?.['@type'];
  let scope = obj.objectName;
  let fields = sch?.type === 'single' ? sch.fields : null;
  if (sch?.type === 'multiple') {
    const v = sch.variants.find((x) => x.name === variantName) ?? sch.variants.find((x) => x.fields);
    scope = v?.schemaName ?? obj.objectName;
    fields = v?.fields ?? null;
  }
  const form = schema.forms[scope] ?? schema.forms[obj.objectName];
  const order = form?.sections.flatMap((s) => s.fields.map((f) => ({ name: f.name, label: f.label }))) ?? [];
  const names = order.length ? order : Object.keys(fields?.properties ?? {}).map((name) => ({ name, label: '' }));
  const options: OptionHelp[] = [];
  for (const { name, label } of names) {
    const field = fields?.properties[name];
    if (!field || field.update === 'serverSet' || name === '@type') continue;
    const id = `${scope}.${name}`;
    const text = fieldHelp(id, field.description);
    if (text) options.push({ id, label: label || humanize(name), text });
  }
  return {
    id: obj.objectName,
    about,
    tasks: ours?.tasks ?? [],
    options,
    optionsTitle: undefined as string | undefined,
  };
}

/**
 * The "?" at the top of a page: a panel with what the page is for, the
 * things people usually do there, and a plain explanation of every option.
 * The manual link appears once a manual is configured.
 */
export function HelpPanel({ viewName, title }: { viewName: string; title: string }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const [open, setOpen] = useState(false);
  const help = useMemo(() => (schema ? pageHelp(schema, viewName) : null), [schema, viewName]);
  if (!help || (!help.about && help.options.length === 0)) return null;
  const more = manualUrl(help.id);

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl text-muted-foreground hover:text-primary"
              aria-label={t('help.page', 'Help for this page')}
              data-help-id={help.id}
              onClick={() => setOpen(true)}
            >
              <CircleHelp className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('help.page', 'Help for this page')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-auto right-0 top-0 flex h-dvh max-w-md translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:rounded-l-2xl">
          <div className="border-b px-6 pb-4 pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{t('help.label', 'Help')}</p>
            <DialogTitle className="mt-1 text-xl">{title}</DialogTitle>
            {help.about && <DialogDescription className="mt-2 text-sm leading-relaxed">{help.about}</DialogDescription>}
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {help.tasks.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t('help.tasks', 'What people do here')}</h3>
                <ul className="space-y-2">
                  {help.tasks.map((task) => (
                    <li key={task} className="flex gap-2.5 text-sm">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span>{task}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {help.options.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {help.optionsTitle ?? t('help.options', 'The options on this page')}
                </h3>
                <dl className="divide-y rounded-xl border">
                  {help.options.map((o) => (
                    <div key={o.id} className="px-4 py-3" data-help-id={o.id}>
                      <dt className="text-sm font-medium">{o.label}</dt>
                      <dd className="mt-0.5 text-sm text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p]:m-0">
                        <ReactMarkdown>{o.text.replace(/\\n/g, '\n')}</ReactMarkdown>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
          {more && (
            <div className="border-t px-6 py-4">
              <a
                href={more}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t('help.manual', 'Read more in the admin manual')}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

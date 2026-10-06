#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Coffey Labs
// SPDX-License-Identifier: AGPL-3.0-only
//
// Writes the admin manual's reference section: one page per settings object
// in the server's schema, an anchor per option, so every "Learn more" link a
// tooltip or help panel makes (src/help/manual.ts) lands on its own entry.
//
//   node tools/build-manual.mjs --schema ../inbuxa-server/resources/schema/schema.json.gz \
//                               --out ../inbuxa.org/docs-site/docs/reference
//
// The words are the console's own: the help texts in src/help/texts.ts first,
// the schema's descriptions where we haven't written any, and defaults
// described the way the console's tooltips describe them. Page names and
// anchors come from manualPath(), the same function the console links with,
// so the two can't drift apart. Run it again after a schema or help change;
// it rewrites the whole directory.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`usage: build-manual.mjs --schema <schema.json.gz> --out <docs/reference>`);
    process.exit(2);
  }
  return process.argv[i + 1];
}

const schemaPath = resolve(arg('schema'));
const outDir = resolve(arg('out'));
const raw = readFileSync(schemaPath);
const schema = JSON.parse((schemaPath.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));

// The console's modules, through Vite so the @/ paths resolve
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { FIELD_HELP, PAGE_HELP } = await vite.ssrLoadModule('/src/help/texts.ts');
const { describeDefault } = await vite.ssrLoadModule('/src/help/defaults.ts');
const { humanize } = await vite.ssrLoadModule('/src/lib/humanize.ts');
const { manualPage } = await vite.ssrLoadModule('/src/help/manual.ts');
await vite.close();

const WORDS = { on: 'On', off: 'Off', none: 'None' };

/** Text for markdown: angle brackets would read as HTML. */
function md(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/** The schema's descriptions often stop without a full stop. */
function sentence(text) {
  return /[.!?:)]$/.test(text) ? text : `${text}.`;
}

/** Pages link to each other by file, so MkDocs checks every link. */
const link = (name) => `${manualPage(name)}.md`;
const hasPage = (name) => Boolean(schema.fields[name] || schema.schemas[name]);

// --- Where each object is in the console, from the menus ---------------------

const whereInConsole = new Map();
function walk(items, path) {
  for (const item of items ?? []) {
    const container = item.container ?? (item.type === 'container' ? item : null);
    if (container) {
      walk(container.items, [...path, container.name]);
    } else if (item.type === 'link' && item.viewName) {
      const target = schema.objects[item.viewName]?.objectName ?? item.viewName;
      if (!whereInConsole.has(target)) whereInConsole.set(target, [...path, item.name]);
      if (!whereInConsole.has(item.viewName)) whereInConsole.set(item.viewName, [...path, item.name]);
    }
  }
}
for (const layout of schema.layouts) walk(layout.items, [layout.name].filter(Boolean));

// --- What a field holds, in words --------------------------------------------

function typeWords(field) {
  const t = field.type ?? {};
  const enumLabels = (name) =>
    (schema.enums[name] ?? []).map((e) => `${md(e.label ?? e.name)} (\`${e.name}\`)`).join(', ');
  switch (t.type) {
    case 'boolean':
      return 'On or off.';
    case 'number':
      if (t.format === 'duration') return 'A length of time.';
      if (t.format === 'size') return 'A size in bytes (KB, MB and GB are accepted).';
      return 'A number.';
    case 'utcDateTime':
      return 'A date and time.';
    case 'enum':
      return t.enumName ? `One of: ${enumLabels(t.enumName)}.` : 'One of a fixed set of values.';
    case 'object':
      return t.objectName && hasPage(t.objectName)
        ? `Settings of their own: see [${md(title(t.objectName))}](${link(t.objectName)}).`
        : 'Settings of their own.';
    case 'objectList':
      return t.objectName && hasPage(t.objectName)
        ? `A list, each with the settings in [${md(title(t.objectName))}](${link(t.objectName)}).`
        : 'A list.';
    case 'set':
    case 'list': {
      const item = t.class ? typeWords({ type: t.class }) : null;
      return item ? `A list. Each one: ${item.charAt(0).toLowerCase()}${item.slice(1)}` : 'A list of values.';
    }
    case 'map':
      return 'A set of entries, each a key and its value.';
    case 'objectId':
      return t.objectName
        ? hasPage(t.objectName)
          ? `One of your [${md(title(t.objectName))}](${link(t.objectName)}), chosen from a list.`
          : `One of your ${md(humanize(t.objectName.replace(/^x:/, '')).toLowerCase())}s, chosen from a list.`
        : 'Another object, chosen from a list.';
    case 'blobId':
      return 'An uploaded file.';
    case 'string':
      switch (t.format) {
        case 'secret':
        case 'secretText':
          return 'A secret: stored, and never shown again once saved.';
        case 'emailAddress':
          return 'An email address.';
        case 'ipAddress':
          return 'An IP address.';
        case 'ipMask':
        case 'ipNetwork':
          return 'An IP address or network, like 192.0.2.0/24.';
        case 'html':
          return 'HTML.';
        case 'color':
          return 'A color, like #1a7f74.';
        case 'text':
          return 'Text, over several lines if needed.';
        case 'uri':
        case 'url':
          return 'An address (URL).';
        default:
          return 'Text.';
      }
    default:
      if (field.type?.expression || t.type === 'expression') return 'An expression: a value, or rules that pick one.';
      return null;
  }
}

// --- Page titles and what a page is about ----------------------------------

function title(name) {
  const list = schema.lists[name];
  if (list?.title) return list.title;
  const where = whereInConsole.get(name);
  if (where) return where[where.length - 1];
  return humanize(name.replace(/^x:/, '').replace(/\//g, ' '));
}

function about(name) {
  return PAGE_HELP[name]?.about ?? schema.lists[name]?.subtitle ?? schema.objects[name]?.description ?? null;
}

// --- One page -------------------------------------------------------------

/** The fields of a schema, in the console's form order, then any the form doesn't show. */
function orderedFields(scope) {
  const fields = schema.fields[scope];
  if (!fields) return [];
  const form = schema.forms[scope];
  const out = [];
  const seen = new Set();
  for (const section of form?.sections ?? []) {
    for (const f of section.fields ?? []) {
      if (!fields.properties[f.name] || seen.has(f.name)) continue;
      seen.add(f.name);
      out.push({ name: f.name, label: f.label, section: section.title });
    }
  }
  // Fields kept only so old data still opens say so ("Not used: …"); a reader has nothing to set
  const unused = (name) => /^Not used\b/.test(fields.properties[name].description ?? '');
  const rest = Object.keys(fields.properties).filter((name) => !seen.has(name) && !unused(name));
  for (const name of rest) {
    if (fields.properties[name].update !== 'serverSet') out.push({ name, label: null, section: 'Other settings' });
  }
  for (const name of rest) {
    if (fields.properties[name].update === 'serverSet') out.push({ name, label: null, section: 'Set by the server' });
  }
  return out;
}

function fieldEntry(scope, f) {
  const fields = schema.fields[scope];
  const prop = fields.properties[f.name];
  const label = f.label || humanize(f.name);
  const lines = [`### ${md(label)} {#${f.name.toLowerCase()}}`, ''];
  const text = FIELD_HELP[`${scope}.${f.name}`] ?? prop.description;
  if (text) lines.push(sentence(md(text)), '');
  const facts = [];
  const words = typeWords(prop);
  if (words) facts.push(words);
  const def = describeDefault(prop, fields.defaults?.[f.name], schema, WORDS);
  if (def) facts.push(`Default: ${md(def)}.`);
  if (prop.update === 'immutable') facts.push('Set when it’s created; can’t be changed afterwards.');
  if (prop.update === 'serverSet') facts.push('Read only.');
  facts.push(`Name in the API: \`${f.name}\`.`);
  lines.push(facts.join(' '), '');
  return lines.join('\n');
}

function schemaPage(name) {
  const lines = [];
  lines.push(`# ${md(title(name))}`, '');
  const where = whereInConsole.get(name);
  if (where) lines.push(`*In the console: ${where.map(md).join(' › ')}*`, '');
  const text = about(name);
  if (text) lines.push(sentence(md(text)), '');

  const sch = schema.schemas[name];
  if (sch?.type === 'multiple') {
    lines.push('## Kinds', '');
    lines.push('Choose one kind; each has its own settings.', '');
    for (const v of sch.variants) {
      if (v.name.startsWith('Deprecated')) continue;
      lines.push(
        v.schemaName ? `- [${md(v.label)}](${link(v.schemaName)})` : `- ${md(v.label)}: no settings of its own.`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  const scope = sch?.type === 'single' ? sch.schemaName : name;
  const fields = orderedFields(scope);
  let section = undefined;
  for (const f of fields) {
    const heading = f.section;
    if (heading && heading !== section) {
      lines.push(`## ${md(heading)}`, '');
      section = heading;
    }
    lines.push(fieldEntry(scope, f));
  }
  if (fields.length === 0) lines.push('This has no settings of its own.', '');
  return lines.join('\n');
}

/** A page of the console's own, with what it's for (its options live in the code, not the schema). */
function ownPage(name) {
  const help = PAGE_HELP[name];
  const lines = [`# ${md(title(name))}`, ''];
  const where = whereInConsole.get(name);
  if (where) lines.push(`*In the console: ${where.map(md).join(' › ')}*`, '');
  if (help?.about) lines.push(md(help.about), '');
  for (const option of help?.options ?? []) {
    lines.push(`### ${md(option.label)}`, '', md(option.text), '');
  }
  return lines.join('\n');
}

// --- Every page ----------------------------------------------------------

const pages = new Map();
for (const name of Object.keys(schema.schemas)) pages.set(name, () => schemaPage(name));
for (const name of Object.keys(schema.fields)) if (!pages.has(name)) pages.set(name, () => schemaPage(name));
for (const name of Object.keys(PAGE_HELP)) {
  if (pages.has(name) || schema.schemas[name]) continue;
  const obj = schema.objects[name];
  if (obj?.type === 'view') continue;
  pages.set(name, () => ownPage(name));
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const written = [];
for (const [name, render] of pages) {
  const file = `${manualPage(name)}.md`;
  writeFileSync(join(outDir, file), `${render()}\n`);
  written.push({ name, file });
}

// The index: the console's menus first, then everything else
const index = [
  '# Reference',
  '',
  'Every setting in the console, page by page: what it does, what it’s set to unless you change it, and the name the API uses. The **Learn more** link in a tooltip or a page’s help panel opens its entry here.',
  '',
  'These pages are generated from the server’s own description of its settings, with the console’s help text. To set things up step by step, start with [Run it](../run/topology.md) instead.',
  '',
];
const listed = new Set();
const groups = new Map();
for (const { name, file } of written) {
  const where = whereInConsole.get(name);
  if (!where) continue;
  const group = where.slice(0, -1).join(' › ') || 'Console';
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push({ name, file });
  listed.add(name);
}
// In the order the menus run, and each menu's items in theirs
const menuOrder = [...whereInConsole.keys()];
const rank = (name) => {
  const i = menuOrder.indexOf(name);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};
for (const entries of groups.values()) entries.sort((a, b) => rank(a.name) - rank(b.name));
const ordered = [...groups.entries()].sort((a, b) => rank(a[1][0].name) - rank(b[1][0].name));
for (const [group, entries] of ordered) {
  index.push(`## ${md(group)}`, '');
  for (const e of entries) index.push(`- [${md(title(e.name))}](${e.file})`);
  index.push('');
}
const rest = written.filter((w) => !listed.has(w.name)).sort((a, b) => title(a.name).localeCompare(title(b.name)));
if (rest.length) {
  index.push('## Settings inside other settings', '');
  index.push('Kinds and parts that appear inside the pages above.', '');
  for (const e of rest) index.push(`- [${md(title(e.name))}](${e.file})`);
  index.push('');
}
writeFileSync(join(outDir, 'index.md'), `${index.join('\n')}\n`);

console.log(`wrote ${written.length} pages and an index to ${outDir}`);

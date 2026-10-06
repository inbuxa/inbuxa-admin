#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * inbuxa: keeps src/i18n/en.json the whole English catalog. The console's
 * strings are written inline, `t('key', 'English')`, so a page reads well in
 * code; a translation needs them in one file. This finds every such call and
 * adds the ones en.json lacks, with their English. It never changes a string
 * en.json already has: that one is what people see.
 *
 *   node tools/i18n-extract.mjs          add what's missing
 *   node tools/i18n-extract.mjs --check  fail if anything is missing (CI)
 *
 * Understood: t('k', 'text'), t('k', 'text', {…}), t('k', {defaultValue}),
 * and plurals, t('k', {count, defaultValue_one, defaultValue_other}), which
 * become k_one and k_other. A key built at run time can't be read and is
 * skipped; so is a call with no English, which en.json must already hold.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src');
const catalogPath = join(srcDir, 'i18n', 'en.json');
const check = process.argv.includes('--check');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const text = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;

function objectStrings(node) {
  const out = {};
  if (!node || !ts.isObjectLiteralExpression(node)) return out;
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined;
    const value = text(p.initializer);
    if (name && value !== undefined) out[name] = value;
  }
  return out;
}

/** Every key the code gives English for: key -> { text, where }. */
export function extract() {
  const found = new Map();
  const add = (key, value, where) => {
    const seen = found.get(key);
    if (!seen) found.set(key, { text: value, where });
  };
  for (const path of files(srcDir)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isT =
          (ts.isIdentifier(callee) && callee.text === 't') ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === 't');
        const key = isT ? text(node.arguments[0]) : undefined;
        if (key) {
          const where = `${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          const second = node.arguments[1];
          const direct = text(second);
          if (direct !== undefined) {
            add(key, direct, where);
          } else {
            const o = objectStrings(second);
            if (o.defaultValue !== undefined) add(key, o.defaultValue, where);
            for (const [k, v] of Object.entries(o)) {
              const m = /^defaultValue_(zero|one|two|few|many|other)$/.exec(k);
              if (m) add(`${key}_${m[1]}`, v, where);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

function lookup(catalog, key) {
  let at = catalog;
  for (const part of key.split('.')) {
    if (at === null || typeof at !== 'object' || !(part in at)) return undefined;
    at = at[part];
  }
  return at;
}

/** Puts a string at a dotted key; false if a parent is already a string. */
function place(catalog, key, value) {
  const parts = key.split('.');
  let at = catalog;
  for (const part of parts.slice(0, -1)) {
    if (!(part in at)) at[part] = {};
    if (typeof at[part] !== 'object' || at[part] === null) return false;
    at = at[part];
  }
  const last = parts[parts.length - 1];
  if (typeof at[last] === 'object' && at[last] !== null) return false;
  at[last] = value;
  return true;
}


const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const missing = [];
const clashes = [];
for (const [key, { text: value, where }] of extract()) {
  if (lookup(catalog, key) !== undefined) continue;
  missing.push({ key, where });
  if (!check && !place(catalog, key, value)) clashes.push({ key, where });
}

if (check) {
  if (missing.length > 0) {
    for (const m of missing.slice(0, 20)) console.error(`missing from en.json: ${m.key} (${m.where})`);
    if (missing.length > 20) console.error(`…and ${missing.length - 20} more`);
    console.error('Run: node tools/i18n-extract.mjs');
    process.exit(1);
  }
  console.log('en.json has every string');
} else {
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`added ${missing.length - clashes.length} strings to en.json`);
  for (const c of clashes) console.error(`not added, the key is also a group: ${c.key} (${c.where})`);
  if (clashes.length > 0) process.exit(1);
}

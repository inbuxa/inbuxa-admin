/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Opening a Sieve script in the playground that ships with the console
 * (`tools/sieve-playground`). The script travels in the link's fragment, so
 * it never leaves the browser, and runs under the limits of the interpreter
 * that runs it on the server (sieveLimits.ts).
 */
import { fetchPlaygroundSettings, type SieveInterpreter } from './sieveLimits';

/** The playground beside the console, at its content-hashed path. */
export const playgroundUrl = (): string => new URL(__SIEVE_PLAYGROUND__, document.baseURI).href;

/** Which field holds the script, for each object that has one. */
const SCRIPT_FIELD: Record<string, string> = {
  'x:SieveSystemScript': 'contents',
  'x:SieveUserScript': 'contents',
  SieveScript: 'blobId',
};

export const isSieveScriptField = (objectName: string, fieldName: string): boolean =>
  SCRIPT_FIELD[objectName] === fieldName;

async function deflateRaw(text: string): Promise<Uint8Array> {
  const compressed = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  // In slices, so a large script doesn't overflow the argument list.
  for (let at = 0; at < bytes.length; at += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 32_768));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * A playground link holding one workspace: the script as its `main` entry,
 * no test messages, and the interpreter settings. This is the playground's
 * format version 1, deflated and base64url-encoded into `#w=`.
 */
export async function sievepadLink(
  name: string,
  source: string,
  settings: Record<string, unknown> = {},
  base = playgroundUrl(),
): Promise<string> {
  const workspace = {
    v: 1,
    name: name.slice(0, 80),
    scripts: [{ name: 'main', source: source.replaceAll('\r\n', '\n') }],
    messages: [],
    settings,
  };
  return `${base}#w=${base64Url(await deflateRaw(JSON.stringify(workspace)))}`;
}

/**
 * Opens the script in a new tab. The tab opens first, while the click still
 * counts as the reader's, and is pointed at the link once it is built.
 */
export async function openInSievepad(name: string, source: string, interpreter: SieveInterpreter): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  let link: string;
  try {
    link = await sievepadLink(name, source, await fetchPlaygroundSettings(interpreter));
  } catch (err) {
    tab?.close();
    throw err;
  }
  if (tab) tab.location.replace(link);
  else window.open(link, '_blank', 'noopener,noreferrer');
}

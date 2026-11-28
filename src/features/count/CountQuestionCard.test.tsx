/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { JmapMethodCall, JmapMethodResponse } from '@/types/jmap';

const mocks = vi.hoisted(() => ({
  jmapRequest: vi.fn<(calls: JmapMethodCall[]) => Promise<JmapMethodResponse[]>>(),
  toast: vi.fn(),
}));

vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'admin',
  jmapRequest: mocks.jmapRequest,
}));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

import { useAccountStore } from '@/stores/accountStore';
import { CountQuestionCard } from './CountQuestionCard';

let host: HTMLDivElement;
let root: Root;

/** The server's answers: a /get with `decided`, and a /set that succeeds. */
function server(decided: boolean | 'missing') {
  mocks.jmapRequest.mockImplementation(async (calls) => {
    const method = calls[0][0];
    if (method === 'inbuxa:CountSettings/get') {
      if (decided === 'missing') return [['error', { type: 'unknownMethod' }, '0']];
      return [[method, { list: [{ id: 'singleton', enabled: false, decided, preview: '{}' }] }, '0']];
    }
    return [[method, { updated: { singleton: null } }, '0']];
  });
}

async function mount() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <CountQuestionCard />
      </MemoryRouter>,
    ),
  );
}

const buttons = () => [...host.querySelectorAll('button')];
const button = (label: string) => buttons().find((b) => b.textContent === label)!;
const sets = () =>
  mocks.jmapRequest.mock.calls
    .map(([calls]) => calls[0])
    .filter((c) => c[0] === 'inbuxa:CountSettings/set')
    .map((c) => (c[1] as { update: { singleton: unknown } }).update.singleton);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.jmapRequest.mockReset();
  mocks.toast.mockReset();
  useAccountStore.setState({ permissions: ['sysTracerGet', 'sysTracerUpdate'] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the one-time count question', () => {
  it('asks while the server says it is unanswered, with a link to what is sent', async () => {
    server(false);
    await mount();
    expect(host.textContent).toContain('Help count inbuxa servers?');
    const link = host.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/Settings/CustomComponent/ServerCount');
  });

  it('gives both answers the same variant and size', async () => {
    server(false);
    await mount();
    const yes = button('Count this server');
    const no = button('No thanks');
    expect(yes.dataset.variant).toBe(no.dataset.variant);
    expect(yes.dataset.size).toBe(no.dataset.size);
    expect(yes.className).toBe(no.className);
  });

  it('is not asked once answered', async () => {
    server(true);
    await mount();
    expect(host.innerHTML).toBe('');
  });

  it('is not asked by a server without the setting', async () => {
    server('missing');
    await mount();
    expect(host.innerHTML).toBe('');
  });

  it('is not asked of an account that cannot change it', async () => {
    server(false);
    useAccountStore.setState({ permissions: ['sysTracerGet'] });
    await mount();
    expect(host.innerHTML).toBe('');
    expect(mocks.jmapRequest).not.toHaveBeenCalled();
  });

  it('turns counting on and goes away on "Count this server"', async () => {
    server(false);
    await mount();
    await act(async () => button('Count this server').click());
    expect(sets()).toEqual([{ enabled: true, decided: true }]);
    expect(host.innerHTML).toBe('');
  });

  it('records the answer, counting off, and goes away on "No thanks"', async () => {
    server(false);
    await mount();
    await act(async () => button('No thanks').click());
    expect(sets()).toEqual([{ enabled: false, decided: true }]);
    expect(host.innerHTML).toBe('');
  });

  it('stays when the answer is not saved', async () => {
    server(false);
    await mount();
    mocks.jmapRequest.mockResolvedValue([['error', { type: 'serverFail', description: 'down' }, '0']]);
    await act(async () => button('No thanks').click());
    expect(host.textContent).toContain('Help count inbuxa servers?');
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});

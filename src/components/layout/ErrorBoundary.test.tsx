/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';

let failing = true;
function Fragile() {
  if (failing) throw new Error('the part broke');
  return <p>all good</p>;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  failing = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows what failed and lets it be tried again', () => {
    act(() =>
      root.render(
        <ErrorBoundary>
          <Fragile />
        </ErrorBoundary>,
      ),
    );
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Something went wrong');
    expect(alert?.textContent).toContain('the part broke');
    expect(console.error).toHaveBeenCalledWith('[ErrorBoundary] Caught error:', expect.any(Error), expect.anything());

    failing = false;
    act(() => host.querySelector('button')!.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toBe('all good');
  });

  it('shows its own fallback when given one', () => {
    act(() =>
      root.render(
        <ErrorBoundary fallback={<p>fallback</p>}>
          <Fragile />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('fallback');
  });

  it('draws its children while nothing fails', () => {
    failing = false;
    act(() =>
      root.render(
        <ErrorBoundary>
          <Fragile />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toBe('all good');
  });
});

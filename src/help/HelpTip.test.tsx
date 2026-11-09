/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HelpTip } from './HelpTip';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<HelpTip text="What this option does." />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const button = () => host.querySelector('button')!;
const tip = () => document.body.querySelector('[data-slot="popover-content"]');

// React's onPointerEnter and onPointerLeave come from over and out events
function pointer(type: string, pointerType: string) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType });
  act(() => {
    button().dispatchEvent(event);
  });
}

// What a tap or a click delivers to the button
function tap(pointerType = 'touch') {
  pointer('pointerdown', pointerType);
  pointer('pointerup', pointerType);
  act(() => button().click());
}

describe('HelpTip', () => {
  it('opens on a tap and closes on the next one (#179)', () => {
    expect(tip()).toBeNull();
    tap();
    expect(tip()?.textContent).toContain('What this option does.');
    tap();
    expect(tip()).toBeNull();
  });

  it('closes on Escape', () => {
    tap();
    expect(tip()).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(tip()).toBeNull();
  });

  it('opens on hover with a mouse, and a click keeps it open', () => {
    vi.useFakeTimers();
    pointer('pointerover', 'mouse');
    act(() => vi.advanceTimersByTime(200));
    expect(tip()).not.toBeNull();
    tap('mouse');
    pointer('pointerout', 'mouse');
    act(() => vi.advanceTimersByTime(500));
    expect(tip()).not.toBeNull();
  });

  it('closes when the mouse leaves a tip that hovering opened', () => {
    vi.useFakeTimers();
    pointer('pointerover', 'mouse');
    act(() => vi.advanceTimersByTime(200));
    expect(tip()).not.toBeNull();
    pointer('pointerout', 'mouse');
    act(() => vi.advanceTimersByTime(500));
    expect(tip()).toBeNull();
  });

  it('does not open on a touch pointer entering', () => {
    vi.useFakeTimers();
    pointer('pointerover', 'touch');
    act(() => vi.advanceTimersByTime(500));
    expect(tip()).toBeNull();
  });
});

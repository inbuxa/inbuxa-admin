/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface Tile<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk): lay the items out in a
 * w×h box, each with area proportional to its value, keeping tiles as close
 * to square as the values allow. Items with no value get no tile.
 */
export function squarify<T>(items: T[], value: (item: T) => number, w: number, h: number): Tile<T>[] {
  const nodes = items
    .map((item) => ({ item, v: Math.max(0, value(item)) }))
    .filter((n) => n.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = nodes.reduce((s, n) => s + n.v, 0);
  if (total === 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const areas = nodes.map((n) => ({ item: n.item, a: n.v * scale }));

  const out: Tile<T>[] = [];
  let x = 0;
  let y = 0;
  let rw = w;
  let rh = h;

  const worst = (row: { a: number }[], side: number) => {
    const sum = row.reduce((s, r) => s + r.a, 0);
    const max = Math.max(...row.map((r) => r.a));
    const min = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  const place = (row: { item: T; a: number }[]) => {
    const sum = row.reduce((s, r) => s + r.a, 0);
    if (rw >= rh) {
      // A column on the left.
      const cw = sum / rh;
      let cy = y;
      for (const r of row) {
        const th = r.a / cw;
        out.push({ item: r.item, x, y: cy, w: cw, h: th });
        cy += th;
      }
      x += cw;
      rw -= cw;
    } else {
      // A row along the top.
      const ch = sum / rw;
      let cx = x;
      for (const r of row) {
        const tw = r.a / ch;
        out.push({ item: r.item, x: cx, y, w: tw, h: ch });
        cx += tw;
      }
      y += ch;
      rh -= ch;
    }
  };

  let row: { item: T; a: number }[] = [];
  for (const node of areas) {
    const side = Math.min(rw, rh);
    if (row.length === 0 || worst([...row, node], side) <= worst(row, side)) {
      row.push(node);
    } else {
      place(row);
      row = [node];
    }
  }
  if (row.length) place(row);
  return out;
}

import { describe, it, expect } from 'vitest';
import {
  HAND_SIZE,
  SET_SIZE,
  dealHands,
  fullSet,
  hasAnyPlayable,
  parseTile,
  parseTiles,
  pipSum,
  placeOnLeft,
  placeOnRight,
  removeTile,
  serializeTile,
  serializeTiles,
  shuffle,
  tileEquals,
  tilePlayability,
  type Tile,
} from './dominoes';

describe('fullSet', () => {
  it('contains all 28 unique double-six tiles', () => {
    const set = fullSet();
    expect(set.length).toBe(SET_SIZE);
    const keys = new Set(set.map((t) => `${t[0]}-${t[1]}`));
    expect(keys.size).toBe(SET_SIZE);
  });

  it('includes both extremes 0-0 and 6-6', () => {
    const set = fullSet();
    expect(set.some((t) => tileEquals(t, [0, 0]))).toBe(true);
    expect(set.some((t) => tileEquals(t, [6, 6]))).toBe(true);
  });
});

describe('shuffle', () => {
  it('preserves contents', () => {
    const inp = [1, 2, 3, 4, 5];
    const out = shuffle(inp, mulberry32(42));
    expect(out.slice().sort()).toEqual(inp);
  });

  it('does not mutate input', () => {
    const inp = [1, 2, 3];
    shuffle(inp, mulberry32(1));
    expect(inp).toEqual([1, 2, 3]);
  });
});

describe('dealHands', () => {
  it('deals HAND_SIZE tiles to each player from the full set, no duplicates', () => {
    const { p1, p2 } = dealHands(mulberry32(7));
    expect(p1.length).toBe(HAND_SIZE);
    expect(p2.length).toBe(HAND_SIZE);
    const all = [...p1, ...p2].map((t) => `${t[0]}-${t[1]}`);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('tileEquals', () => {
  it('treats reversed orientations as the same tile', () => {
    expect(tileEquals([3, 5], [5, 3])).toBe(true);
    expect(tileEquals([0, 0], [0, 0])).toBe(true);
    expect(tileEquals([3, 5], [4, 5])).toBe(false);
  });
});

describe('pipSum', () => {
  it('sums all pips across a hand', () => {
    expect(pipSum([])).toBe(0);
    expect(pipSum([[1, 2], [3, 4], [0, 0]])).toBe(10);
  });
});

describe('tilePlayability', () => {
  it('returns both true on an empty board (null ends)', () => {
    expect(tilePlayability([3, 5], null, null)).toEqual({ left: true, right: true });
  });

  it('returns the per-side match flags against the exposed ends', () => {
    expect(tilePlayability([3, 5], 3, 6)).toEqual({ left: true, right: false });
    expect(tilePlayability([3, 5], 1, 5)).toEqual({ left: false, right: true });
    expect(tilePlayability([3, 5], 3, 5)).toEqual({ left: true, right: true });
    expect(tilePlayability([3, 5], 1, 2)).toEqual({ left: false, right: false });
  });
});

describe('hasAnyPlayable', () => {
  it('is true when at least one tile matches either end', () => {
    expect(hasAnyPlayable([[3, 5], [1, 2]], 0, 2)).toBe(true);
    expect(hasAnyPlayable([[3, 5], [1, 4]], 0, 6)).toBe(false);
  });
  it('is true on an empty board if hand is non-empty', () => {
    expect(hasAnyPlayable([[3, 5]], null, null)).toBe(true);
    expect(hasAnyPlayable([], null, null)).toBe(false);
  });
});

describe('placeOnRight / placeOnLeft', () => {
  it('appends/prepends with correct orientation and new end', () => {
    const r = placeOnRight([[3, 5]], [5, 2], 5);
    expect(r).not.toBe(null);
    expect(r!.board).toEqual([[3, 5], [5, 2]]);
    expect(r!.newRightEnd).toBe(2);

    const r2 = placeOnRight([[3, 5]], [2, 5], 5);
    expect(r2!.board).toEqual([[3, 5], [5, 2]]);
    expect(r2!.newRightEnd).toBe(2);

    const l = placeOnLeft([[3, 5]], [1, 3], 3);
    expect(l!.board).toEqual([[1, 3], [3, 5]]);
    expect(l!.newLeftEnd).toBe(1);

    const l2 = placeOnLeft([[3, 5]], [3, 1], 3);
    expect(l2!.board).toEqual([[1, 3], [3, 5]]);
    expect(l2!.newLeftEnd).toBe(1);
  });

  it('returns null when the tile does not match', () => {
    expect(placeOnRight([[3, 5]], [1, 2], 5)).toBe(null);
    expect(placeOnLeft([[3, 5]], [1, 2], 3)).toBe(null);
  });
});

describe('removeTile', () => {
  it('removes the matching tile by value regardless of orientation', () => {
    const hand: Tile[] = [[3, 5], [1, 2], [6, 6]];
    expect(removeTile(hand, [5, 3])).toEqual([[1, 2], [6, 6]]);
    expect(removeTile(hand, [6, 6])).toEqual([[3, 5], [1, 2]]);
  });
  it('returns the same hand when tile is not present', () => {
    const hand: Tile[] = [[3, 5]];
    expect(removeTile(hand, [1, 2])).toEqual(hand);
  });
});

describe('serialize / parse round-trip', () => {
  it('round-trips a single tile', () => {
    expect(parseTile(serializeTile([3, 5]))).toEqual([3, 5]);
    expect(parseTile(serializeTile([0, 0]))).toEqual([0, 0]);
  });
  it('rejects bogus strings', () => {
    expect(parseTile('foo')).toBe(null);
    expect(parseTile('9-1')).toBe(null);
    expect(parseTile(42)).toBe(null);
  });
  it('round-trips a chain of tiles', () => {
    const chain: Tile[] = [[3, 5], [5, 2], [2, 6]];
    expect(parseTiles(serializeTiles(chain))).toEqual(chain);
  });
  it('parses empty as []', () => {
    expect(parseTiles('')).toEqual([]);
    expect(parseTiles(null)).toEqual([]);
  });
  it('skips invalid segments without crashing', () => {
    expect(parseTiles('3-5|foo|2-6')).toEqual([[3, 5], [2, 6]]);
  });
});

// Deterministic PRNG so shuffle tests are reproducible without leaking time-based flakiness.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
